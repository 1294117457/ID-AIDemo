// ─── Layer 6: Agent Service — 对话编排与生命周期 ────────────────────────────

import { HumanMessage, AIMessage } from '@langchain/core/messages'
import { Command } from '@langchain/langgraph'
import { getCompiledGraph } from '../5graph/graph.js'
import { getContextMaxMessages } from '../1config/config.js'
import { shouldCompress, compressMessages } from './memory.js'
import { parseFileToText } from '../8rag/index.js'
import { appendMessage, getConversationBySession } from './ConversationService.js'
import { SKIP_NODES } from '../1common/constants.js'
import { decodeFileName } from '../1common/utils/index.js'
import type { AgentInput, AgentResult } from '../1common/types/shared.js'
import type { Request } from 'express'
import fs from 'fs'

// ── 单例 ────────────────────────────────────────────────────────────────────

let _app: Awaited<ReturnType<typeof getCompiledGraph>> | null = null

async function getApp() {
  if (!_app) _app = await getCompiledGraph()
  return _app
}

// ── 状态提取 ──────────────────────────────────────────────────────────────────

function extractResult(state: any): Omit<AgentResult, 'question'> {
  const lastAI = (state.messages ?? [])
    .filter((m: any) => m._getType?.() === 'ai')
    .at(-1)
  return {
    interrupted:  false as const,
    reply:        String(lastAI?.content ?? ''),
    intent:       state.intent ?? 'consult',
    documentText: state.documentText ?? '',
    suggestions:  (state.checkResults ?? [])
      .map((r: string) => { try { return JSON.parse(r) } catch { return null } })
      .filter(Boolean),
  }
}

async function checkInterrupt(config: { configurable: { thread_id: string } }): Promise<AgentResult | null> {
  const app = await getApp()
  const snapshot = await app.getState(config)
  const interrupts = (snapshot.tasks ?? []).flatMap((t: any) => t.interrupts ?? [])
  if (interrupts.length === 0) return null

  const raw = interrupts[0].value
  if (raw && typeof raw === 'object' && (raw as any).type === 'confirm') {
    const data = raw as { type: 'confirm'; question: string; suggestions: any[] }
    return { interrupted: true, question: data.question, suggestions: data.suggestions ?? [], reply: '', intent: 'apply', documentText: '' }
  }
  const question = typeof raw === 'string' ? raw : String(raw)
  return {
    interrupted:  true,
    question,
    suggestions:  [],
    reply:        '',
    intent:       (snapshot.values as any)?.intent ?? 'insufficient',
    documentText: (snapshot.values as any)?.documentText ?? '',
  }
}

async function compressIfNeeded(
  app: Awaited<ReturnType<typeof getApp>>,
  config: { configurable: { thread_id: string } }
): Promise<{ compressed: boolean; previousCount: number; newCount: number }> {
  const snapshot = await app.getState(config)
  const messages = (snapshot.values as any)?.messages ?? []
  const relevantMessages = messages.filter(
    (m: any) => m._getType?.() === 'human' || m._getType?.() === 'ai'
  ) as (HumanMessage | AIMessage)[]
  const previousCount = relevantMessages.length
  if (!shouldCompress(previousCount)) {
    return { compressed: false, previousCount, newCount: previousCount }
  }
  const compressed = await compressMessages(relevantMessages)
  await app.updateState(config, { messages: compressed })
  const newCount = compressed.length
  console.log(`[memory] compressed ${previousCount} → ${newCount} messages`)
  return { compressed: true, previousCount, newCount }
}

// ── 公开 API ─────────────────────────────────────────────────────────────────

export async function invokeAgent(input: AgentInput): Promise<AgentResult> {
  const config = {
    configurable: {
      thread_id: input.sessionId,
      userToken: input.userToken,
      userId:    input.userId,
    }
  }
  const app = await getApp()
  if (input.userId) {
    safeAppendMessage(input.sessionId, input.userId, 'user', input.userInput)
  }
  await compressIfNeeded(app, config)
  const result = await app.invoke({
    messages:     [new HumanMessage(input.userInput)],
    documentText: input.documentText ?? '',
    templates:    input.templates ?? [],
    forcedIntent: input.forcedIntent ?? null,
  }, config)
  const interruptResult = await checkInterrupt(config)
  if (interruptResult) {
    if (input.userId) {
      safeAppendMessage(input.sessionId, input.userId, 'interrupt', interruptResult.question ?? '', 'interrupt')
    }
    return interruptResult
  }
  if (input.userId && result) {
    const lastAI = (result.messages ?? [])
      .filter((m: any) => m._getType?.() === 'ai')
      .at(-1)
    if (lastAI?.content) {
      safeAppendMessage(input.sessionId, input.userId, 'assistant', String(lastAI.content))
    }
  }
  return extractResult(result)
}

export async function resumeAgent(
  sessionId: string,
  supplement: string,
  userId?: string,
  userToken?: string
): Promise<AgentResult> {
  const config = {
    configurable: {
      thread_id: sessionId,
      userId:    userId,
      userToken: userToken ?? '',
    }
  }
  const app = await getApp()
  const result = await app.invoke(new Command({ resume: supplement }), config)
  const interruptResult = await checkInterrupt(config)
  if (interruptResult) return interruptResult
  return extractResult(result)
}

export async function* streamAgent(input: AgentInput): AsyncGenerator<{ type: string; data: any }> {
  const config = {
    configurable: {
      thread_id: input.sessionId,
      userToken: input.userToken,
      userId:    input.userId,
    }
  }
  const app = await getApp()

  if (input.userId) {
    safeAppendMessage(input.sessionId, input.userId, 'user', input.userInput)
  }

  const compressResult = await compressIfNeeded(app, config)
  if (compressResult.compressed) {
    yield { type: 'context_compressed', data: { message: `上下文已自动压缩（${compressResult.previousCount} → ${compressResult.newCount} 条），继续对话。` } }
  }

  let assistantContent = ''
  const eventStream = app.streamEvents(
    { messages: [new HumanMessage(input.userInput)], documentText: input.documentText ?? '',
      templates: input.templates ?? [], forcedIntent: input.forcedIntent ?? null },
    { ...config, version: 'v2' }
  )

  for await (const event of eventStream) {
    if (event.event === 'on_chat_model_stream') {
      const node = event.metadata?.langgraph_node
      if (node && SKIP_NODES.has(node)) continue
      const token = event.data?.chunk?.content
      if (token) {
        assistantContent += token
        yield { type: 'token', data: { content: token } }
      }
    }
  }

  if (input.userId && assistantContent) {
    safeAppendMessage(input.sessionId, input.userId, 'assistant', assistantContent)
  }

  const interruptResult = await checkInterrupt(config)
  if (interruptResult) {
    if (input.userId) {
      safeAppendMessage(input.sessionId, input.userId, 'interrupt', interruptResult.question ?? '', 'interrupt')
    }
    yield { type: 'interrupt', data: { question: interruptResult.question, suggestions: interruptResult.suggestions, requireFiles: interruptResult.suggestions.length > 0 } }
    return
  }
  const snapshot = await app.getState(config)
  yield { type: 'result', data: extractResult(snapshot.values as any) }
}

export async function* streamResume(sessionId: string, supplement: string, userId?: string, userToken?: string): AsyncGenerator<{ type: string; data: any }> {
  const config = {
    configurable: {
      thread_id: sessionId,
      userToken: userToken ?? '',
      userId:    userId,
    }
  }
  const app = await getApp()

  if (userId) {
    safeAppendMessage(sessionId, userId, 'user', supplement)
  }

  await compressIfNeeded(app, config)

  const eventStream = app.streamEvents(new Command({ resume: supplement }), { ...config, version: 'v2' })

  let assistantContent = ''
  for await (const event of eventStream) {
    if (event.event === 'on_chat_model_stream') {
      const node = event.metadata?.langgraph_node
      if (node && SKIP_NODES.has(node)) continue
      const token = event.data?.chunk?.content
      if (token) {
        assistantContent += token
        yield { type: 'token', data: { content: token } }
      }
    }
  }

  if (userId && assistantContent) {
    safeAppendMessage(sessionId, userId, 'assistant', assistantContent)
  }

  const interruptResult = await checkInterrupt(config)
  if (interruptResult) {
    if (userId) {
      safeAppendMessage(sessionId, userId, 'interrupt', interruptResult.question ?? '', 'interrupt')
    }
    yield { type: 'interrupt', data: { question: interruptResult.question, suggestions: interruptResult.suggestions, requireFiles: interruptResult.suggestions.length > 0 } }
    return
  }
  const snapshot = await app.getState(config)
  yield { type: 'result', data: extractResult(snapshot.values as any) }
}

// ── 参数解析（从 HTTP 请求中提取业务数据）──────────────────────────────────────

export async function parseAgentParams(req: Request) {
  const body = req.body as any
  const userInput  = String(body.message ?? '').trim()
  const sessionId = body.sessionId ?? 'default'
  const userId = (req.headers['x-user-id'] as string) || null

  const authHeader = (req.headers['authorization'] as string) || ''
  const userToken = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : authHeader

  let documentText = ''
  if (req.file) {
    const name = decodeFileName(req.file.originalname)
    const ext  = name.includes('.') ? `.${name.split('.').pop()}` : ''
    documentText = await parseFileToText(req.file.path, ext)
    fs.unlink(req.file.path, () => {})
  }

  const forcedIntent = (body.intent === 'apply' || body.intent === 'consult')
    ? body.intent as 'consult' | 'apply'
    : null

  return { userInput, sessionId, userId, documentText, userToken, forcedIntent }
}

/**
 * 安全写入消息：确保会话属于当前用户，防止串会话
 */
function safeAppendMessage(sessionId: string, userId: string | null, role: string, content: string, msgType = 'message', extraData?: any): void {
  try {
    if (userId) {
      const conv = getConversationBySession(sessionId)
      if (conv) {
        if (conv.user_id !== userId) {
          console.warn(`[persist] 安全拦截：会话 ${sessionId} 属于 ${conv.user_id}，拒绝用户 ${userId} 写入`)
          return
        }
        console.log(`[persist] ✓ 保存 ${role} 消息，会话=${sessionId}，用户=${userId}，内容长度=${content.length}`)
      } else {
        console.log(`[persist] ✓ 保存 ${role} 消息（会话 ${sessionId} 尚未创建），用户=${userId}，内容长度=${content.length}`)
      }
    } else {
      console.log(`[persist] ✓ 保存 ${role} 消息，会话=${sessionId}，用户=匿名，内容长度=${content.length}`)
    }
    appendMessage(sessionId, role, content, msgType, extraData)
  } catch (e) {
    console.error(`[persist] ✗ 保存消息失败，会话=${sessionId}，角色=${role}，错误:`, e)
  }
}
