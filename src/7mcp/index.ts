// ─── Layer 7: MCP — 统一导出 ─────────────────────────────────────────────────
// 所有 MCP 工具统一在此导出，供其他层引用

export { getScoreTemplatesMcp, getUserInfoMcp, submitApplicationMcp } from './mcpClient.js'
export type {
  McpToolResult,
  GetScoreTemplatesResponse,
  GetUserInfoResponse,
  SubmitApplicationResponse,
} from '../types/shared.js'
