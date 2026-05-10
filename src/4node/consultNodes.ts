// ─── Layer 4 Node: Consult Flow ───────────────────────────────────────────────
// 咨询子图的节点：检索知识库 → 生成回答

import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { createChatModel } from '../2model/model.js'
import { searchKnowledge } from '../8rag/index.js'
import { consultSystemPrompt } from '../prompts.js'
import { getSystemRole } from '../1config/config.js'
import type { ConsultStateType } from '../3state/state.js'

/**
 * 检索节点：RAG 向量库检索
 */
export async function retrieveNode(state: ConsultStateType): Promise<Partial<ConsultStateType>> {
  console.log('--consult:retrieve')
  const userMsg = state.messages.filter(m => m instanceof HumanMessage).at(-1)!
  const retrievedContext = await searchKnowledge(String(userMsg.content), 5)
  return { retrievedContext }
}

/**
 * 回答节点：基于检索结果生成回答
 */
export async function answerNode(state: ConsultStateType): Promise<Partial<ConsultStateType>> {
  console.log('--consult:answer')
  const userMsg = state.messages.filter(m => m instanceof HumanMessage).at(-1)!
  const model = createChatModel(0.2)
  const reply = await model.invoke([
    new SystemMessage(consultSystemPrompt(getSystemRole(), state.retrievedContext)),
    new HumanMessage(String(userMsg.content)),
  ])
  return { messages: [reply] }
}
