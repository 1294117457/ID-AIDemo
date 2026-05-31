// ─── answerNode — 基于检索结果生成回答 ─────────────────────────────────────
// 归属：consult 子图节点

import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { createChatModel } from '../../../2model/model.js'
import { consultSystemPrompt } from '../../../1common/prompts.js'
import { getSystemRole } from '../../../1common/config.js'
import type { ConsultState } from '../../../3state/index.js'

export async function answerNode(state: ConsultState): Promise<Partial<ConsultState>> {
  console.log('--consult:answer')
  const userMsg = state.messages.filter((m: any) => m instanceof HumanMessage).at(-1)!
  const model = createChatModel(0.2)
  const reply = await model.invoke([
    new SystemMessage(consultSystemPrompt(getSystemRole(), state.retrievedContext)),
    new HumanMessage(String(userMsg.content)),
  ])
  return { messages: [reply] }
}
