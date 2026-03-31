import { getDb } from '../db/init.js';
// 内存缓存，避免每次 LLM 调用都查 SQLite
let _cache = null;
function loadAll() {
    if (_cache)
        return _cache;
    const rows = getDb()
        .prepare('SELECT config_key, config_value FROM ai_config')
        .all();
    _cache = Object.fromEntries(rows.map(r => [r.config_key, r.config_value]));
    return _cache;
}
function invalidate() {
    _cache = null;
}
// ---- 读取函数（供各 service 调用）----
export function getSystemRole() {
    return loadAll()['system_role']
        ?? '你是厦门大学信息学院保研加分助手。回答语言：中文，简洁专业。';
}
export function getApiKey() {
    const fromDb = loadAll()['api_key'] ?? '';
    // DB 为空时回退到环境变量，保持向后兼容
    return fromDb.trim() !== '' ? fromDb : (process.env.QWEN3_API_KEY ?? '');
}
export function getBaseUrl() {
    return loadAll()['base_url']
        ?? process.env.QWEN_BASE_URL
        ?? 'https://dashscope.aliyuncs.com/compatible-mode/v1';
}
export function getChatModel() {
    return loadAll()['chat_model']
        ?? process.env.QWEN_CHAT_MODEL
        ?? 'qwen3-max';
}
export function getEmbeddingModel() {
    return loadAll()['embedding_model']
        ?? process.env.QWEN_EMBEDDING_MODEL
        ?? 'text-embedding-v3';
}
// ---- GET /config 返回视图（apiKey 掩码）----
export function getConfigView() {
    const cfg = loadAll();
    const raw = cfg['api_key'] ?? '';
    const maskedKey = raw.length >= 8
        ? raw.slice(0, 4) + '****' + raw.slice(-4)
        : raw.length > 0 ? '****' : '';
    return {
        systemRole: cfg['system_role'] ?? '',
        apiKey: maskedKey,
        baseUrl: cfg['base_url'] ?? '',
        chatModel: cfg['chat_model'] ?? '',
        embeddingModel: cfg['embedding_model'] ?? '',
    };
}
export function updateConfig(update) {
    const db = getDb();
    const upsert = db.prepare(`INSERT INTO ai_config (config_key, config_value, updated_at)
     VALUES (?, ?, unixepoch())
     ON CONFLICT(config_key) DO UPDATE
     SET config_value = excluded.config_value, updated_at = unixepoch()`);
    const upsertMany = db.transaction((entries) => {
        for (const [k, v] of entries)
            upsert.run(k, v);
    });
    const entries = [];
    if (update.systemRole != null)
        entries.push(['system_role', update.systemRole]);
    if (update.apiKey != null && update.apiKey.trim() !== '')
        entries.push(['api_key', update.apiKey.trim()]);
    if (update.baseUrl != null)
        entries.push(['base_url', update.baseUrl]);
    if (update.chatModel != null)
        entries.push(['chat_model', update.chatModel]);
    if (update.embeddingModel != null)
        entries.push(['embedding_model', update.embeddingModel]);
    if (entries.length > 0) {
        upsertMany(entries);
        invalidate();
    }
}
//# sourceMappingURL=aiConfig.js.map