// ─── Auth Context — 从 Express Request 提取认证信息 ────────────────────────────

import type { Request } from 'express'

/**
 * 从 HTTP 请求中提取认证上下文
 * 统一 userId / userToken 的解析逻辑，避免在多处重复
 */
export interface AuthContext {
  userId:    string | null
  userToken: string
}

export function extractAuth(req: Request): AuthContext {
  const userId = (req.headers['x-user-id'] as string) || null

  const authHeader = (req.headers['authorization'] as string) || ''
  const userToken = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : authHeader

  return { userId, userToken }
}
