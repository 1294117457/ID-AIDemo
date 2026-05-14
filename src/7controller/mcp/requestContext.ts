/**
 * AsyncLocalStorage上下文
 * 获取UserId,Token,SessionId,TenantId
 */
import { AsyncLocalStorage } from 'async_hooks'

export interface RequestContext {
  userId?: number
  token?: string
  sessionId?: string
  tenantId?: string
}

export const requestContext = new AsyncLocalStorage<RequestContext>()


/**
 * 获取当前请求的用户 ID
 * 任何异步调用链中都能访问，包括 fetch、then、async/await
 */
export function getCurrentUserId(): number | undefined {
  return requestContext.getStore()?.userId
}

/**
 * 获取当前请求的前端 JWT
 * 用于填入 MCP 请求头 X-User-Token
 */
export function getCurrentToken(): string | undefined {
  return requestContext.getStore()?.token
}

/**
 * 获取完整请求上下文
 */
export function getRequestContext(): RequestContext | undefined {
  return requestContext.getStore()
}
/**
 * 获取当前请求的租户ID
 */
export function getCurrentTenantId(): string {
  return requestContext.getStore()?.tenantId ?? 'default'
}