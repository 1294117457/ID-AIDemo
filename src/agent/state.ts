import { MessagesAnnotation, Annotation } from '@langchain/langgraph'

// ── 原 scoreTemplate.ts 内容内联（同时删除 src/types/scoreTemplate.ts 即可）──

export interface TemplateRule {
  id: number
  ruleName: string
  ruleScore: number
  description?: string
}

export interface ScoreTemplate {
  id: number
  templateName: string
  templateType: string   // CONDITION | TRANSFORM
  scoreType: number      // 0/1/2
  templateMaxScore?: number
  reviewCount?: number   // 提交时需要
  description?: string
  rules: TemplateRule[]
}

// ── 用户信息（由 Java 从 users 表查询后随请求传来）──

export interface UserInfo {
  userId: number
  studentId: string       // 从 username 提取的学号
  studentName: string     // users.full_name
  major: string           // users.major
  enrollmentYear: number  // users.grade
}

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

  templates: Annotation<ScoreTemplate[]>({ reducer: (_, x) => x, default: () => [] }),
  policyContext: Annotation<string>({ reducer: (_, x) => x, default: () => '' }),

  userInfo: Annotation<UserInfo | null>({ reducer: (_, x) => x, default: () => null }),
})

export type MainStateType = typeof MainState.State
export const ApplyState = MainState
export type ApplyStateType = MainStateType
export const ConsultState = MainState
export type ConsultStateType = MainStateType
