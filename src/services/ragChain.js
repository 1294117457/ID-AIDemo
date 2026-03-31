import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage, AIMessage } from '@langchain/core/messages';
import { getEmbedding } from './embeddings.js';
import { searchSimilar } from './vectorStore.js';
import { getDb } from '../db/init.js';
import { getApiKey, getBaseUrl, getChatModel, getSystemRole } from './aiConfig.js';
function createChatModel() {
    return new ChatOpenAI({
        apiKey: getApiKey(),
        configuration: { baseURL: getBaseUrl() },
        modelName: getChatModel(),
        temperature: 0.3,
    });
}
/** 从 DB 中取该 session 最近 N 条历史 */
function getHistory(sessionId, limit = 6) {
    return getDb()
        .prepare('SELECT role, content FROM conversations WHERE session_id = ? ORDER BY created_at DESC LIMIT ?')
        .all(sessionId, limit);
}
/** 保存一条消息 */
function saveMessage(sessionId, role, content) {
    getDb()
        .prepare('INSERT INTO conversations (session_id, role, content) VALUES (?, ?, ?)')
        .run(sessionId, role, content);
}
/** 构建对话消息数组（供两种调用方式共用） */
function buildMessages(sessionId, userMessage, contextText) {
    const SYSTEM_BASE = getSystemRole();
    const systemMsg = new SystemMessage(`${SYSTEM_BASE}\n\n【相关知识库内容】\n${contextText}`);
    const history = getHistory(sessionId).reverse();
    const historyMsgs = history.map(h => h.role === 'user' ? new HumanMessage(h.content) : new AIMessage(h.content));
    return [systemMsg, ...historyMsgs, new HumanMessage(userMessage)];
}
/** 准备 RAG 上下文 */
async function buildContext(userMessage) {
    const queryVec = await getEmbedding(userMessage);
    const chunks = searchSimilar(queryVec, 5);
    return chunks.length > 0
        ? chunks.map((c, i) => `[${i + 1}] ${c.content}`).join('\n\n')
        : '（知识库暂无相关内容）';
}
/** RAG 对话（非流式，保留兼容） */
export async function chatWithAgent(sessionId, userMessage) {
    const chatModel = createChatModel();
    const contextText = await buildContext(userMessage);
    const msgs = buildMessages(sessionId, userMessage, contextText);
    const response = await chatModel.invoke(msgs);
    const reply = String(response.content);
    saveMessage(sessionId, 'user', userMessage);
    saveMessage(sessionId, 'assistant', reply);
    return reply;
}
/** RAG 对话（流式，逐 token yield） */
export async function* chatWithAgentStream(sessionId, userMessage) {
    const chatModel = createChatModel();
    const contextText = await buildContext(userMessage);
    const msgs = buildMessages(sessionId, userMessage, contextText);
    let fullReply = '';
    const stream = await chatModel.stream(msgs);
    for await (const chunk of stream) {
        const token = String(chunk.content);
        if (token) {
            fullReply += token;
            yield token;
        }
    }
    // 流式完成后统一保存历史
    saveMessage(sessionId, 'user', userMessage);
    saveMessage(sessionId, 'assistant', fullReply);
}
/** 清除 session 历史 */
export function clearConversation(sessionId) {
    getDb()
        .prepare('DELETE FROM conversations WHERE session_id = ?')
        .run(sessionId);
}
//# sourceMappingURL=ragChain.js.map