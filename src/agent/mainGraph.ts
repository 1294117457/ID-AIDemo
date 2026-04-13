import { classifyPrompt } from './prompts.js'
import { MainState, MainStateType } from './state.js'
import { applySubgraph } from './subGraphs/applyGraph.js'
import { consultSubgraph } from './subGraphs/consultGraph.js'
import { StateGraph, START, END, interrupt } from '@langchain/langgraph'
import { HumanMessage, AIMessage } from '@langchain/core/messages'
import { z } from 'zod'
import { SqliteSaver } from '@langchain/langgraph-checkpoint-sqlite'
import path from 'path'
import { fileURLToPath } from 'url'
import {createChatModel} from '../services/llmService.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CHECKPOINT_PATH = path.resolve(__dirname, '../../../data/checkpoints.db')

let checkpointer: SqliteSaver

// ─── classifyNode ───
// 搬自你 demo 的 mainGraph.ts 第 28-59 行，只改 model 来源
async function classifyNode(state: MainStateType): Promise<Partial<MainStateType>> {
  // 原来的 classifierModel 是全局变量，现在改为函数内创建
  const classifierModel = createChatModel(0).withStructuredOutput(
    z.object({
      intent: z.enum(['consult', 'apply', 'insufficient'])
              .describe("如果是咨询政策为consult；如果想要申请加分但欠缺赛事名称/时间/等级信息为insufficient；如果要申请且信息完整为apply"),
      missing: z.array(z.string())
                .describe("只有在 intent 为 insufficient 时，列出缺失的字段"),
      documentText: z.string()
                    .describe("只有在 intent 为 apply 时，提取用户用来申请的完整材料原文")
    })
  )

  const allUserText = state.messages
    .filter(m => m instanceof HumanMessage)
    .map(m => m.content)
    .join('\n')

  const messages = [new HumanMessage(classifyPrompt(allUserText))]

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

export async function getCompiledGraph() {
  if (!checkpointer) {
    checkpointer = SqliteSaver.fromConnString(CHECKPOINT_PATH)
  }
  return mainGraph.compile({ checkpointer })
}