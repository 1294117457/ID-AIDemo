// ─── Layer 7: MCP — 统一导出 ─────────────────────────────────────────────────
// 所有 MCP 工具统一在此导出，供其他层引用

// 上下文存储（AsyncLocalStorage，等价于 Java ThreadLocal）
export { requestContext, getCurrentUserId, getCurrentToken, getRequestContext } from './requestContext.js'

// MCP 工具函数（直接 HTTP JSON-RPC 调用）
export {
  mcpCall,
  getScoreTemplatesTool,
  getUserInfoTool,
  submitApplicationTool,
} from './mcpClient.js'

// 类型
export type { McpToolResult } from '../../1common/types/shared.js'
export type { RequestContext } from './requestContext.js'
