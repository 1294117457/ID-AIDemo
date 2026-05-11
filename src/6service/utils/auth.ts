// ─── Auth Context — 从 Express Request 提取认证信息 ────────────────────────────

import type { Request } from 'express'
import type { AuthenticatedRequest } from '../../7controller/middleware/auth.js'

/**
 * 从 HTTP 请求中提取认证上下文
 * - 优先使用经过 requireAuth 中间件验证的 userId（密码学保证）
 * - userToken 用于透传到后端 MCP 接口验证
 */
export interface AuthContext {
  userId:    string | null   // 经过 JWT 验证的 userId（string 兼容历史接口）
  userToken: string          // 前端 JWT，供 MCP 透传到后端验证
}

export function extractAuth(req: Request): AuthContext {
  // 优先使用经过 JWT 验证的 userId（来自 requireAuth 中间件）
  const authReq = req as AuthenticatedRequest
  const userId = authReq.userId != null ? String(authReq.userId) : null

  // userToken 始终从 Authorization 头提取，供 MCP 调用后端
  const authHeader = (req.headers['authorization'] as string) || ''
  const userToken = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : authHeader

  return { userId, userToken }
}
