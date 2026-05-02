// ─── 对话记忆压缩模块 ─────────────────────────────────────────────────────────
// 解决多轮对话中 messages 无限膨胀的问题
// 策略：触发阈值时，将早期对话压缩为摘要，保留最近 N 条完整消息
import { SystemMessage } from '@langchain/core/messages';
import { createChatModel } from '../2model/model.js';
// ── 配置 ─────────────────────────────────────────────────────────────────────
/** 触发压缩的最小消息数（含 AI 回复） */
const COMPRESS_THRESHOLD = 12;
/** 压缩后保留的最新消息条数（完整细节不压缩） */
const KEEP_RECENT = 5;
/** 摘要模型温度（越低越稳定） */
const SUMMARY_TEMPERATURE = 0.1;
// ── 摘要 Prompt ─────────────────────────────────────────────────────────────
const SUMMARY_PROMPT = `你是一个对话历史压缩助手。请将以下对话记录压缩为一段简洁的摘要。

要求：
- 保留所有关键信息（用户意图、关键数据、系统结论、用户已提交的材料内容）
- 去掉重复的表达和无效寒暄
- 如果有申请类操作，记录申请状态（是否提交、申请编号等）
- 输出格式：一段连贯的文字，最多 300 字
- 语言：中文

对话记录：
{conversation}

请直接输出摘要，不需要额外说明。`;
// ── 核心压缩函数 ─────────────────────────────────────────────────────────────
/** 延迟初始化，避免在模块加载时 db 还未初始化 */
let _summaryModel = null;
function getSummaryModel() {
    if (!_summaryModel)
        _summaryModel = createChatModel(SUMMARY_TEMPERATURE);
    return _summaryModel;
}
/**
 * 将一段对话压缩为摘要文字
 */
export async function summarizeConversation(messages) {
    if (messages.length === 0)
        return '';
    const convText = messages
        .map(m => {
        const role = m._getType() === 'human' ? '用户' : '助手';
        return `${role}：${m.content}`;
    })
        .join('\n');
    const result = await getSummaryModel().invoke([
        new SystemMessage(SUMMARY_PROMPT.replace('{conversation}', convText)),
    ]);
    return String(result.content).trim();
}
/**
 * 判断当前消息数是否需要压缩
 */
export function shouldCompress(messageCount) {
    return messageCount >= COMPRESS_THRESHOLD;
}
/**
 * 将消息分为"待压缩的旧消息"和"保留的最近消息"
 */
export function splitMessages(messages) {
    const splitAt = Math.max(0, messages.length - KEEP_RECENT);
    return {
        old: messages.slice(0, splitAt),
        recent: messages.slice(splitAt),
    };
}
/**
 * 执行压缩：旧消息 → 摘要，新消息 → 保留
 * 返回压缩后的消息列表（可用于更新 Checkpoint）
 */
export async function compressMessages(messages) {
    const { old, recent } = splitMessages(messages);
    // 消息太少，不需要压缩，直接返回原列表
    if (old.length === 0)
        return recent;
    const summary = await summarizeConversation(old);
    const parts = [];
    // 如果摘要有效，注入摘要 system message
    if (summary && summary.length > 10) {
        parts.push(new SystemMessage(`【早期对话摘要】以下是对之前对话的压缩总结，后续对话请结合此摘要理解上下文。\n\n${summary}`));
    }
    // 附加最近保留的完整消息
    parts.push(...recent);
    return parts;
}
/**
 * 获取当前配置的阈值（供外部调用）
 */
export function getCompressThreshold() {
    return COMPRESS_THRESHOLD;
}
/**
 * 获取保留的最新消息数（供外部调用）
 */
export function getKeepRecent() {
    return KEEP_RECENT;
}
