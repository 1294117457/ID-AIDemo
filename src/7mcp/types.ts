// ─── Layer 7: MCP — 类型定义 ─────────────────────────────────────────────────
// Agent 通过这些类型与后端 MCP 接口交互，所有数据经后端，不直连 MySQL

// ── 加分模板 ────────────────────────────────────────────────────────────────

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

// ── 用户信息 ────────────────────────────────────────────────────────────────

export interface UserInfo {
  userId:         number
  studentId:      string
  studentName:    string
  major:          string
  enrollmentYear: number
}

// ── MCP 调用结果 ────────────────────────────────────────────────────────────

export interface McpToolResult<T = any> {
  success: boolean
  data?:   T
  error?:  string
}

// ── MCP 工具响应类型 ───────────────────────────────────────────────────────

export interface GetScoreTemplatesResponse {
  templates: ScoreTemplate[]
}

export interface GetUserInfoResponse {
  userInfo: UserInfo
}

export interface SubmitApplicationResponse {
  applicationId: string
}
