// ─── submitNode — 解析确认 + MCP 拉 userInfo + 提交申请 ─────────────────────
// 归属：apply 子图

import { HumanMessage, AIMessage } from '@langchain/core/messages'
import type { ApplyState } from '../../../3state/index.js'
import { getUserInfoMcp, submitApplicationMcp } from '../../../7controller/mcp/index.js'
import { parseCheckResults } from '../utils.js'

export async function submitNode(
  state: ApplyState,
  config: { configurable: { userToken?: string; userId?: string } }
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

  const submitResult = await submitApplicationMcp(submitBody, userToken)

  if (submitResult.success) {
    return { messages: [new AIMessage(
      `✅ 申请已提交成功！申请编号：**${submitResult.data?.applicationId ?? '未知'}**，请等待审核员审核。`
    )] }
  }

  return { messages: [new AIMessage(`提交失败：${submitResult.error}，请稍后重试或手动提交。`)] }
}
