// ─── confirmNode — 确认路由 + 确认节点 ──────────────────────────────────────
// 归属：apply 子图

import { HumanMessage, AIMessage } from '@langchain/core/messages'
import { interrupt } from '@langchain/langgraph'
import type { ApplyState } from '../../../3state/index.js'
import { parseCheckResults } from '../utils.js'

/**
 * 路由判断：有匹配结果 → 进入 confirm 等待用户确认；无结果 → 直接结束
 */
export function confirmRoute(state: ApplyState): 'confirm' | 'end' {
  const suggestions = parseCheckResults(state.checkResults)
  return suggestions.length > 0 ? 'confirm' : 'end'
}

/**
 * 等待用户确认并上传证明材料（interrupt）
 */
export async function confirmNode(
  state: ApplyState
): Promise<Partial<ApplyState>> {
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
