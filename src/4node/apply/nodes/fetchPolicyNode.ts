// ─── fetchPolicyNode — RAG 检索加分政策 ─────────────────────────────────────
// 归属：apply 子图

import type { ApplyStateType } from '../../../3state/index.js'
import { searchKnowledge } from '../../../8rag/index.js'

export async function fetchPolicyNode(
  state: ApplyStateType
): Promise<Partial<ApplyStateType>> {
  console.log('--apply:fetchPolicy')
  const policyContext = await searchKnowledge(state.documentText.slice(0, 512), 5)
  return { policyContext }
}
