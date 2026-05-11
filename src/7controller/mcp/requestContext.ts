// ─── AsyncLocalStorage 上下文 — 等价于 Java ThreadLocal ─────────────────────
// Node.js 16+ 原生支持，无需安装任何依赖
// 用于在异步调用链中存储当前请求的用户数据（userId + JWT）
// 整个调用链（Controller → AgentService → Node → mcpClient）都能访问

import { AsyncLocalStorage } from 'async_hooks'

// ── 上下文类型定义 ──────────────────────────────────────────────────────────

export interface RequestContext {
  userId?: number
  /** 前端用户 JWT（透传到后端 X-User-Token 请求头） */
  token?: string
  sessionId?: string
}

// ── 全局存储实例（进程级别单例）──────────────────────────────────────────────

export const requestContext = new AsyncLocalStorage<RequestContext>()

// ── 工具函数 ────────────────────────────────────────────────────────────────

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
