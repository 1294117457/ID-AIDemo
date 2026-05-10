// ─── Layer 7: MCP — Agent → 后端工具调用 ─────────────────────────────────────
// Agent 通过 MCP 主动调用后端获取数据和提交申请
// 鉴权：继承前端 JWT Token，透传到后端统一验证，不直连 MySQL

import { BACKEND_URL } from '../1config/config.js'
import type {
  McpToolResult,
  GetScoreTemplatesResponse,
  GetUserInfoResponse,
  SubmitApplicationResponse,
} from '../1common/types/shared.js'

// ── HTTP 基础 ───────────────────────────────────────────────────────────────

/**
 * 统一的 MCP 调用方法
 *
 * @param path      API 路径（如 /internal/mcp/tools/get_score_templates）
 * @param options   fetch 选项 + userToken（前端 JWT 继承，透传到后端验证）
 */
async function mcpFetch<T>(
  path: string,
  options: RequestInit & { userToken: string }
): Promise<McpToolResult<T>> {
  const { userToken, ...fetchOptions } = options

  const isMutation = !['GET', 'HEAD'].includes((fetchOptions.method ?? 'GET').toUpperCase())

  try {
    const resp = await fetch(`${BACKEND_URL}${path}`, {
      ...fetchOptions,
      headers: {
        'Authorization': userToken,
        ...(isMutation ? { 'Content-Type': 'application/json' } : {}),
        ...fetchOptions.headers,
      },
    })

    if (!resp.ok) {
      return { success: false, error: `HTTP ${resp.status}` }
    }

    const json = await resp.json() as any
    if (json.code === 200) {
      return { success: true, data: json.data as T }
    }
    return { success: false, error: json.msg ?? '未知错误' }
  } catch (e) {
    return { success: false, error: String(e) }
  }
}

// ── 工具一：获取加分模板列表 ───────────────────────────────────────────────

/**
 * 获取所有激活的加分模板（含 rules）
 * 被 analyzeMatchNode 调用，在 LLM 匹配前拉取模板数据
 */
export async function getScoreTemplatesMcp(
  userToken: string
): Promise<McpToolResult<GetScoreTemplatesResponse>> {
  return mcpFetch<GetScoreTemplatesResponse>(
    '/internal/mcp/tools/get_score_templates',
    { userToken, method: 'GET' }
  )
}

// ── 工具二：获取用户信息 ─────────────────────────────────────────────────

/**
 * 获取指定用户的基本信息
 * 被 submitNode 调用，在提交申请前拉取用户身份
 */
export async function getUserInfoMcp(
  userId: number,
  userToken: string
): Promise<McpToolResult<GetUserInfoResponse>> {
  return mcpFetch<GetUserInfoResponse>(
    `/internal/mcp/tools/get_user_info?userId=${userId}`,
    { userToken, method: 'GET' }
  )
}

// ── 工具三：提交加分申请 ─────────────────────────────────────────────────

/**
 * 提交加分申请到数据库
 * 被 submitNode 调用，用户确认后写入申请记录
 */
export async function submitApplicationMcp(
  submitBody: Record<string, any>,
  userToken: string
): Promise<McpToolResult<SubmitApplicationResponse>> {
  return mcpFetch<SubmitApplicationResponse>(
    '/internal/mcp/tools/submit_application',
    {
      userToken,
      method: 'POST',
      body: JSON.stringify(submitBody),
    }
  )
}
