// ─── ApplyState — apply 子图状态 ─────────────────────────────────────────────
// LangGraph 子图必须与父图共享状态结构，故 ApplyState 在 MainState 基础上扩展

import { MessagesAnnotation, Annotation } from '@langchain/langgraph'
import type { ScoreTemplate } from '../../1common/types/shared.js'

export const ApplyState = Annotation.Root({
  ...MessagesAnnotation.spec,

  // ── 主图透传 ──────────────────────────────────────────────────
  intent:       Annotation<'consult' | 'apply' | 'insufficient'>({ reducer: (_, x) => x, default: () => 'apply' as const }),
  forcedIntent: Annotation<'consult' | 'apply' | null>({ reducer: (_, x) => x, default: () => null }),
  missingInfo:  Annotation<string[]>({ reducer: (_, x) => x, default: () => [] as string[] }),
  documentText: Annotation<string>({ reducer: (_, x) => x, default: () => '' }),

  // ── apply 专用 ────────────────────────────────────────────────
  // templates：加分模板列表（由 MCP 拉取）
  templates: Annotation<ScoreTemplate[]>({ reducer: (_, x) => x, default: () => [] as ScoreTemplate[] }),

  // policyContext：RAG 检索到的政策参考，fetchPolicyNode 填充
  policyContext: Annotation<string>({ reducer: (_, x) => x, default: () => '' }),

  // checkResults：LLM 匹配结果（JSON 字符串数组），analyzeMatchNode 输出
  checkResults: Annotation<string[]>({ reducer: (_, x) => x, default: () => [] as string[] }),
})

export type ApplyStateType = typeof ApplyState.State
