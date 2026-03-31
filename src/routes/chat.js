import { Router } from 'express';
import { chatWithAgent, chatWithAgentStream, clearConversation } from '../services/ragChain.js';
const router = Router();
router.post('/send', async (req, res) => {
    const { sessionId, message } = req.body;
    if (!sessionId || !message?.trim()) {
        res.json({ code: 400, msg: '缺少 sessionId 或 message', data: null });
        return;
    }
    try {
        const reply = await chatWithAgent(sessionId, message.trim());
        res.json({ code: 200, msg: '成功', data: { reply }, aiAvailable: true });
    }
    catch (err) {
        console.error('[chat/send] error:', err);
        res.json({ code: 200, msg: 'AI服务暂时不可用，请稍后重试', data: null, aiAvailable: false });
    }
});
/** 流式聊天：返回 SSE 流，每个 token 一个 data 事件，结束发 [DONE] */
router.post('/stream', async (req, res) => {
    const { sessionId, message } = req.body;
    if (!sessionId || !message?.trim()) {
        res.json({ code: 400, msg: '缺少 sessionId 或 message', data: null });
        return;
    }
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // 禁用 Nginx 缓冲
    res.flushHeaders();
    try {
        for await (const token of chatWithAgentStream(sessionId, message.trim())) {
            res.write(`data: ${JSON.stringify({ token })}\n\n`);
        }
        res.write('data: [DONE]\n\n');
    }
    catch (err) {
        console.error('[chat/stream] error:', err);
        res.write(`data: ${JSON.stringify({ error: 'AI服务暂时不可用，请稍后重试' })}\n\n`);
    }
    finally {
        res.end();
    }
});
router.post('/clear', (req, res) => {
    const { sessionId } = req.body;
    if (!sessionId) {
        res.json({ code: 400, msg: '缺少 sessionId', data: null });
        return;
    }
    clearConversation(sessionId);
    res.json({ code: 200, msg: '对话已清除', data: null });
});
export default router;
//# sourceMappingURL=chat.js.map