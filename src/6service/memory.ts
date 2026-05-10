// ─── Layer 5: 对话记忆压缩 ─────────────────────────────────────────────────
// 解决多轮对话中 messages 无限膨胀的问题

import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages'
import { createChatModel } from '../2model/model.js'
import { COMPRESS_THRESHOLD, KEEP_RECENT } from '../1common/constants.js'

const SUMMARY_PROMPT = `你是一个对话历史压缩助手。请将以下对话记录压缩为一段简洁的摘要。

要求：
- 保留所有关键信息（用户意图、关键数据、系统结论、用户已提交的材料内容）
- 去掉重复的表达和无效寒暄
- 如果有申请类操作，记录申请状态（是否提交、申请编号等）
- 输出格式：一段连贯的文字，最多 300 字
- 语言：中文

对话记录：
{conversation}

请直接输出摘要，不需要额外说明。`

let _summaryModel: ReturnType<typeof createChatModel> | null = null

function getSummaryModel() {
  if (!_summaryModel) _summaryModel = createChatModel(0.1)
  return _summaryModel
}

export async function compressMessages(
  messages: (HumanMessage | AIMessage)[]
): Promise<(HumanMessage | AIMessage | SystemMessage)[]> {
  const splitAt = Math.max(0, messages.length - KEEP_RECENT)
  const old    = messages.slice(0, splitAt)
  const recent = messages.slice(splitAt)

  if (old.length === 0) return recent

  const convText = old
    .map(m => {
      const role = m._getType() === 'human' ? '用户' : '助手'
      return `${role}：${m.content}`
    })
    .join('\n')

  const result = await getSummaryModel().invoke([
    new SystemMessage(SUMMARY_PROMPT.replace('{conversation}', convText)),
  ])

  const summary = String(result.content).trim()

  const parts: (HumanMessage | AIMessage | SystemMessage)[] = []

  if (summary.length > 10) {
    parts.push(
      new SystemMessage(
        `【早期对话摘要】以下是对之前对话的压缩总结，后续对话请结合此摘要理解上下文。\n\n${summary}`
      )
    )
  }

  parts.push(...recent)
  return parts
}

export function shouldCompress(messageCount: number): boolean {
  return messageCount >= COMPRESS_THRESHOLD
}
