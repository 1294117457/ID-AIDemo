import { ApplyState, ApplyStateType } from '../state.js'
import { StateGraph, START, END, interrupt } from '@langchain/langgraph'
import { HumanMessage, AIMessage } from '@langchain/core/messages'
import { z } from 'zod'
import { searchKnowledge } from '../../services/knowledgeManager.js'
import { ANALYZE_SYSTEM, analyzeUserPrompt } from '../prompts.js'
import { createChatModel } from '../../services/llmService.js'

const JAVA_URL = process.env.JAVA_BACKEND_URL ?? 'http://localhost:8080'
const SERVICE_KEY = process.env.INTERNAL_SERVICE_KEY ?? 'id-ai-internal-secret-2024'

// ─── fetchPolicyNode ───

async function fetchPolicyNode(state: ApplyStateType): Promise<Partial<ApplyStateType>> {
  console.log('--apply:fetchPolicy')
  const policyContext = await searchKnowledge(state.documentText.slice(0, 512), 5)
  return { policyContext }
}

// ─── analyzeAndMatchNode ───

const SuggestionSchema = z.object({
  suggestions: z.array(z.object({
    templateId: z.number(),
    templateName: z.string(),
    ruleId: z.number(),
    ruleName: z.string(),
    estimatedScore: z.number(),
    reason: z.string().describe('一句话匹配理由，不超过50字'),
  }))
})

async function analyzeAndMatchNode(state: ApplyStateType): Promise<Partial<ApplyStateType>> {
  console.log('--apply:analyzeAndMatch')

  if (!state.templates || state.templates.length === 0) {
    return { checkResults: ['{"error":"无可用加分模板"}'] }
  }

  const templatesForPrompt = state.templates.map(t => ({
    id: t.id,
    templateName: t.templateName,
    templateType: t.templateType,
    rules: t.rules.map(r => ({ id: r.id, ruleName: r.ruleName, ruleScore: r.ruleScore }))
  }))

  const model = createChatModel(0.1).withStructuredOutput(SuggestionSchema)
  const result = await model.invoke([
    new HumanMessage(analyzeUserPrompt(
      state.documentText.slice(0, 2000),
      JSON.stringify(templatesForPrompt, null, 2),
      state.policyContext
    )),
  ])
  return { checkResults: result.suggestions.map(s => JSON.stringify(s)) }
}

// ─── summarizeNode ───

async function summarizeNode(state: ApplyStateType): Promise<Partial<ApplyStateType>> {
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

// ─── confirmRoute：summarize 后判断是否有匹配 ───

function confirmRoute(state: ApplyStateType): 'confirm' | 'end' {
  const suggestions = state.checkResults
    .map(r => { try { return JSON.parse(r) } catch { return null } })
    .filter((s: any) => s && !s.error)
  return suggestions.length > 0 ? 'confirm' : 'end'
}

// ─── confirmNode：展示匹配结果，interrupt 等待用户上传文件确认 ───

async function confirmNode(state: ApplyStateType): Promise<Partial<ApplyStateType>> {
  console.log('--apply:confirm (interrupt)')

  const suggestions = state.checkResults
    .map(r => { try { return JSON.parse(r) } catch { return null } })
    .filter((s: any) => s && !s.error)

  const summary = suggestions.map((s: any, i: number) =>
    `${i + 1}. **${s.templateName}** / ${s.ruleName}（预计 ${s.estimatedScore} 分）\n   理由：${s.reason}`
  ).join('\n')

  const question = [
    `已为您匹配到以下加分项：\n\n${summary}`,
    '',
    '请通过页面上传对应的证明材料，获取文件 ID 后，回复以下 JSON 确认提交：',
    '```json',
    '{"confirm":true,"proofFileIds":[文件ID1,文件ID2],"proofValues":[分值1,分值2]}',
    '```',
    '或回复 **cancel** 取消申请。',
  ].join('\n')

  const userAnswer = interrupt(question)

  return {
    messages: [
      new AIMessage(question),
      new HumanMessage(String(userAnswer)),
    ],
  }
}

// ─── submitNode：解析用户回复，回调 Java 提交申请 ───

async function submitNode(state: ApplyStateType): Promise<Partial<ApplyStateType>> {
  console.log('--apply:submit')

  const lastHuman = state.messages
    .filter(m => m instanceof HumanMessage)
    .at(-1)
  const answer = String(lastHuman?.content ?? '').trim()

  if (answer.toLowerCase() === 'cancel') {
    return { messages: [new AIMessage('已取消申请，您可以随时重新发起。')] }
  }

  // 解析用户回复中的 JSON
  let proofFileIds: number[] = []
  let proofValues: number[] = []
  try {
    const match = answer.match(/\{[\s\S]*\}/)
    if (!match) throw new Error('未找到 JSON')
    const parsed = JSON.parse(match[0])
    if (!parsed.confirm) throw new Error('未确认')
    proofFileIds = Array.isArray(parsed.proofFileIds) ? parsed.proofFileIds : []
    proofValues  = Array.isArray(parsed.proofValues)  ? parsed.proofValues  : []
  } catch {
    return { messages: [new AIMessage(
      '格式不正确，请重新发送确认 JSON，或回复 cancel 取消。\n\n示例：\n```json\n{"confirm":true,"proofFileIds":[1,2],"proofValues":[2.0,1.0]}\n```'
    )] }
  }

  if (proofFileIds.length === 0) {
    return { messages: [new AIMessage('请至少上传一个证明材料（proofFileIds 不能为空）。')] }
  }

  if (!state.userInfo) {
    return { messages: [new AIMessage('获取用户信息失败，请重新登录后再申请。')] }
  }

  const suggestion = state.checkResults
    .map(r => { try { return JSON.parse(r) } catch { return null } })
    .filter((s: any) => s && !s.error)[0] as any

  if (!suggestion) {
    return { messages: [new AIMessage('申请数据异常，请重新上传证明材料。')] }
  }

  // 从 state.templates 查完整模板（需要 scoreType, reviewCount）
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
      proofFileId: id,
      proofValue:  proofValues[i] ?? 0,
      remark:      '',
    })),
  }

  try {
    const resp = await fetch(`${JAVA_URL}/internal/agent/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Service-Key': SERVICE_KEY,
      },
      body: JSON.stringify(submitBody),
    })
    const data = await resp.json() as any
    if (data.code === 200) {
      return { messages: [new AIMessage(
        `✅ 申请已提交成功！申请编号：**${data.data}**，请等待审核员审核。`
      )] }
    }
    return { messages: [new AIMessage(`提交失败：${data.msg}，请稍后重试或手动提交。`)] }
  } catch (e) {
    console.error('[submitNode] 回调 Java 失败:', e)
    return { messages: [new AIMessage('网络异常，提交失败，请稍后重试或手动提交。')] }
  }
}

// ─── 图结构 ───

export const applySubgraph = new StateGraph(ApplyState)
  .addNode('fetchPolicy',     fetchPolicyNode)
  .addNode('analyzeAndMatch', analyzeAndMatchNode)
  .addNode('summarize',       summarizeNode)
  .addNode('confirm',         confirmNode)
  .addNode('submit',          submitNode)

  .addEdge(START, 'fetchPolicy')
  .addEdge('fetchPolicy', 'analyzeAndMatch')
  .addEdge('analyzeAndMatch', 'summarize')
  .addConditionalEdges('summarize', confirmRoute, {
    confirm: 'confirm',
    end:     END,
  })
  .addEdge('confirm', 'submit')
  .addEdge('submit',  END)
  .compile()
