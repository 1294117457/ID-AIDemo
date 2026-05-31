/**
 * 租户级配置读取/写入
 */
import { getDb } from '../db/index.js'
import { loadAll as loadSystemConfig } from './system.js'

/**
 * 获取指定租户的某项配置值
 * 先查租户专属配置，无则回退 system 级
 */
export function getTenantConfig(tenantId: string, key: string): string | null {
  const db = getDb()
  const row = db.prepare(
    `SELECT config_value FROM ai_tenant_config WHERE tenant_id = ? AND config_key = ?`
  ).get(tenantId, key) as { config_value: string } | undefined
  if (row) return row.config_value
  // 回退到 system 级
  return loadSystemConfig()[key] ?? null
}

/**
 * 获取指定租户的所有配置（合并后结果）
 * 租户级覆盖 system 级，未覆盖的字段用 system 级值
 */
export function getAllConfigsForTenant(tenantId: string): Record<string, string> {
  const db = getDb()
  const systemRows = db.prepare(
    `SELECT config_key, config_value FROM ai_config`
  ).all() as { config_key: string; config_value: string }[]
  const result: Record<string, string> = {}
  for (const r of systemRows) result[r.config_key] = r.config_value
  const tenantRows = db.prepare(
    `SELECT config_key, config_value FROM ai_tenant_config WHERE tenant_id = ?`
  ).all(tenantId) as { config_key: string; config_value: string }[]
  for (const r of tenantRows) result[r.config_key] = r.config_value
  return result
}
/**
 * 
 * @param tenantId 租户ID
 * @returns apiKey
 */
export function getTenantApiKey(tenantId: string): string {
  const k = getTenantConfig(tenantId, 'api_key') ?? ''
  return k.trim() !== '' ? k : (process.env.QWEN3_API_KEY ?? '')
}
/**
 * 
 * @param tenantId 租户ID
 * @returns baseUrl
 */
export function getTenantBaseUrl(tenantId: string): string {
  return getTenantConfig(tenantId, 'base_url')
    ?? process.env.QWEN_BASE_URL
    ?? 'https://dashscope.aliyuncs.com/compatible-mode/v1'
}
/**
 * 
 * @param tenantId 租户ID
 * @returns chatModel
 */
export function getTenantChatModel(tenantId: string): string {
  return getTenantConfig(tenantId, 'chat_model')
    ?? process.env.QWEN_CHAT_MODEL
    ?? 'qwen3-max'
}
/**
 * 
 * @param tenantId 租户ID
 * @returns embeddingModel
 */
export function getTenantEmbeddingModel(tenantId: string): string {
  return getTenantConfig(tenantId, 'embedding_model')
    ?? process.env.QWEN_EMBEDDING_MODEL
    ?? 'text-embedding-v3'
}
/**
 * 
 * @param tenantId 租户ID
 * @returns vendor
 */
export function getTenantVendor(tenantId: string): string {
  return getTenantConfig(tenantId, 'vendor') ?? 'qwen'
}
/**
 * 
 * @param tenantId 租户ID
 * @returns embeddingVendor
 */
export function getTenantEmbeddingVendor(tenantId: string): string {
  return getTenantConfig(tenantId, 'embedding_vendor') ?? getTenantVendor(tenantId)
}
/**
 * 
 */
export interface TenantConfigUpdate {
  apiKey?:         string
  baseUrl?:        string
  chatModel?:      string
  embeddingModel?: string
  vendor?:         string
  embeddingVendor?:string
  systemRole?:     string
  contextMaxMessages?: number
}

/**
 * 更新租户配置（写入 ai_tenant_config）
 * @param tenantId  租户 ID
 * @param updates   要更新的配置项
 */
export function updateTenantConfig(tenantId: string, updates: TenantConfigUpdate): void {
  const db = getDb()
  const upsert = db.prepare(
    `INSERT INTO ai_tenant_config (tenant_id, config_key, config_value, updated_at)
     VALUES (?, ?, ?, unixepoch())
     ON CONFLICT(tenant_id, config_key) DO UPDATE
     SET config_value = excluded.config_value, updated_at = unixepoch()`
  )
  const tx = db.transaction((entries: [string, string][]) => {
    for (const [k, v] of entries) upsert.run(tenantId, k, v)
  })
  const entries: [string, string][] = []
  if (updates.apiKey          != null && updates.apiKey.trim() !== '')
                                       entries.push(['api_key',           updates.apiKey.trim()])
  if (updates.baseUrl         != null) entries.push(['base_url',          updates.baseUrl])
  if (updates.chatModel       != null) entries.push(['chat_model',        updates.chatModel])
  if (updates.embeddingModel  != null) entries.push(['embedding_model',  updates.embeddingModel])
  if (updates.vendor          != null) entries.push(['vendor',            updates.vendor])
  if (updates.embeddingVendor  != null) entries.push(['embedding_vendor', updates.embeddingVendor])
  if (updates.systemRole      != null) entries.push(['system_role',      updates.systemRole])
  if (updates.contextMaxMessages != null)
                                       entries.push(['context_max_messages', String(updates.contextMaxMessages)])
  if (entries.length > 0) {
    tx(entries)
    // 触发热切换通知（router.ts 会订阅）
    for (const [k, v] of entries) {
      listeners.forEach(fn => { try { fn(tenantId, k, v) } catch (_) {} })
    }
  }
}

// ── 热切换监听器 ─────────────────────────────────────────────────────────────

type Listener = (tenantId: string, key: string, value: string) => void
const listeners: Listener[] = []

/**
 * 订阅配置变更事件
 * @returns 取消订阅函数
 */
export function onConfigChange(listener: Listener): () => void {
  listeners.push(listener)
  return () => {
    const idx = listeners.indexOf(listener)
    if (idx !== -1) listeners.splice(idx, 1)
  }
}