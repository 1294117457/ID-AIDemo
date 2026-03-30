import Database from 'better-sqlite3'
import { mkdirSync } from 'fs'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_PATH = path.resolve(__dirname, '../../data/agent.db')

let _db: Database.Database | null = null

export function getDb(): Database.Database {
  if (!_db) throw new Error('DB not initialized. Call initDb() first.')
  return _db
}

export function initDb(): void {
  mkdirSync(path.dirname(DB_PATH), { recursive: true })
  _db = new Database(DB_PATH)

  _db.exec(`
    CREATE TABLE IF NOT EXISTS knowledge_chunks (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      source_file TEXT    NOT NULL,
      chunk_index INTEGER NOT NULL,
      content     TEXT    NOT NULL,
      embedding   TEXT    NOT NULL,
      created_at  INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT    NOT NULL,
      role       TEXT    NOT NULL,
      content    TEXT    NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS idx_chunks_source  ON knowledge_chunks(source_file);
    CREATE INDEX IF NOT EXISTS idx_conv_session   ON conversations(session_id, created_at);

    CREATE TABLE IF NOT EXISTS ai_config (
      config_key   TEXT PRIMARY KEY,
      config_value TEXT NOT NULL,
      updated_at   INTEGER NOT NULL DEFAULT (unixepoch())
    );

    INSERT OR IGNORE INTO ai_config (config_key, config_value) VALUES
      ('system_role',     '你是厦门大学信息学院保研加分助手。你的职责是：帮助学生和老师了解保研综合成绩加分政策、申请流程及系统操作。回答时请以下列知识库内容为主要依据，如果知识库没有相关信息，请如实告知。回答语言：中文，简洁专业。'),
      ('api_key',         ''),
      ('base_url',        'https://dashscope.aliyuncs.com/compatible-mode/v1'),
      ('chat_model',      'qwen3-max'),
      ('embedding_model', 'text-embedding-v3');
  `)

  console.log('[db] initialized at', DB_PATH)
}
