// ─── retrieveNode — RAG 向量库检索 ─────────────────────────────────────────
// 归属：consult 子图节点

import { HumanMessage } from '@langchain/core/messages'
import { searchKnowledge } from '../../../rag/index.js'
import type { ConsultState } from '../../../3state/index.js'

export async function retrieveNode(state: ConsultState): Promise<Partial<ConsultState>> {
  console.log('--consult:retrieve')
  const userMsg = state.messages.filter(m => m instanceof HumanMessage).at(-1)!
  const retrievedContext = await searchKnowledge(String(userMsg.content), 5)
  return { retrievedContext }
}
