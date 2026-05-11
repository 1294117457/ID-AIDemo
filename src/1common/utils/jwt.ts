// ─── JWT 工具 — 与后端 JWTUtils.java 完全一致的验证逻辑 ──────────────────────────
// 使用相同的 JWT_SECRET 和算法（HS256），验证签名、过期时间、tokenType

import jwt from 'jsonwebtoken'
import 'dotenv/config'

// ── 密钥（必须与后端 application.yml 中的 jwt.secret 完全一致）────────────────────
const JWT_SECRET = process.env.JWT_SECRET ?? 'id-backend-default-secret-key-2024-change-in-production'

// ── Token 载荷类型（与后端 JWTUtils 保持一致）────────────────────────────────────

export interface JWTPayload {
  tokenType: 'access' | 'refresh'
  userId: number
  sub: string        // username
  exp: number
  iat: number
}

// ── JWT 验证异常 ──────────────────────────────────────────────────────────────

export class JWTError extends Error {
  constructor(
    message: string,
    public code: 401 | 403 | 500 = 401
  ) {
    super(message)
    this.name = 'JWTError'
  }
}

// ── 核心验证函数 ─────────────────────────────────────────────────────────────

/**
 * 验证 JWT token 并返回解码后的 payload
 * - 验证签名
 * - 验证 tokenType == 'access'
 * - 验证未过期
 */
export function verifyJWT(token: string): JWTPayload {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as jwt.JwtPayload

    const payload: JWTPayload = {
      tokenType: (decoded['tokenType'] as string) as 'access' | 'refresh',
      userId:    decoded['userId'] as number,
      sub:       decoded['sub'] as string,
      exp:       decoded['exp'] as number,
      iat:       decoded['iat'] as number,
    }

    if (!payload.tokenType || (payload.tokenType !== 'access' && payload.tokenType !== 'refresh')) {
      throw new JWTError('Token 类型字段缺失或无效', 401)
    }

    if (payload.tokenType !== 'access') {
      throw new JWTError('Token 类型错误，请使用 Access Token', 403)
    }

    if (!payload.userId) {
      throw new JWTError('Token 中不包含用户 ID', 401)
    }

    return payload
  } catch (e: any) {
    if (e instanceof JWTError) throw e
    if (e.name === 'TokenExpiredError') {
      throw new JWTError('Token 已过期，请重新登录', 403)
    }
    if (e.name === 'JsonWebTokenError') {
      throw new JWTError('Token 无效，请重新登录', 401)
    }
    throw new JWTError(`Token 验证失败: ${e.message}`, 500)
  }
}

/**
 * 仅解码 JWT（不验证签名），用于调试
 */
export function decodeJWT(token: string): JWTPayload | null {
  try {
    const decoded = jwt.decode(token) as jwt.JwtPayload | null
    if (!decoded) return null
    return {
      tokenType: (decoded['tokenType'] as string) as 'access' | 'refresh',
      userId:    decoded['userId'] as number,
      sub:       decoded['sub'] as string,
      exp:       decoded['exp'] as number,
      iat:       decoded['iat'] as number,
    }
  } catch {
    return null
  }
}
