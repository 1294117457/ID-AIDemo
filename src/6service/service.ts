// ─── Layer 6: Service — 流式+中断桥接 ─────────────────────────────────────────
// 封装 LangGraph 的调用方式（invoke / streamEvents），供 API 层调用

import { HumanMessage, AIMessage } from '@langchain/core/messages'
import { Command } from '@langchain/langgraph'
import { getCompiledGraph } from '../5graph/graph.js'
import { getContextMaxMessages } from '../1config/config.js'
import { shouldCompress, compressMessages } from '../4node/memory.js'
import type { ScoreTemplate, UserInfo } from '../3state/state.js'

export interface AgentInput {
  userInput:    string
  documentText?: string
  templates?:   ScoreTemplate[]
  sessionId:    string
  userInfo?:    UserInfo | null
}

let _app: any = null
async function getApp() {
  if (!_app) _app = await getCompiledGraph()
  return _app
}

// ── 工具函数 ─────────────────────────────────────────────────────────────────

function extractResult(state: any) {
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

async function checkInterrupt(config: { configurable: { thread_id: string } }) {
  const app = await getApp()
  const snapshot = await app.getState(config)
  const interrupts = (snapshot.tasks ?? []).flatMap((t: any) => t.interrupts ?? [])
  if (interrupts.length === 0) return null

  const raw = interrupts[0].value
  if (raw && typeof raw === 'object' && (raw as any).type === 'confirm') {
    const data = raw as { type: 'confirm'; question: string; suggestions: any[] }
    return { interrupted: true as const, question: data.question, suggestions: data.suggestions ?? [], reply: '', intent: 'apply', documentText: '' }
  }
  const question = typeof raw === 'string' ? raw : String(raw)
  return {
    interrupted:  true as const,
    question,
    suggestions:  [],
    reply:        '',
    intent:       (snapshot.values as any)?.intent ?? 'insufficient',
    documentText: (snapshot.values as any)?.documentText ?? '',
  }
}

async function checkContextLimit(config: { configurable: { thread_id: string } }) {
  const app = await getApp()
  const snapshot = await app.getState(config)
  const msgCount = (snapshot.values as any)?.messages?.length ?? 0
  const limit = getContextMaxMessages()
  return { exceeded: msgCount >= limit, msgCount, limit }
}

/**
 * 对话压缩：检查是否需要压缩早期消息，
 * 如果达到阈值则将旧消息压缩为摘要，同时保留最近 5 条完整消息
 */
async function compressIfNeeded(
  app: any,
  config: { configurable: { thread_id: string } }
): Promise<{ compressed: boolean; previousCount: number; newCount: number }> {
  const snapshot = await app.getState(config)
  const messages = (snapshot.values as any)?.messages ?? []

  // 筛选出人类消息和 AI 消息（排除 ToolMessage 等）
  const relevantMessages = messages.filter(
    (m: any) => m._getType?.() === 'human' || m._getType?.() === 'ai'
  ) as (HumanMessage | AIMessage)[]

  const previousCount = relevantMessages.length

  if (!shouldCompress(previousCount)) {
    return { compressed: false, previousCount, newCount: previousCount }
  }

  // 执行压缩
  const compressed = await compressMessages(relevantMessages)

  // 更新 checkpoint 中的消息（保持其他 state 字段不变）
  await app.updateState(config, { messages: compressed })

  const newCount = compressed.length
  console.log(`[memory] compressed ${previousCount} → ${newCount} messages`)

  return { compressed: true, previousCount, newCount }
}

// ── 公开 API ─────────────────────────────────────────────────────────────────

export async function invokeAgent(input: AgentInput) {
  const config = { configurable: { thread_id: input.sessionId } }
  const app = await getApp()

  // 压缩检查：避免上下文超限
  await compressIfNeeded(app, config)

  const result = await app.invoke({
    messages:     [new HumanMessage(input.userInput)],
    documentText: input.documentText ?? '',
    templates:    input.templates ?? [],
    userInfo:     input.userInfo ?? null,
  }, config)
  const interruptResult = await checkInterrupt(config)
  if (interruptResult) return interruptResult
  return extractResult(result)
}

export async function resumeAgent(sessionId: string, supplement: string) {
  const config = { configurable: { thread_id: sessionId } }
  const app = await getApp()
  const result = await app.invoke(new Command({ resume: supplement }), config)
  const interruptResult = await checkInterrupt(config)
  if (interruptResult) return interruptResult
  return extractResult(result)
}

const SKIP_NODES = new Set(['classify', 'analyzeAndMatch', 'ask', 'summarize'])

export async function* streamAgent(input: AgentInput): AsyncGenerator<{ type: string; data: any }> {
  const config = { configurable: { thread_id: input.sessionId } }
  const app = await getApp()

  // 压缩检查：避免上下文超限，自动压缩早期对话
  const compressResult = await compressIfNeeded(app, config)
  if (compressResult.compressed) {
    yield { type: 'context_compressed', data: { message: `上下文已自动压缩（${compressResult.previousCount} → ${compressResult.newCount} 条），继续对话。` } }
  }

  const eventStream = app.streamEvents(
    { messages: [new HumanMessage(input.userInput)], documentText: input.documentText ?? '', templates: input.templates ?? [], userInfo: input.userInfo ?? null },
    { ...config, version: 'v2' }
  )

  for await (const event of eventStream) {
    if (event.event === 'on_chat_model_stream') {
      const node = event.metadata?.langgraph_node
      if (node && SKIP_NODES.has(node)) continue
      const token = event.data?.chunk?.content
      if (token) yield { type: 'token', data: { content: token } }
    }
  }

  const interruptResult = await checkInterrupt(config)
  if (interruptResult) {
    yield { type: 'interrupt', data: { question: interruptResult.question, suggestions: interruptResult.suggestions, requireFiles: interruptResult.suggestions.length > 0 } }
    return
  }
  const snapshot = await app.getState(config)
  yield { type: 'result', data: extractResult(snapshot.values as any) }
}

export async function* streamResume(sessionId: string, supplement: string): AsyncGenerator<{ type: string; data: any }> {
  const config = { configurable: { thread_id: sessionId } }
  const app = await getApp()

  // 压缩检查：resume 时也可能触发压缩
  await compressIfNeeded(app, config)

  const eventStream = app.streamEvents(new Command({ resume: supplement }), { ...config, version: 'v2' })

  for await (const event of eventStream) {
    if (event.event === 'on_chat_model_stream') {
      const node = event.metadata?.langgraph_node
      if (node && SKIP_NODES.has(node)) continue
      const token = event.data?.chunk?.content
      if (token) yield { type: 'token', data: { content: token } }
    }
  }

  const interruptResult = await checkInterrupt(config)
  if (interruptResult) {
    yield { type: 'interrupt', data: { question: interruptResult.question, suggestions: interruptResult.suggestions, requireFiles: interruptResult.suggestions.length > 0 } }
    return
  }
  const snapshot = await app.getState(config)
  yield { type: 'result', data: extractResult(snapshot.values as any) }
}
