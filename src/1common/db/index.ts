/**
 * 数据库连接出口
 * getDb、iinidDb
 */

import 'dotenv/config'
import Database from 'better-sqlite3'
import { mkdirSync, readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const DB_PATH         = path.resolve(__dirname, '../../../data/agent.db')
export const CHECKPOINT_PATH = path.resolve(__dirname, '../../../data/checkpoints.db')

let _db: Database.Database | null = null

export function getDb(): Database.Database {
  if (!_db) throw new Error('DB not initialized. Call initDb() first.')
  return _db
}

export function initDb(): void {
  mkdirSync(path.dirname(DB_PATH), { recursive: true })
  _db = new Database(DB_PATH)
  // 建表语句从 SQL 文件加载，TS 不再混杂 SQL 字符串
  const schema = readFileSync(path.resolve(__dirname, './schema.sql'), 'utf-8')
  _db.exec(schema)
  console.log('[db] initialized at', DB_PATH)
}