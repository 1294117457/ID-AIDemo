// ─── Layer 7: Controller — 统一响应与请求类型 ────────────────────────────────

import type { ScoreTemplate, ApiResponse } from '../1common/types/shared.js'

export type { ApiResponse }

export function ok<T>(data: T): ApiResponse<T> {
  return { code: 200, msg: '成功', data }
}

export function fail(code: number, msg: string): ApiResponse<null> {
  return { code, msg, data: null }
}

// ── Agent 接口 ─────────────────────────────────────────────────────────────────

export interface AgentChatBody {
  message?:    string
  sessionId?:  string
  templates?:  string   // JSON string
  userInfo?:   string   // JSON string
}

export interface AgentResumeBody {
  sessionId:  string
  supplement: string
}

// ── Analyze 接口 ────────────────────────────────────────────────────────────────

export interface AnalyzeCertificateBody {
  templates?: string   // JSON string
}

export interface AnalyzeGenerateBody {
  certificateText:      string
  selectedTemplateId:   number
  selectedRuleId:       number
  template:             ScoreTemplate
}

// ── Config 接口 ─────────────────────────────────────────────────────────────────

export interface ConfigPutBody {
  apiKey?:       string
  baseURL?:      string
  modelName?:    string
  temperature?:  number
}
