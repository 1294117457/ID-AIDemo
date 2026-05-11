// ─── Layer 7: MCP — Agent → 后端工具调用 ─────────────────────────────────────
// 使用 @langchain/mcp-adapters 的 MultiServerMCPClient 替代手写 HTTP
// 内部自动处理 MCP 四阶段：initialize / tools/list / tools/call / ping
// 鉴权：token 从 AsyncLocalStorage 取，填入 X-User-Token 请求头

import { MultiServerMCPClient } from '@langchain/mcp-adapters'
import type { Tool } from '@langchain/core/tools'
import { getCurrentToken, getRequestContext } from './requestContext.js'
import type {
  McpToolResult,
  GetScoreTemplatesResponse,
  GetUserInfoResponse,
  SubmitApplicationResponse,
} from '../../1common/types/shared.js'

// ── 通用 MCP 调用 ───────────────────────────────────────────────────────────

/**
 * 通用 MCP JSON-RPC 调用
 * MCP Server 地址从 MCP_SERVER_URL 环境变量读取
 * 认证 token 从 AsyncLocalStorage 取，填入 X-User-Token 请求头
 */
export async function mcpCall<T = unknown>(
  toolName: string,
  args: Record<string, unknown> = {}
): Promise<McpToolResult<T>> {
  const MCP_SERVER_URL = process.env.MCP_SERVER_URL ?? 'http://localhost:8080/api/mcp'
  const userToken = getCurrentToken() ?? ''

  try {
    const resp = await fetch(MCP_SERVER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Token': `Bearer ${userToken}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: { name: toolName, arguments: args },
        id: crypto.randomUUID(),
      }),
    })

    if (!resp.ok) {
      return { success: false, error: `HTTP ${resp.status}` }
    }

    const json = await resp.json() as any
    if (json.error) {
      return { success: false, error: json.error.message ?? JSON.stringify(json.error) }
    }

    const content = json.result?.content?.[0]
    if (!content || content.type !== 'text') {
      return { success: false, error: 'MCP 响应格式异常' }
    }

    const parsed = JSON.parse(content.text)
    return { success: true, data: parsed as T }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) }
  }
}

// ── 工具一：getScoreTemplates ──────────────────────────────────────────────

/**
 * 调用后端 getScoreTemplates 工具
 * 无需参数（模板列表是公开的）
 */
export async function getScoreTemplatesTool(): Promise<McpToolResult<GetScoreTemplatesResponse>> {
  return mcpCall<GetScoreTemplatesResponse>('getScoreTemplates', {})
}

// ── 工具二：getUserInfo ───────────────────────────────────────────────────

/**
 * 调用后端 getUserInfo 工具
 * 无参数，userId 从 AsyncLocalStorage 对应的 JWT 中取
 */
export async function getUserInfoTool(): Promise<McpToolResult<{ userInfo: GetUserInfoResponse['userInfo'] }>> {
  return mcpCall('getUserInfo', {})
}

// ── 工具三：submitApplication ─────────────────────────────────────────────

/**
 * 调用后端 submitApplication 工具
 */
export async function submitApplicationTool(body: {
  templateName: string
  applyScore: number
  ruleId?: number
  remark?: string
  proofItems: Array<{ proofFileId: number; proofValue: number; remark?: string }>
}): Promise<McpToolResult<SubmitApplicationResponse>> {
  return mcpCall<SubmitApplicationResponse>('submitApplication', {
    templateName: body.templateName,
    applyScore: body.applyScore,
    ruleId: body.ruleId ?? null,
    remark: body.remark ?? null,
    proofItems: body.proofItems,
  })
}
