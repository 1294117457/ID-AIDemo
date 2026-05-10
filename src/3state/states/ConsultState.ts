// ─── ConsultState — consult 子图状态 ─────────────────────────────────────────

import { MessagesAnnotation, Annotation } from '@langchain/langgraph'

export const ConsultState = Annotation.Root({
  ...MessagesAnnotation.spec,

  // ── 主图透传 ──────────────────────────────────────────────────
  intent:       Annotation<'consult' | 'apply' | 'insufficient'>({ reducer: (_, x) => x, default: () => 'consult' as const }),
  forcedIntent: Annotation<'consult' | 'apply' | null>({ reducer: (_, x) => x, default: () => null }),
  missingInfo:  Annotation<string[]>({ reducer: (_, x) => x, default: () => [] as string[] }),
  documentText: Annotation<string>({ reducer: (_, x) => x, default: () => '' }),

  // ── consult 专用 ──────────────────────────────────────────────
  // retrievedContext：RAG 检索结果，retrieveNode 填充
  retrievedContext: Annotation<string>({ reducer: (_, x) => x, default: () => '' }),
})

export type ConsultStateType = typeof ConsultState.State
