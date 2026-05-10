// ─── Layer 6: Agent Service — 对话编排与生命周期 ────────────────────────────

import { HumanMessage, AIMessage } from '@langchain/core/messages'
import { Command } from '@langchain/langgraph'
import { getCompiledGraph } from '../5graph/graph.js'
import { getContextMaxMessages } from '../1config/config.js'
import { shouldCompress, compressMessages } from '../4node/memory.js'
import { parseFileToText } from '../rag/index.js'
import { appendMessage, getConversationBySession } from './ConversationService.js'
import fs from 'fs'
import type { AgentInput, AgentResult } from './types.js'
import type { ScoreTemplate } from '../3state/state.js'
import type { Request } from 'express'

let _app: any = null
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
  app: any,
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
      userToken: input.userToken,  // 前端 JWT，透传给 MCP 工具调用
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
    templates:    input.templates ?? [],   // 保留（analyzeMatchNode 也可能用到）
    forcedIntent: input.forcedIntent ?? null,
    // userInfo 不再传入，submitNode 通过 MCP 按需拉取
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

export async function resumeAgent(sessionId: string, supplement: string): Promise<AgentResult> {
  const config = { configurable: { thread_id: sessionId } }
  const app = await getApp()
  const result = await app.invoke(new Command({ resume: supplement }), config)
  const interruptResult = await checkInterrupt(config)
  if (interruptResult) return interruptResult
  return extractResult(result)
}

// 跳过不在前端展示的节点（RAG 检索 / 意图分类 / 中间汇总，这些节点的 token 通过子图聚合输出）
const SKIP_NODES = new Set(['classify', 'ask', 'retrieve', 'fetchPolicy', 'analyzeAndMatch', 'summarize'])

export async function* streamAgent(input: AgentInput): AsyncGenerator<{ type: string; data: any }> {
  const config = {
    configurable: {
      thread_id: input.sessionId,
      userToken: input.userToken,  // 前端 JWT，透传给 MCP 工具调用
      userId:    input.userId,
    }
  }
  const app = await getApp()

  // 追加用户消息到 SQLite
  if (input.userId) {
    safeAppendMessage(input.sessionId, input.userId, 'user', input.userInput)
  }

  const compressResult = await compressIfNeeded(app, config)
  if (compressResult.compressed) {
    yield { type: 'context_compressed', data: { message: `上下文已自动压缩（${compressResult.previousCount} → ${compressResult.newCount} 条），继续对话。` } }
  }

  // 累积 AI 回复，写入 SQLite
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

  // 流结束后写入 AI 回复到 SQLite
  if (input.userId && assistantContent) {
    safeAppendMessage(input.sessionId, input.userId, 'assistant', assistantContent)
  }

  const interruptResult = await checkInterrupt(config)
  if (interruptResult) {
    // interrupt 消息也写入 SQLite
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

  // 写入用户的补充消息到 SQLite
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

  // 流结束后写入 AI 回复
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

function decodeFileName(name: string) {
  return Buffer.from(name, 'latin1').toString('utf8')
}

export interface ParsedAgentParams {
  userInput:    string
  sessionId:    string
  userId:       string | null
  documentText: string
  userToken:    string   // 前端 JWT，透传给 MCP 工具调用
  forcedIntent: 'consult' | 'apply' | null
}

export async function parseAgentParams(req: Request): Promise<ParsedAgentParams> {
  const body = req.body as any
  const userInput  = String(body.message ?? '').trim()
  const sessionId = body.sessionId ?? 'default'
  // x-user-id 由后端从 JWT 中解析后注入（仅用于会话归属校验）
  const userId = (req.headers['x-user-id'] as string) || null

  // Authorization 由后端透传，Agent 用它调用 MCP 接口
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

  // forcedIntent 支持：申请入口传入 intent=apply，强制跳过 LLM 分类
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
    // 验证会话归属（仅在有 userId 且会话已存在时验证）
    // 会话可能尚未创建（新建会话流程中），此时跳过验证直接写入
    if (userId) {
      const conv = getConversationBySession(sessionId)
      if (conv) {
        // 会话已存在于数据库，验证归属
        if (conv.user_id !== userId) {
          console.warn(`[persist] 安全拦截：会话 ${sessionId} 属于 ${conv.user_id}，拒绝用户 ${userId} 写入`)
          return
        }
        console.log(`[persist] ✓ 保存 ${role} 消息，会话=${sessionId}，用户=${userId}，内容长度=${content.length}`)
      } else {
        // 会话尚未创建（如新建会话流程中），直接写入
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
