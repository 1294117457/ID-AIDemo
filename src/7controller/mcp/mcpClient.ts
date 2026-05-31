
/**
 * MCP Client，调用后端工具
 * 内部自动处理 MCP 四阶段：initialize / tools/list / tools/call / ping
 * mcpCall、getScoreTemplatesTool、getUserInfoTool、submitApplicationTool
 * 通用MCP调用、获取评分模板、获取用户信息、提交申请
 */
import { getCurrentToken } from './requestContext.js'
import type {
  McpToolResult,
  GetScoreTemplatesResponse,
  GetUserInfoResponse,
  SubmitApplicationResponse,
} from '../../1common/types/shared.js'

/**
 * 通用 MCP JSON-RPC 调用
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


/**
 * 调用后端 getScoreTemplates 工具
 */
export async function getScoreTemplatesTool(): Promise<McpToolResult<GetScoreTemplatesResponse>> {
  return mcpCall<GetScoreTemplatesResponse>('getScoreTemplates', {})
}


/**
 * 调用后端 getUserInfo 工具
 * userId 从 AsyncLocalStorage 对应的 JWT 中取
 */
export async function getUserInfoTool(): Promise<McpToolResult<{ userInfo: GetUserInfoResponse['userInfo'] }>> {
  return mcpCall('getUserInfo', {})
}


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
