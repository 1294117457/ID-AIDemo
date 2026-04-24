// ─── Layer 4 Node: Classify & AskForMore ──────────────────────────────────────
// 属于主图的两个节点：意图分类 + 追问补全

import { HumanMessage, AIMessage } from '@langchain/core/messages'
import { interrupt } from '@langchain/langgraph'
import { z } from 'zod'
import { createChatModel } from '../model.js'
import { classifyPrompt, contextualAskPrompt } from '../prompts.js'
import type { MainStateType } from '../state.js'

// ── classifyNode ──────────────────────────────────────────────────────────────

const ClassifySchema = z.object({
  intent: z.enum(['consult', 'apply', 'insufficient'])
          .describe('如果是咨询政策为consult；如果想要申请加分但欠缺赛事名称/时间/等级信息为insufficient；如果要申请且信息完整为apply'),
  missing: z.array(z.string())
            .describe('只有在 intent 为 insufficient 时，列出缺失的字段'),
  documentText: z.string()
                .describe('只有在 intent 为 apply 时，提取用户用来申请的完整材料原文'),
})

export async function classifyNode(state: MainStateType): Promise<Partial<MainStateType>> {
  const allUserText = state.messages
    .filter(m => m instanceof HumanMessage)
    .map(m => String(m.content))
    .join('\n')

  const model = createChatModel(0).withStructuredOutput(ClassifySchema)
  const reply = await model.invoke([new HumanMessage(classifyPrompt(allUserText))])

  console.log(`-main:classifyNode: 意图=${reply.intent}, 缺失=${reply.missing}, 材料=${reply.documentText?.slice(0, 10)}...`)

  return {
    intent: reply.intent,
    missingInfo: reply.missing || [],
    documentText: reply.documentText || '',
  }
}

// ── askForMoreNode ────────────────────────────────────────────────────────────

export async function askForMoreNode(state: MainStateType): Promise<Partial<MainStateType>> {
  const allUserText = state.messages
    .filter(m => m instanceof HumanMessage)
    .map(m => String(m.content))
    .join('\n')

  const model = createChatModel(0)
  const reply = await model.invoke([new HumanMessage(contextualAskPrompt(allUserText, state.missingInfo))])
  const question = String(reply.content)

  console.log(`-main:askForMoreNode: ${question}`)

  const userAnswer = interrupt(question)
  return {
    messages: [
      new AIMessage(question),
      new HumanMessage(String(userAnswer)),
    ],
  }
}
