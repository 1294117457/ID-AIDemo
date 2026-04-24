// ─── Layer 4 Node: Apply Flow ──────────────────────────────────────────────────
// 申请加分子图的所有节点：取回政策 → 分析匹配 → 汇总 → 确认(interrupt) → 提交

import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages'
import { interrupt } from '@langchain/langgraph'
import { z } from 'zod'
import { createChatModel } from '../model.js'
import { searchKnowledge } from '../rag.js'
import { ANALYZE_SYSTEM, analyzeUserPrompt } from '../prompts.js'
import type { ApplyStateType } from '../state.js'

const JAVA_URL    = process.env.JAVA_BACKEND_URL    ?? 'http://localhost:8080'
const SERVICE_KEY = process.env.INTERNAL_SERVICE_KEY ?? 'id-ai-internal-secret-2024'

// ── fetchPolicyNode ───────────────────────────────────────────────────────────

export async function fetchPolicyNode(state: ApplyStateType): Promise<Partial<ApplyStateType>> {
  console.log('--apply:fetchPolicy')
  const policyContext = await searchKnowledge(state.documentText.slice(0, 512), 5)
  return { policyContext }
}

// ── analyzeAndMatchNode ───────────────────────────────────────────────────────

const SuggestionSchema = z.object({
  suggestions: z.array(z.object({
    templateId:     z.number(),
    templateName:   z.string(),
    ruleId:         z.number(),
    ruleName:       z.string(),
    estimatedScore: z.number(),
    reason:         z.string().describe('一句话匹配理由，不超过50字'),
  }))
})

export async function analyzeAndMatchNode(state: ApplyStateType): Promise<Partial<ApplyStateType>> {
  console.log('--apply:analyzeAndMatch')

  if (!state.templates || state.templates.length === 0) {
    return { checkResults: ['{"error":"无可用加分模板"}'] }
  }

  const templatesForPrompt = state.templates.map(t => ({
    id: t.id, templateName: t.templateName, templateType: t.templateType,
    rules: t.rules.map(r => ({ id: r.id, ruleName: r.ruleName, ruleScore: r.ruleScore }))
  }))

  const model = createChatModel(0.1).withStructuredOutput(SuggestionSchema)
  const result = await model.invoke([
    new SystemMessage(ANALYZE_SYSTEM),
    new HumanMessage(analyzeUserPrompt(
      state.documentText.slice(0, 2000),
      JSON.stringify(templatesForPrompt, null, 2),
      state.policyContext
    )),
  ])

  return { checkResults: result.suggestions.map(s => JSON.stringify(s)) }
}

// ── summarizeNode ─────────────────────────────────────────────────────────────

export async function summarizeNode(state: ApplyStateType): Promise<Partial<ApplyStateType>> {
  console.log('--apply:summarize')

  const suggestions = state.checkResults
    .map(r => { try { return JSON.parse(r) } catch { return null } })
    .filter(Boolean)

  if (suggestions.length === 0 || (suggestions[0] as any)?.error) {
    return { messages: [new AIMessage('根据您提供的材料，暂未匹配到符合条件的加分项。请确认材料内容是否完整，或补充更多信息。')] }
  }

  const summary = suggestions.map((s: any) =>
    `• **${s.templateName}** / ${s.ruleName}\n  预计加分：${s.estimatedScore} 分\n  理由：${s.reason}`
  ).join('\n\n')

  return { messages: [new AIMessage(`为您匹配到以下加分项：\n\n${summary}`)] }
}

// ── confirmRoute ──────────────────────────────────────────────────────────────

export function confirmRoute(state: ApplyStateType): 'confirm' | 'end' {
  const suggestions = state.checkResults
    .map(r => { try { return JSON.parse(r) } catch { return null } })
    .filter((s: any) => s && !s.error)
  return suggestions.length > 0 ? 'confirm' : 'end'
}

// ── confirmNode（interrupt 等待前端按钮确认） ─────────────────────────────────

export async function confirmNode(state: ApplyStateType): Promise<Partial<ApplyStateType>> {
  console.log('--apply:confirm (interrupt)')

  const suggestions = state.checkResults
    .map(r => { try { return JSON.parse(r) } catch { return null } })
    .filter((s: any) => s && !s.error)

  const question = [
    `已为您匹配到以下加分项，请上传对应证明材料后点击「确认提交」：`,
    '',
    ...suggestions.map((s: any, i: number) =>
      `${i + 1}. **${s.templateName}** / ${s.ruleName}（预计 ${s.estimatedScore} 分）\n   ${s.reason}`
    ),
  ].join('\n')

  const userAnswer = interrupt({ type: 'confirm' as const, question, suggestions })

  return {
    messages: [
      new AIMessage(question),
      new HumanMessage(String(userAnswer)),
    ],
  }
}

// ── submitNode ────────────────────────────────────────────────────────────────

export async function submitNode(state: ApplyStateType): Promise<Partial<ApplyStateType>> {
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

  if (!state.userInfo) {
    return { messages: [new AIMessage('获取用户信息失败，请重新登录后再申请。')] }
  }

  const suggestion = state.checkResults
    .map(r => { try { return JSON.parse(r) } catch { return null } })
    .filter((s: any) => s && !s.error)[0] as any

  if (!suggestion) {
    return { messages: [new AIMessage('申请数据异常，请重新上传证明材料。')] }
  }

  const fullTemplate = state.templates.find(t => t.id === suggestion.templateId)
  const submitBody = {
    userId:         state.userInfo.userId,
    studentId:      state.userInfo.studentId,
    studentName:    state.userInfo.studentName,
    major:          state.userInfo.major,
    enrollmentYear: state.userInfo.enrollmentYear,
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

  try {
    const resp = await fetch(`${JAVA_URL}/internal/agent/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Internal-Service-Key': SERVICE_KEY },
      body: JSON.stringify(submitBody),
    })
    const data = await resp.json() as any
    if (data.code === 200) {
      return { messages: [new AIMessage(`✅ 申请已提交成功！申请编号：**${data.data}**，请等待审核员审核。`)] }
    }
    return { messages: [new AIMessage(`提交失败：${data.msg}，请稍后重试或手动提交。`)] }
  } catch (e) {
    console.error('[submitNode] 回调 Java 失败:', e)
    return { messages: [new AIMessage('网络异常，提交失败，请稍后重试或手动提交。')] }
  }
}
