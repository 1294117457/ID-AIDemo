// ─── submitNode — 解析确认 + MCP 拉 userInfo + 提交申请 ─────────────────────
// 归属：apply 子图

import { HumanMessage, AIMessage } from '@langchain/core/messages'
import type { ApplyState } from '../../../3state/index.js'
import { getUserInfoTool, submitApplicationTool } from '../../../7controller/mcp/index.js'
import { parseCheckResults } from '../utils.js'

export async function submitNode(
  state: ApplyState,
  _config: { configurable: Record<string, unknown> }
): Promise<Partial<ApplyState>> {
  console.log('--apply:submit')

  const lastHuman = state.messages.filter(m => m instanceof HumanMessage).at(-1)
  const answer = String(lastHuman?.content ?? '').trim()

  let parsed: any
  try { parsed = JSON.parse(answer) }
  catch { parsed = { action: answer.toLowerCase() === 'cancel' ? 'cancel' : 'unknown' } }

  if (parsed.action === 'cancel') {
    return { messages: [new AIMessage('已取消申请，您可以随时重新发起。')] }
  }

  if (parsed.action !== 'confirm' || !Array.isArray(parsed.proofFileIds) || parsed.proofFileIds.length === 0) {
    return { messages: [new AIMessage('操作异常，请重试或联系管理员。')] }
  }

  const proofFileIds: number[] = parsed.proofFileIds
  const proofValues: number[]  = Array.isArray(parsed.proofValues) ? parsed.proofValues : []

  // 从 AsyncLocalStorage 自动取 userId，不再从 config.configurable 取
  const { getCurrentUserId } = await import('../../../7controller/mcp/index.js')
  const userId = getCurrentUserId()
  if (!userId) {
    return { messages: [new AIMessage('用户身份缺失，请重新登录后再申请。')] }
  }

  // MCP 调用 getUserInfo（无参数，userId 从 AsyncLocalStorage 取）
  const infoResult = await getUserInfoTool()
  if (!infoResult.success || !infoResult.data?.userInfo) {
    console.error('--apply:submit: MCP 拉取 userInfo 失败:', infoResult.error)
    return { messages: [new AIMessage('获取用户信息失败，请重新登录后再申请。')] }
  }
  const userInfo = infoResult.data.userInfo

  const suggestions = parseCheckResults(state.checkResults)
  const suggestion = suggestions[0]

  if (!suggestion) {
    return { messages: [new AIMessage('申请数据异常，请重新上传证明材料。')] }
  }

  const fullTemplate = state.templates.find(t => t.id === suggestion.templateId)

  // MCP 调用 submitApplication
  const submitResult = await submitApplicationTool({
    templateName: suggestion.templateName,
    applyScore: suggestion.estimatedScore,
    ruleId: suggestion.ruleId ?? undefined,
    remark: `AI 智能匹配 - ${suggestion.reason ?? ''}`,
    proofItems: proofFileIds.map((id: number, i: number) => ({
      proofFileId: id,
      proofValue: proofValues[i] ?? 0,
    })),
  })

  if (submitResult.success) {
    const appId = (submitResult.data as any)?.applicationId ?? '未知'
    return { messages: [new AIMessage(
      `✅ 申请已提交成功！申请编号：**${appId}**，请等待审核员审核。`
    )] }
  }

  return { messages: [new AIMessage(`提交失败：${submitResult.error}，请稍后重试或手动提交。`)] }
}
