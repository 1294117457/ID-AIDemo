/**
 * 只管 ai_config 表，不关心租户
 * getSystemRole、getApiKey、getBaseUrl、getChatModel、getEmbeddingModel、getVendor、getEmbeddingVendor、getContextMaxMessages、getSystemConfigView、updateSystemConfig
 * invalidate、loadAll
 * 获取systemRole,apiKey,BaseUrl,chatModel,embeddingModel,contextMaxMessages,vendor,embeddingVendor
 */

import { getDb } from '../db/index.js'

let _cache: Record<string, string> | null = null
let _cacheTime = 0
const CACHE_TTL = 60_000
/**
 * 从数据库中加载所有配置
 * @returns 所有配置的键值对
 */
export function loadAll(): Record<string, string> {
  if (_cache && Date.now() - _cacheTime < CACHE_TTL) return _cache
  const rows = getDb()
    .prepare('SELECT config_key, config_value FROM ai_config')
    .all() as { config_key: string; config_value: string }[]
  _cache = Object.fromEntries(rows.map(r => [r.config_key, r.config_value]))
  _cacheTime = Date.now()
  return _cache
}
/**
 * 无效化缓存
 */
export function invalidate(): void { _cache = null }
/**
 * 
 * @returns 系统角色
 */
export function getSystemRole(): string {
  return loadAll()['system_role']
    ?? '你是厦门大学信息学院保研加分助手。回答语言：中文，简洁专业。'
}
/**
 * 
 * @returns apiKey
 */
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
/**
 * 
 * @returns 供应商
 */
export function getVendor(): string {
  return loadAll()['vendor'] ?? 'qwen'
}
/**
 * 
 * @returns 嵌入供应商
 */
export function getEmbeddingVendor(): string {
  return loadAll()['embedding_vendor'] ?? getVendor()
}
/**
 * 
 * @returns 上下文最大消息数
 */
export function getContextMaxMessages(): number {
  const val = loadAll()['context_max_messages']
  const n = parseInt(val ?? '20', 10)
  return isNaN(n) || n < 2 ? 20 : n
}
/**
 * 
 * @returns 系统配置视图
 */
export interface SystemConfigView {
  systemRole:         string
  apiKey:             string
  baseUrl:            string
  chatModel:          string
  embeddingModel:     string
  contextMaxMessages: number
  vendor:             string
  embeddingVendor:    string
}
/**
 * 获取系统配置视图
 * @returns 系统配置视图
 */
export function getSystemConfigView(): SystemConfigView {
  const cfg = loadAll()
  const raw = cfg['api_key'] ?? ''
  const maskedKey = raw.length >= 8
    ? raw.slice(0, 4) + '****' + raw.slice(-4)
    : raw.length > 0 ? '****' : ''
  return {
    systemRole:         cfg['system_role'] ?? '',
    apiKey:             maskedKey,
    baseUrl:            cfg['base_url'] ?? '',
    chatModel:          cfg['chat_model'] ?? '',
    embeddingModel:     cfg['embedding_model'] ?? '',
    contextMaxMessages: parseInt(cfg['context_max_messages'] ?? '20', 10),
    vendor:             cfg['vendor'] ?? 'qwen',
    embeddingVendor:    cfg['embedding_vendor'] ?? 'qwen',
  }
}
/**
 * 系统配置更新
 * @returns 系统配置更新
 */
export interface SystemConfigUpdate {
  systemRole?:         string
  apiKey?:             string
  baseUrl?:            string
  chatModel?:          string
  embeddingModel?:      string
  contextMaxMessages?: number
  vendor?:              string
  embeddingVendor?:     string
}
/**
 * 
 * @param updates 系统配置更新
 */
export function updateSystemConfig(updates: SystemConfigUpdate): void {
  const db = getDb()
  const upsert = db.prepare(
    `INSERT INTO ai_config (config_key, config_value, updated_at)
     VALUES (?, ?, unixepoch())
     ON CONFLICT(config_key) DO UPDATE
     SET config_value = excluded.config_value, updated_at = unixepoch()`
  )
  const tx = db.transaction((entries: [string, string][]) => {
    for (const [k, v] of entries) upsert.run(k, v)
  })
  const entries: [string, string][] = []
  if (updates.systemRole    != null) entries.push(['system_role',         updates.systemRole])
  if (updates.apiKey        != null && updates.apiKey.trim() !== '')
                                       entries.push(['api_key',             updates.apiKey.trim()])
  if (updates.baseUrl       != null) entries.push(['base_url',            updates.baseUrl])
  if (updates.chatModel     != null) entries.push(['chat_model',          updates.chatModel])
  if (updates.embeddingModel!= null) entries.push(['embedding_model',    updates.embeddingModel])
  if (updates.contextMaxMessages != null)
                                       entries.push(['context_max_messages', String(updates.contextMaxMessages)])
  if (updates.vendor        != null) entries.push(['vendor',              updates.vendor])
  if (updates.embeddingVendor!= null) entries.push(['embedding_vendor',    updates.embeddingVendor])
  if (entries.length > 0) { tx(entries); invalidate() }
}