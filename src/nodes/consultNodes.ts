// ─── Layer 4 Node: Consult Flow ───────────────────────────────────────────────
// 咨询子图的节点：检索知识库 → 生成回答

import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { createChatModel } from '../model.js'
import { searchKnowledge } from '../rag.js'
import { consultSystemPrompt } from '../prompts.js'
import { getSystemRole } from '../config.js'
import type { ConsultStateType } from '../state.js'

export async function retrieveNode(state: ConsultStateType): Promise<Partial<ConsultStateType>> {
  console.log('--consult:retrieve')
  const userMsg = state.messages.filter(m => m instanceof HumanMessage).at(-1)!
  const retrievedContext = await searchKnowledge(String(userMsg.content), 5)
  return { retrievedContext }
}

export async function answerNode(state: ConsultStateType): Promise<Partial<ConsultStateType>> {
  console.log('--consult:answer')
  const userMsg = state.messages.filter(m => m instanceof HumanMessage).at(-1)!
  const model = createChatModel(0.2)
  const reply = await model.invoke([
    new SystemMessage(consultSystemPrompt(getSystemRole(), state.retrievedContext)),
    new HumanMessage(String(userMsg.content)),
  ])
  return { answerDraft: String(reply.content), messages: [reply] }
}
