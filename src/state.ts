// ─── Layer 3: State — 图里流动的数据结构 ──────────────────────────────────────
// State 是 Agent 的"血液"，定义 Agent 在运行过程中需要记住哪些信息
// Reducer 规律：消息用累加、业务字段用替换 (_, x) => x

import { MessagesAnnotation, Annotation } from '@langchain/langgraph'

// ── 类型定义（内联，避免额外文件） ───────────────────────────────────────────

export interface TemplateRule {
  id:           number
  ruleName:     string
  ruleScore:    number
  description?: string
}

export interface ScoreTemplate {
  id:               number
  templateName:     string
  templateType:     string   // CONDITION | TRANSFORM
  scoreType:        number   // 0/1/2
  templateMaxScore?: number
  reviewCount?:     number
  description?:     string
  rules:            TemplateRule[]
}

export interface UserInfo {
  userId:         number
  studentId:      string
  studentName:    string
  major:          string
  enrollmentYear: number
}

// ── State 定义 ────────────────────────────────────────────────────────────────

export const MainState = Annotation.Root({
  ...MessagesAnnotation.spec,

  // 流程控制（替换）
  intent:      Annotation<'consult' | 'apply' | 'insufficient'>({ reducer: (_, x) => x, default: () => 'consult' }),
  missingInfo: Annotation<string[]>({ reducer: (_, x) => x, default: () => [] }),

  // 业务数据（替换）
  documentText:     Annotation<string>({ reducer: (_, x) => x, default: () => '' }),
  checkResults:     Annotation<string[]>({ reducer: (_, x) => x, default: () => [] }),
  retrievedContext: Annotation<string>({ reducer: (_, x) => x, default: () => '' }),
  answerDraft:      Annotation<string>({ reducer: (_, x) => x, default: () => '' }),
  templates:        Annotation<ScoreTemplate[]>({ reducer: (_, x) => x, default: () => [] }),
  policyContext:    Annotation<string>({ reducer: (_, x) => x, default: () => '' }),
  userInfo:         Annotation<UserInfo | null>({ reducer: (_, x) => x, default: () => null }),
})

export type MainStateType = typeof MainState.State

// 子图复用同一 State（LangGraph 子图必须与父图共享 State 结构）
export const ApplyState   = MainState
export type  ApplyStateType   = MainStateType
export const ConsultState = MainState
export type  ConsultStateType = MainStateType
