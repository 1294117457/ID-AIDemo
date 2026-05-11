// ─── Layer 7: 认证中间件 — JWT 验证 ────────────────────────────────────────────────
// 所有需要登录才能访问的路由，都通过此中间件保护

import type { Request, Response, NextFunction } from 'express'
import { verifyJWT, JWTError } from '../../1common/utils/jwt.js'

// ── 扩展 Request 类型（挂载已验证的用户信息）────────────────────────────────────

export interface AuthenticatedRequest extends Request {
  /** 验证后的用户 ID（number 类型，来自 JWT payload） */
  userId?: number
  /** 验证后的用户名（来自 JWT sub） */
  username?: string
}

// ── 统一响应格式 ─────────────────────────────────────────────────────────────

function jsonResponse(res: Response, status: number, code: number, msg: string, data: unknown = null) {
  res.status(status).json({ code, msg, data })
}

// ── 强鉴权中间件（必须登录）─────────────────────────────────────────────────

/**
 * 验证 Authorization: Bearer <token>
 * - 无 token → 401 未登录
 * - token 无效/签名错误 → 401 Token 无效
 * - token 已过期 → 403 Token 已过期
 * - tokenType != access → 403 Token 类型错误
 * - 验证通过 → req.userId + req.username 挂载到请求对象
 */
export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization']

  if (!authHeader || typeof authHeader !== 'string') {
    jsonResponse(res, 401, 401, '未登录，请重新登录', null)
    return
  }

  if (!authHeader.startsWith('Bearer ')) {
    jsonResponse(res, 401, 401, 'Authorization 格式错误，应为 Bearer <token>', null)
    return
  }

  const token = authHeader.slice(7)

  if (!token.trim()) {
    jsonResponse(res, 401, 401, 'Token 为空', null)
    return
  }

  try {
    const payload = verifyJWT(token)

    // 挂载到请求对象，后续 handler 直接读取
    req.userId    = payload.userId
    req.username  = payload.sub

    next()
  } catch (e: unknown) {
    if (e instanceof JWTError) {
      jsonResponse(res, e.code, e.code, e.message, null)
    } else {
      jsonResponse(res, 500, 500, 'Token 验证异常', null)
    }
  }
}

// ── 可选鉴权（允许未登录，返回 null）────────────────────────────────────────

/**
 * 提取 userId（允许未登录，失败返回 null）
 * 用于不强制登录但需要用户身份的场景
 */
export function optionalAuth(req: AuthenticatedRequest): number | null {
  const authHeader = req.headers['authorization']
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null

  const token = authHeader.slice(7)
  if (!token.trim()) return null

  try {
    const payload = verifyJWT(token)
    req.userId   = payload.userId
    req.username = payload.sub
    return payload.userId
  } catch {
    return null
  }
}
