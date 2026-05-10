// ─── classifyNode — 意图分类 ───────────────────────────────────────────────
// 归属：主图节点

import { HumanMessage } from '@langchain/core/messages'
import { z } from 'zod'
import { createChatModel } from '../../../2model/model.js'
import { classifyPrompt } from '../../../1common/prompts.js'
import type { MainState } from '../../../3state/index.js'

const ClassifySchema = z.object({
  intent: z.enum(['consult', 'apply', 'insufficient'])
          .describe('如果是咨询政策为consult；如果想要申请加分但欠缺赛事名称/时间/等级信息为insufficient；如果要申请且信息完整为apply'),
  missing: z.array(z.string())
            .describe('只有在 intent 为 insufficient 时，列出缺失的字段'),
  documentText: z.string()
                .describe('只有在 intent 为 apply 时，提取用户用来申请的完整材料原文'),
})

export async function classifyNode(state: MainState): Promise<Partial<MainState>> {
  // 申请入口优先：forcedIntent 直接指定 intent，跳过 LLM 分类
  if (state.forcedIntent) {
    console.log(`-main:classifyNode: forcedIntent=${state.forcedIntent}，跳过 LLM 分类`)
    return { intent: state.forcedIntent }
  }

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
