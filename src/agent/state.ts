import { MessagesAnnotation, Annotation } from '@langchain/langgraph'
import type { ScoreTemplate } from '../types/scoreTemplate.js'   // ← 新增这行

export const MainState = Annotation.Root({
  ...MessagesAnnotation.spec,

  intent: Annotation<'consult' | 'apply' | 'insufficient'>({ reducer: (_, x) => x, default: () => 'consult' }),
  missingInfo: Annotation<string[]>({ reducer: (_, x) => x, default: () => [] }),
  documentText: Annotation<string>({ reducer: (_, x) => x, default: () => '' }),

  checkResults: Annotation<string[]>({
    reducer: (old, newVal) => [...(old ?? []), ...(newVal ?? [])],
    default: () => []
  }),

  retrievedContext: Annotation<string>({ reducer: (_, x) => x, default: () => '' }),
  answerDraft: Annotation<string>({ reducer: (_, x) => x, default: () => '' }),

  // ↓↓↓ 以下 2 个字段是新增的 ↓↓↓
  templates: Annotation<ScoreTemplate[]>({ reducer: (_, x) => x, default: () => [] }),
  policyContext: Annotation<string>({ reducer: (_, x) => x, default: () => '' }),
})

export type MainStateType = typeof MainState.State
export const ApplyState = MainState
export type ApplyStateType = MainStateType
export const ConsultState = MainState
export type ConsultStateType = MainStateType