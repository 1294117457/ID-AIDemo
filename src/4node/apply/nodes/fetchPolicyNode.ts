// ─── fetchPolicyNode — RAG 检索加分政策 ─────────────────────────────────────
// 归属：apply 子图

import type { ApplyState } from '../../../3state/index.js'
import { searchKnowledge } from '../../../rag/index.js'

export async function fetchPolicyNode(
  state: ApplyState
): Promise<Partial<ApplyState>> {
  console.log('--apply:fetchPolicy')
  const policyContext = await searchKnowledge(state.documentText.slice(0, 512), 5)
  return { policyContext }
}
