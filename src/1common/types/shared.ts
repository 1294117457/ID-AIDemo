// ─── 共享类型定义 ──────────────────────────────────────────────────────────────
// 所有跨层共用的业务类型统一在此定义，避免多处重复维护

// ── 加分模板相关 ──────────────────────────────────────────────────────────────

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
  scoreType:        number
  templateMaxScore?: number
  reviewCount?:     number
  description?:     string
  rules:            TemplateRule[]
}

// ── 用户信息 ──────────────────────────────────────────────────────────────────

export interface UserInfo {
  userId:         number
  studentId:      string
  studentName:    string
  major:          string
  enrollmentYear: number
}

// ── MCP 调用结果 ────────────────────────────────────────────────────────────

export interface McpToolResult<T = unknown> {
  success: boolean
  data?:   T
  error?:  string
}

export interface GetScoreTemplatesResponse {
  templates: ScoreTemplate[]
}

export interface GetUserInfoResponse {
  userInfo: UserInfo
}

export interface SubmitApplicationResponse {
  applicationId: string
}

// ── Agent 输入输出 ────────────────────────────────────────────────────────────

export interface AgentInput {
  userInput:    string
  documentText?: string
  templates?:   ScoreTemplate[]
  sessionId:    string
  userId?:      string
  userToken:    string
  forcedIntent?: 'consult' | 'apply' | null
}

export interface AgentResult {
  interrupted:  boolean
  reply:        string
  intent:       'consult' | 'apply' | 'insufficient'
  documentText: string
  suggestions:  any[]
  question?:    string
}

// ── 证明材料分析 ──────────────────────────────────────────────────────────────

export interface AnalyzeCertificateResult {
  certificateText: string
  suggestions:    any[]
}

export interface AnalyzeGenerateResult {
  templateName: string
  templateType: string
  scoreType:    number
  applyScore:   number
  ruleId:       number
  remark:       string
}

// ── Controller 统一响应 ───────────────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  code: number
  msg:  string
  data: T | null
}
