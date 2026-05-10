// ─── confirmNode — 确认路由 + 确认节点 ──────────────────────────────────────
// 归属：apply 子图
// confirmRoute：Router，判断是否有匹配结果
// confirmNode：Node，interrupt 等待前端确认

import { HumanMessage, AIMessage } from '@langchain/core/messages'
import { interrupt } from '@langchain/langgraph'
import type { ApplyStateType } from '../../../3state/state.js'
import { parseCheckResults } from '../utils.js'

// ── Router ───────────────────────────────────────────────────────────────

/**
 * 路由判断：有匹配结果 → 进入 confirm 等待用户确认；无结果 → 直接结束
 */
export function confirmRoute(state: ApplyStateType): 'confirm' | 'end' {
  const suggestions = parseCheckResults(state.checkResults)
  return suggestions.length > 0 ? 'confirm' : 'end'
}

// ── Node ─────────────────────────────────────────────────────────────────

/**
 * 等待用户确认并上传证明材料（interrupt）
 *
 * 通过 interrupt 暂停 LangGraph，等待前端：
 *   - 用户点击「确认提交」→ 传入 { action: 'confirm', proofFileIds: [...] }
 *   - 用户点击「取消」→ 传入 { action: 'cancel' }
 */
export async function confirmNode(
  state: ApplyStateType
): Promise<Partial<ApplyStateType>> {
  console.log('--apply:confirm (interrupt)')

  const suggestions = parseCheckResults(state.checkResults)

  const question = [
    `已为您匹配到以下加分项，请上传对应证明材料后点击「确认提交」：`,
    '',
    ...suggestions.map((s: any, i: number) =>
      `${i + 1}. **${s.templateName}** / ${s.ruleName}（预计 ${s.estimatedScore} 分）\n ${s.reason}`
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
