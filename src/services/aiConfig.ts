import { getDb } from '../db/init.js'

// 内存缓存 + TTL，MCP 子进程也能在 TTL 过期后读到最新配置
let _cache: Record<string, string> | null = null
let _cacheTime = 0
const CACHE_TTL = 60_000

function loadAll(): Record<string, string> {
  if (_cache && Date.now() - _cacheTime < CACHE_TTL) return _cache
  const rows = getDb()
    .prepare('SELECT config_key, config_value FROM ai_config')
    .all() as { config_key: string; config_value: string }[]
  _cache = Object.fromEntries(rows.map(r => [r.config_key, r.config_value]))
  _cacheTime = Date.now()
  return _cache
}

function invalidate(): void {
  _cache = null
}

// ---- 读取函数（供各 service 调用）----

export function getSystemRole(): string {
  return loadAll()['system_role']
    ?? '你是厦门大学信息学院保研加分助手。回答语言：中文，简洁专业。'
}

export function getApiKey(): string {
  const fromDb = loadAll()['api_key'] ?? ''
  // DB 为空时回退到环境变量，保持向后兼容
  return fromDb.trim() !== '' ? fromDb : (process.env.QWEN3_API_KEY ?? '')
}

export function getBaseUrl(): string {
  return loadAll()['base_url']
    ?? process.env.QWEN_BASE_URL
    ?? 'https://dashscope.aliyuncs.com/compatible-mode/v1'
}

export function getChatModel(): string {
  return loadAll()['chat_model']
    ?? process.env.QWEN_CHAT_MODEL
    ?? 'qwen3-max'
}

export function getEmbeddingModel(): string {
  return loadAll()['embedding_model']
    ?? process.env.QWEN_EMBEDDING_MODEL
    ?? 'text-embedding-v3'
}

export function getContextMaxMessages(): number {
  const val = loadAll()['context_max_messages']
  const n = parseInt(val ?? '20', 10)
  return isNaN(n) || n < 2 ? 20 : n
}

// ---- GET /config 返回视图（apiKey 掩码）----

export function getConfigView() {
  const cfg = loadAll()
  const raw = cfg['api_key'] ?? ''
  const maskedKey = raw.length >= 8
    ? raw.slice(0, 4) + '****' + raw.slice(-4)
    : raw.length > 0 ? '****' : ''
  return {
    systemRole:          cfg['system_role']          ?? '',
    apiKey:              maskedKey,
    baseUrl:             cfg['base_url']             ?? '',
    chatModel:           cfg['chat_model']           ?? '',
    embeddingModel:      cfg['embedding_model']      ?? '',
    contextMaxMessages:  parseInt(cfg['context_max_messages'] ?? '20', 10),
  }
}

// ---- PUT /config 写入（upsert + 清缓存）----

export interface ConfigUpdate {
  systemRole?:          string
  apiKey?:              string
  baseUrl?:             string
  chatModel?:           string
  embeddingModel?:      string
  contextMaxMessages?:  number
}

export function updateConfig(update: ConfigUpdate): void {
  const db = getDb()
  const upsert = db.prepare(
    `INSERT INTO ai_config (config_key, config_value, updated_at)
     VALUES (?, ?, unixepoch())
     ON CONFLICT(config_key) DO UPDATE
     SET config_value = excluded.config_value, updated_at = unixepoch()`
  )
  const upsertMany = db.transaction((entries: [string, string][]) => {
    for (const [k, v] of entries) upsert.run(k, v)
  })

  const entries: [string, string][] = []
  if (update.systemRole     != null) entries.push(['system_role',     update.systemRole])
  if (update.apiKey         != null && update.apiKey.trim() !== '')
                                      entries.push(['api_key',         update.apiKey.trim()])
  if (update.baseUrl        != null) entries.push(['base_url',        update.baseUrl])
  if (update.chatModel      != null) entries.push(['chat_model',      update.chatModel])
  if (update.embeddingModel != null) entries.push(['embedding_model', update.embeddingModel])
  if (update.contextMaxMessages != null)
    entries.push(['context_max_messages', String(update.contextMaxMessages)])

  if (entries.length > 0) {
    upsertMany(entries)
    invalidate()
  }
}
