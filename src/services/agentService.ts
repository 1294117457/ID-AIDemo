import { HumanMessage } from '@langchain/core/messages'
import { Command } from '@langchain/langgraph'
import { getCompiledGraph } from '../agent/mainGraph.js'
import type { ScoreTemplate, UserInfo } from '../agent/state.js'

export interface AgentInput {
  userInput: string
  documentText?: string
  templates?: ScoreTemplate[]
  sessionId: string
  userInfo?: UserInfo | null
}

let _app: any = null

async function getApp() {
  if (!_app) _app = await getCompiledGraph()
  return _app
}

/** 从 state 快照中提取通用返回结构 */
function extractResult(state: any) {
  const lastAI = (state.messages ?? [])
    .filter((m: any) => m._getType?.() === 'ai')
    .at(-1)
  return {
    interrupted: false as const,
    reply: String(lastAI?.content ?? ''),
    intent: state.intent ?? 'consult',
    documentText: state.documentText ?? '',
    suggestions: (state.checkResults ?? [])
      .map((r: string) => { try { return JSON.parse(r) } catch { return null } })
      .filter(Boolean),
  }
}

/** 检查 getState 快照中是否有 interrupt，有则返回 interrupt 响应 */
async function checkInterrupt(config: { configurable: { thread_id: string } }) {
  const app = await getApp()
  const snapshot = await app.getState(config)
  const interrupts = (snapshot.tasks ?? []).flatMap((t: any) => t.interrupts ?? [])
  if (interrupts.length > 0) {
    const question = interrupts.map((i: any) => i.value).join('\n')
    return {
      interrupted: true as const,
      question,
      reply: '',
      intent: (snapshot.values as any)?.intent ?? 'insufficient',
      documentText: (snapshot.values as any)?.documentText ?? '',
      suggestions: [],
    }
  }
  return null
}

/**
 * 普通调用（非流式）
 */
export async function invokeAgent(input: AgentInput) {
  const config = { configurable: { thread_id: input.sessionId } }
  const app = await getApp()
  const result = await app.invoke({
    messages: [new HumanMessage(input.userInput)],
    documentText: input.documentText ?? '',
    templates: input.templates ?? [],
    userInfo: input.userInfo ?? null,
  }, config)

  const interruptResult = await checkInterrupt(config)
  if (interruptResult) return interruptResult

  return extractResult(result)
}

/**
 * interrupt 恢复调用
 */
export async function resumeAgent(sessionId: string, supplement: string) {
  const config = { configurable: { thread_id: sessionId } }
  const app = await getApp()
  const result = await app.invoke(
    new Command({ resume: supplement }),
    config
  )

  const interruptResult = await checkInterrupt(config)
  if (interruptResult) return interruptResult

  return extractResult(result)
}

/**
 * 流式调用（SSE） — 使用 streamEvents 逐 token 推送
 */
export async function* streamAgent(input: AgentInput): AsyncGenerator<{ type: string; data: any }> {
  const config = { configurable: { thread_id: input.sessionId } }

  const SKIP_NODES = new Set(['classify', 'analyzeAndMatch'])
  const app = await getApp()
  const eventStream = app.streamEvents(
    {
      messages: [new HumanMessage(input.userInput)],
      documentText: input.documentText ?? '',
      templates: input.templates ?? [],
      userInfo: input.userInfo ?? null,
    },
    { ...config, version: 'v2' }
  )

  for await (const event of eventStream) {
    if (event.event === 'on_chat_model_stream') {
      const node = event.metadata?.langgraph_node
      console.log(`[stream-debug] node=${node}, hasContent=${!!event.data?.chunk?.content}`)
      if (node && SKIP_NODES.has(node)) continue
      const token = event.data?.chunk?.content
      if (token) yield { type: 'token', data: { content: token } }
    }
  }

  const interruptResult = await checkInterrupt(config)
  if (interruptResult) {
    const snapshot = await app.getState(config)
    const state = snapshot.values as any
    const suggestions = (state.checkResults ?? [])
      .map((r: string) => { try { return JSON.parse(r) } catch { return null } })
      .filter(Boolean)
    yield {
      type: 'interrupt',
      data: {
        question: interruptResult.question,
        suggestions,
        requireFiles: suggestions.length > 0,
      }
    }
    return
  }

  const snapshot = await app.getState(config)
  const state = snapshot.values as any
  yield { type: 'result', data: extractResult(state) }
}

/**
 * 流式 resume — interrupt 恢复后继续流式输出
 */
export async function* streamResume(sessionId: string, supplement: string): AsyncGenerator<{ type: string; data: any }> {
  const config = { configurable: { thread_id: sessionId } }

  const SKIP_NODES = new Set(['classify', 'analyzeAndMatch'])
  const app = await getApp()
  const eventStream = app.streamEvents(
    new Command({ resume: supplement }),
    { ...config, version: 'v2' }
  )

  for await (const event of eventStream) {
    if (event.event === 'on_chat_model_stream') {
      const node = event.metadata?.langgraph_node
      console.log(`[stream-debug] node=${node}, hasContent=${!!event.data?.chunk?.content}`)
      if (node && SKIP_NODES.has(node)) continue
      const token = event.data?.chunk?.content
      if (token) yield { type: 'token', data: { content: token } }
    }
  }

  const interruptResult = await checkInterrupt(config)
  if (interruptResult) {
    const snapshot2 = await app.getState(config)
    const state2 = snapshot2.values as any
    const suggestions2 = (state2.checkResults ?? [])
      .map((r: string) => { try { return JSON.parse(r) } catch { return null } })
      .filter(Boolean)
    yield {
      type: 'interrupt',
      data: {
        question: interruptResult.question,
        suggestions: suggestions2,
        requireFiles: suggestions2.length > 0,
      }
    }
    return
  }

  const snapshot = await app.getState(config)
  const state = snapshot.values as any
  yield { type: 'result', data: extractResult(state) }
}