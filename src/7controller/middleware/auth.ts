/**
 * requireAuth: 强鉴权中间件，必须登录
 * optionalAuth: 可选鉴权中间件，允许未登录
 * jsonResponse: 统一响应格式
 */
import type { Request, Response, NextFunction } from 'express'
import { verifyJWT, JWTError } from '../../1common/utils/jwt.js'
import { requestContext } from '../mcp/requestContext.js'

// ── 扩展 Request 类型（挂载已验证的用户信息）────────────────────────────────────

export interface AuthenticatedRequest extends Request {
  userId?: number
  username?: string
  tenantId?: string
}

/**
 * jsonResponse: 统一响应格式
 */
function jsonResponse(res: Response, status: number, code: number, msg: string, data: unknown = null) {
  res.status(status).json({ code, msg, data })
}

/**
 * requireAuth: 强鉴权中间件，必须登录
 * 根据token判断是否登录、过期
 * 验证成功，挂载到请求对象，同时存入 AsyncLocalStorage，后续异步链可取
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

    // 挂载到请求对象（同步链路使用）
    req.userId    = payload.userId
    req.username  = payload.sub

    // 存入 AsyncLocalStorage（整个异步调用链可访问）
    // next() 必须在 run() 回调内调用，否则上下文传不过去
    requestContext.run(
      {
        userId:    payload.userId,
        token,
        sessionId: req.body?.sessionId,
        tenantId:  payload.tenantId,
      },
      () => next()
    )
  } catch (e: unknown) {
    if (e instanceof JWTError) {
      jsonResponse(res, e.code, e.code, e.message, null)
    } else {
      jsonResponse(res, 500, 500, 'Token 验证异常', null)
    }
  }
}

/**
 * optionalAuth: 可选鉴权中间件，允许未登录
 * 失败返回null
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
    req.tenantId=payload.tenantId
    return payload.userId
  } catch {
    return null
  }
}
