// ─── fetchPolicyNode — RAG 检索加分政策 ─────────────────────────────────────
// 归属：apply 子图
// 输入：state.documentText（用户材料原文）
// 输出：state.policyContext（RAG 检索结果）

import type { ApplyStateType } from '../../../3state/state.js'
import { searchKnowledge } from '../../../8rag/index.js'

export async function fetchPolicyNode(
  state: ApplyStateType
): Promise<Partial<ApplyStateType>> {
  console.log('--apply:fetchPolicy')
  const policyContext = await searchKnowledge(state.documentText.slice(0, 512), 5)
  return { policyContext }
}
