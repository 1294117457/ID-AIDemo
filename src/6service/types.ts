// ─── Layer 6: Service — 共享类型 ─────────────────────────────────────────────

import type { ScoreTemplate } from '../3state/state.js'

export interface AgentInput {
  userInput:    string
  documentText?: string
  templates?:   ScoreTemplate[]   // 保留（调试兼容），正式流程由 MCP 提供
  sessionId:    string
  userId?:      string   // 用户身份，由后端通过 x-user-id 头传递，用于会话持久化
  userToken:    string   // 前端 JWT，透传给 MCP 工具调用
  forcedIntent?: 'consult' | 'apply' | null  // 申请入口注入，强制跳过 LLM 分类
}

export interface AgentResult {
  interrupted:  boolean
  reply:        string
  intent:       'consult' | 'apply' | 'insufficient'
  documentText: string
  suggestions:  any[]
  question?:    string
}

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
