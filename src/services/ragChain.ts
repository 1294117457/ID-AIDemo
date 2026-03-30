import { ChatOpenAI } from '@langchain/openai'
import { HumanMessage, SystemMessage, AIMessage } from '@langchain/core/messages'
import { getEmbedding } from './embeddings.js'
import { searchSimilar } from './vectorStore.js'
import { getDb } from '../db/init.js'

const chatModel = new ChatOpenAI({
  apiKey: process.env.QWEN3_API_KEY,
  configuration: { baseURL: process.env.QWEN_BASE_URL ?? 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
  modelName: process.env.QWEN_CHAT_MODEL ?? 'qwen3-max',
  temperature: 0.3,
})

const SYSTEM_BASE = `你是厦门大学信息学院保研加分助手。
你的职责是：帮助学生和老师了解保研综合成绩加分政策、申请流程及系统操作。
回答时请以下列知识库内容为主要依据，如果知识库没有相关信息，请如实告知。
回答语言：中文，简洁专业。`

/** 从 DB 中取该 session 最近 N 条历史 */
function getHistory(sessionId: string, limit = 6): { role: string; content: string }[] {
  return getDb()
    .prepare(
      'SELECT role, content FROM conversations WHERE session_id = ? ORDER BY created_at DESC LIMIT ?'
    )
    .all(sessionId, limit) as { role: string; content: string }[]
}

/** 保存一条消息 */
function saveMessage(sessionId: string, role: string, content: string): void {
  getDb()
    .prepare('INSERT INTO conversations (session_id, role, content) VALUES (?, ?, ?)')
    .run(sessionId, role, content)
}

/** RAG 对话 */
export async function chatWithAgent(sessionId: string, userMessage: string): Promise<string> {
  // 1. 检索相关知识块
  const queryVec = await getEmbedding(userMessage)
  const chunks = searchSimilar(queryVec, 5)

  const contextText =
    chunks.length > 0
      ? chunks.map((c, i) => `[${i + 1}] ${c.content}`).join('\n\n')
      : '（知识库暂无相关内容）'

  // 2. 构建消息数组
  const systemMsg = new SystemMessage(`${SYSTEM_BASE}\n\n【相关知识库内容】\n${contextText}`)

  // 3. 拼接历史（倒序取出后反转为正序）
  const history = getHistory(sessionId).reverse()
  const historyMsgs = history.map(h =>
    h.role === 'user' ? new HumanMessage(h.content) : new AIMessage(h.content)
  )

  const messages = [systemMsg, ...historyMsgs, new HumanMessage(userMessage)]

  // 4. 调用 Qwen3
  const response = await chatModel.invoke(messages)
  const reply = String(response.content)

  // 5. 存储历史
  saveMessage(sessionId, 'user', userMessage)
  saveMessage(sessionId, 'assistant', reply)

  return reply
}

/** 清除 session 历史 */
export function clearConversation(sessionId: string): void {
  getDb()
    .prepare('DELETE FROM conversations WHERE session_id = ?')
    .run(sessionId)
}
