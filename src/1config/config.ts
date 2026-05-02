// ─── Layer 1: Config — 环境配置 + 数据库初始化 ───────────────────────────────
// 所有外部依赖（API Key、URL、DB）集中在此管理，其他层通过函数获取，不直接读 process.env

import 'dotenv/config'
import Database from 'better-sqlite3'
import { mkdirSync } from 'fs'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_PATH    = path.resolve(__dirname, '../../data/agent.db')
export const CHECKPOINT_PATH = path.resolve(__dirname, '../../data/checkpoints.db')

// ── SQLite ─────────────────────────────────────────────────────────────────────

let _db: Database.Database | null = null

export function getDb(): Database.Database {
  if (!_db) throw new Error('DB not initialized. Call initDb() first.')
  return _db
}

export function initDb(): void {
  mkdirSync(path.dirname(DB_PATH), { recursive: true })
  _db = new Database(DB_PATH)

  _db.exec(`
    CREATE TABLE IF NOT EXISTS ai_config (
      config_key   TEXT PRIMARY KEY,
      config_value TEXT NOT NULL,
      updated_at   INTEGER NOT NULL DEFAULT (unixepoch())
    );

    INSERT OR IGNORE INTO ai_config (config_key, config_value) VALUES
      ('system_role',          '你是厦门大学信息学院保研加分助手。你的职责是：帮助学生和老师了解保研综合成绩加分政策、申请流程及系统操作。回答时请以下列知识库内容为主要依据，如果知识库没有相关信息，请如实告知。回答语言：中文，简洁专业。'),
      ('api_key',              ''),
      ('base_url',             'https://dashscope.aliyuncs.com/compatible-mode/v1'),
      ('chat_model',           'qwen3-max'),
      ('embedding_model',      'text-embedding-v3'),
      ('context_max_messages', '20');
  `)

  console.log('[db] initialized at', DB_PATH)
}

// ── AI 配置（从 SQLite 读取，TTL 缓存，fallback 到 .env）────────────────────────

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

function invalidate(): void { _cache = null }

export function getSystemRole(): string {
  return loadAll()['system_role']
    ?? '你是厦门大学信息学院保研加分助手。回答语言：中文，简洁专业。'
}

export function getApiKey(): string {
  const fromDb = loadAll()['api_key'] ?? ''
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

// ── 配置视图 & 更新 (供 api 层调用) ──────────────────────────────────────────────

export function getConfigView() {
  const cfg = loadAll()
  const raw = cfg['api_key'] ?? ''
  const maskedKey = raw.length >= 8
    ? raw.slice(0, 4) + '****' + raw.slice(-4)
    : raw.length > 0 ? '****' : ''
  return {
    systemRole:         cfg['system_role']          ?? '',
    apiKey:             maskedKey,
    baseUrl:            cfg['base_url']             ?? '',
    chatModel:          cfg['chat_model']           ?? '',
    embeddingModel:     cfg['embedding_model']      ?? '',
    contextMaxMessages: parseInt(cfg['context_max_messages'] ?? '20', 10),
  }
}

export interface ConfigUpdate {
  systemRole?:         string
  apiKey?:             string
  baseUrl?:            string
  chatModel?:          string
  embeddingModel?:     string
  contextMaxMessages?: number
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
  if (update.systemRole    != null) entries.push(['system_role',     update.systemRole])
  if (update.apiKey        != null && update.apiKey.trim() !== '')
                                     entries.push(['api_key',         update.apiKey.trim()])
  if (update.baseUrl       != null) entries.push(['base_url',        update.baseUrl])
  if (update.chatModel     != null) entries.push(['chat_model',      update.chatModel])
  if (update.embeddingModel!= null) entries.push(['embedding_model', update.embeddingModel])
  if (update.contextMaxMessages != null)
    entries.push(['context_max_messages', String(update.contextMaxMessages)])

  if (entries.length > 0) { upsertMany(entries); invalidate() }
}
