
// 上下文存储（AsyncLocalStorage，等价于 Java ThreadLocal）
export { requestContext, getCurrentUserId, getCurrentToken, getRequestContext } from './requestContext.js'

// MCP 工具函数
export {
  mcpCall,
  getScoreTemplatesTool,
  getUserInfoTool,
  submitApplicationTool,
} from './mcpClient.js'

// 类型
export type { McpToolResult } from '../../1common/types/shared.js'
export type { RequestContext } from './requestContext.js'
