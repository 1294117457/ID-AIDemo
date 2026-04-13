// ID-AIDemo/src/agents/mainGraph.ts

import { ChatOpenAI } from '@langchain/openai'
import { MainState, MainStateType } from './state.js'
import { applySubgraph } from './subGraphs/applyGraph.js'
import { consultSubgraph } from './subGraphs/consultGraph.js'
import { StateGraph, START, END, interrupt } from '@langchain/langgraph'
import { HumanMessage, AIMessage } from '@langchain/core/messages'
import { z } from 'zod'
import { MemorySaver, Command } from '@langchain/langgraph'
import { getApiKey, getBaseUrl, getChatModel } from '../services/aiConfig.js'
import type { ScoreTemplate } from '../types/scoreTemplate.js'

const checkpointer = new MemorySaver()

// ─── classifyNode ───
// 搬自你 demo 的 mainGraph.ts 第 28-59 行，只改 model 来源
async function classifyNode(state: MainStateType): Promise<Partial<MainStateType>> {
  // 原来的 classifierModel 是全局变量，现在改为函数内创建
  const classifierModel = new ChatOpenAI({
    apiKey: getApiKey(),
    configuration: { baseURL: getBaseUrl() },
    modelName: getChatModel(),
    temperature: 0,                    // demo 里是 0.2，分类任务用 0 更稳定
  }).withStructuredOutput(
    z.object({
      intent: z.enum(['consult', 'apply', 'insufficient']).describe("如果是咨询政策为consult；如果想要申请加分但欠缺赛事名称/时间/等级信息为insufficient；如果要申请且信息完整为apply"),
      missing: z.array(z.string()).describe("只有在 intent 为 insufficient 时，列出缺失的字段"),
      documentText: z.string().describe("只有在 intent 为 apply 时，提取用户用来申请的完整材料原文")
    })
  )

  const allUserText = state.messages
    .filter(m => m instanceof HumanMessage)
    .map(m => m.content)
    .join('\n')

  const messages = [new HumanMessage(`
    分析以下用户的多轮输入，判断意图并提取信息：
    
    【分类与校验规则】：
    1. 如果用户是单纯询问政策或了解相关信息（如"挑战杯能加多少分"），意图记为 consult。
    2. 如果用户表达了"想申请加分"或正在提交比赛凭证，必须严格校验其提供的信息是否完整！
       完整材料必须同时包含以下4个关键要素：【赛事名称】、【奖项等级】、【时间】、【申请人角色】。
       * 特别注意：赛事名称允许使用简称（如"挑战杯"、"互联网+"、"国创"等），只要提到了即可，不要强求全称。
    3. 如果是申请意图，但上述4个要素有任何缺失，意图必须记为 insufficient，并在 missing 数组中准确列出还缺少的要素名称。
    4. 如果是申请意图，且上述4个要素全部齐备，意图记为 apply，并将所有用于申请的原始材料文本合并提取到 documentText 中。
    
    【用户输入历史】：
    ${allUserText}
  `)]

  const reply = await classifierModel.invoke(messages)

  console.log(`-main:classifyNode: 当前收集信息: ${allUserText.replace(/\n/g, ' ')}`)
  console.log(`-main:classifyNode: 意图: ${reply.intent}, 缺失: ${reply.missing}, 材料提取: ${reply.documentText?.slice(0, 10)}...`)

  return {
    intent: reply.intent,
    missingInfo: reply.missing || [],
    documentText: reply.documentText || ''
  }
}

// ─── askForMoreNode ───
// 搬自你 demo 的 mainGraph.ts 第 64-75 行，一字不改
async function askForMoreNode(state: MainStateType): Promise<Partial<MainStateType>> {
  const question = `申请材料不完整，还缺：${state.missingInfo.join('、')}。请补充：`
  console.log(`-main:askForMoreNode: ${question}`)

  const userAnswer = interrupt(question)
  return {
    messages: [
      new AIMessage(question),
      new HumanMessage(String(userAnswer))
    ]
  }
}

// ─── 图结构 ───
// 搬自你 demo 的 mainGraph.ts 第 77-93 行，完全一样
const mainGraph = new StateGraph(MainState)
  .addNode('classify', classifyNode)
  .addNode('ask', askForMoreNode)
  .addNode('applyGraph', applySubgraph)
  .addNode('consultGraph', consultSubgraph)

  .addEdge(START, 'classify')
  .addConditionalEdges('classify', (s) => s.intent, {
    insufficient: 'ask',
    apply: 'applyGraph',
    consult: 'consultGraph'
  })
  .addEdge('ask', 'classify')
  .addEdge('applyGraph', END)
  .addEdge('consultGraph', END)

const app = mainGraph.compile({ checkpointer })

// ─── 以下是新增的 export 接口，供 HTTP 路由调用 ───

export interface AgentInput {
  userInput: string
  documentText?: string
  templates?: ScoreTemplate[]
  sessionId: string
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

  const result = await app.invoke({
    messages: [new HumanMessage(input.userInput)],
    documentText: input.documentText ?? '',
    templates: input.templates ?? [],
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

  const eventStream = app.streamEvents(
    {
      messages: [new HumanMessage(input.userInput)],
      documentText: input.documentText ?? '',
      templates: input.templates ?? [],
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
    yield { type: 'interrupt', data: { question: interruptResult.question } }
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
    yield { type: 'interrupt', data: { question: interruptResult.question } }
    return
  }

  const snapshot = await app.getState(config)
  const state = snapshot.values as any
  yield { type: 'result', data: extractResult(state) }
}