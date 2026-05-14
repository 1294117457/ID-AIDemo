/**
 * 配置版本快照 + 回滚
 */
import { getDb } from '../db/index.js'

/**
 * 写入一条配置版本快照
 * 在 updateSystemConfig / updateTenantConfig 变更前调用，保存变更前的值
 */
export function snapshotConfigVersion(
  tenantId: string,
  key: string,
  oldValue: string
): void {
  const db = getDb()
  const row = db.prepare(
    `SELECT MAX(version) AS max_ver FROM ai_config_version
     WHERE tenant_id = ? AND config_key = ?`
  ).get(tenantId, key) as { max_ver: number | null }
  const nextVersion = (row?.max_ver ?? 0) + 1
  db.prepare(
    `INSERT INTO ai_config_version (tenant_id, config_key, config_value, version, created_at)
     VALUES (?, ?, ?, ?, datetime('now'))`
  ).run(tenantId, key, oldValue, nextVersion)
}

/**
 * 获取指定租户某配置的版本历史
 */
export function getConfigVersions(
  tenantId: string,
  key: string
): Array<{ version: number; value: string; created_at: string }> {
  return getDb().prepare(
    `SELECT version, config_value AS value, created_at
     FROM ai_config_version
     WHERE tenant_id = ? AND config_key = ?
     ORDER BY version DESC`
  ).all(tenantId, key) as Array<{ version: number; value: string; created_at: string }>
}

/**
 * 回滚到指定版本
 * @returns 回滚是否成功
 */
export function rollbackConfig(
  tenantId: string,
  key: string,
  version: number
): boolean {
  const db = getDb()
  const row = db.prepare(
    `SELECT config_value FROM ai_config_version
     WHERE tenant_id = ? AND config_key = ? AND version = ?`
  ).get(tenantId, key, version) as { config_value: string } | undefined
  if (!row) return false

  // 先快照当前值（以便再次回滚）
  const currentRow = db.prepare(
    `SELECT config_value FROM ai_tenant_config WHERE tenant_id = ? AND config_key = ?`
  ).get(tenantId, key) as { config_value: string } | undefined
  if (currentRow) {
    snapshotConfigVersion(tenantId, key, currentRow.config_value)
  }

  // 写回租户配置表
  db.prepare(
    `INSERT INTO ai_tenant_config (tenant_id, config_key, config_value, updated_at)
     VALUES (?, ?, ?, unixepoch())
     ON CONFLICT(tenant_id, config_key) DO UPDATE
     SET config_value = excluded.config_value, updated_at = unixepoch()`
  ).run(tenantId, key, row.config_value)

  return true
}