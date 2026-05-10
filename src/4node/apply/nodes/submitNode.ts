// ─── submitNode — 解析确认 + MCP 拉 userInfo + 提交申请 ─────────────────────
// 归属：apply 子图
// 输入：state.messages（interrupt 响应）/ state.checkResults / state.templates
// 输出：AI 消息（提交结果）
//
// MCP：
//   - getUserInfoMcp(userId, userToken) — 拉取用户身份
//   - submitApplicationMcp(submitBody, userToken) — 提交申请

import { HumanMessage, AIMessage } from '@langchain/core/messages'
import type { ApplyStateType } from '../../../3state/state.js'
import { getUserInfoMcp, submitApplicationMcp } from '../../../7mcp/index.js'
import { parseCheckResults } from '../utils.js'

// ── 节点实现 ───────────────────────────────────────────────────────────────

/**
 * 提交加分申请
 *
 * 流程：
 *   1. 解析 interrupt 响应（confirm / cancel）
 *   2. MCP 拉取用户信息（getUserInfoMcp）
 *   3. 构造 submitBody
 *   4. MCP 提交申请（submitApplicationMcp）
 *   5. 返回 AI 消息
 */
export async function submitNode(
  state: ApplyStateType,
  config: { configurable: { userToken?: string; userId?: string } }
): Promise<Partial<ApplyStateType>> {
  console.log('--apply:submit')

  // ── Step 1：解析 interrupt 响应 ───────────────────────────────────
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

  // ── Step 2：MCP 拉取 userInfo ─────────────────────────────────────
  const userId    = config?.configurable?.userId
  const userToken = config?.configurable?.userToken ?? ''

  if (!userId) {
    return { messages: [new AIMessage('用户身份缺失，请重新登录后再申请。')] }
  }

  const infoResult = await getUserInfoMcp(Number(userId), userToken)
  if (!infoResult.success || !infoResult.data?.userInfo) {
    console.error('--apply:submit: MCP 拉取 userInfo 失败:', infoResult.error)
    return { messages: [new AIMessage('获取用户信息失败，请重新登录后再申请。')] }
  }
  const userInfo = infoResult.data.userInfo

  // ── Step 3：构造 submitBody ───────────────────────────────────────
  const suggestions = parseCheckResults(state.checkResults)
  const suggestion = suggestions[0]

  if (!suggestion) {
    return { messages: [new AIMessage('申请数据异常，请重新上传证明材料。')] }
  }

  const fullTemplate = state.templates.find(t => t.id === suggestion.templateId)
  const submitBody = {
    userId:         userInfo.userId,
    studentId:      userInfo.studentId,
    studentName:    userInfo.studentName,
    major:          userInfo.major,
    enrollmentYear: userInfo.enrollmentYear,
    templateName:   suggestion.templateName,
    templateType:   fullTemplate?.templateType ?? 'CONDITION',
    scoreType:      fullTemplate?.scoreType ?? 0,
    applyScore:     suggestion.estimatedScore,
    ruleId:         suggestion.ruleId ?? null,
    reviewCount:    fullTemplate?.reviewCount ?? 1,
    remark:         `AI 智能匹配 - ${suggestion.reason ?? ''}`,
    proofItems: proofFileIds.map((id: number, i: number) => ({
      proofFileId: id, proofValue: proofValues[i] ?? 0, remark: '',
    })),
  }

  // ── Step 4：MCP 提交申请 ───────────────────────────────────────────
  const submitResult = await submitApplicationMcp(submitBody, userToken)

  if (submitResult.success) {
    return { messages: [new AIMessage(
      `✅ 申请已提交成功！申请编号：**${submitResult.data?.applicationId ?? '未知'}**，请等待审核员审核。`
    )] }
  }

  return { messages: [new AIMessage(`提交失败：${submitResult.error}，请稍后重试或手动提交。`)] }
}
