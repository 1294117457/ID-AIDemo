/**
* 数据库表结构
*/

-- ── ai_config（System 级全局配置）────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_config (
  config_key   TEXT PRIMARY KEY,
  config_value TEXT NOT NULL,
  updated_at   INTEGER NOT NULL DEFAULT (unixepoch())
);

-- ── 会话表（新增 tenant_id）─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_conversation (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT    NOT NULL,
  tenant_id   TEXT    NOT NULL DEFAULT 'default',
  session_id  TEXT    NOT NULL UNIQUE,
  title       TEXT    NOT NULL DEFAULT '新对话',
  status      INTEGER NOT NULL DEFAULT 1,
  is_deleted  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT    NOT NULL,
  updated_at  TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_conv_user     ON ai_conversation(user_id);
CREATE INDEX IF NOT EXISTS idx_conv_tenant ON ai_conversation(tenant_id);
CREATE INDEX IF NOT EXISTS idx_conv_session ON ai_conversation(session_id);

-- ── 消息表（新增 tenant_id）─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_message (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id  TEXT    NOT NULL,
  tenant_id   TEXT    NOT NULL DEFAULT 'default',
  role        TEXT    NOT NULL,
  content     TEXT    NOT NULL,
  msg_type    TEXT    NOT NULL DEFAULT 'message',
  extra_data  TEXT,
  created_at  TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_msg_session ON ai_message(session_id);
CREATE INDEX IF NOT EXISTS idx_msg_tenant  ON ai_message(tenant_id);
CREATE INDEX IF NOT EXISTS idx_msg_created ON ai_message(created_at);

-- ── 租户信息表 ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_tenant (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id   TEXT    NOT NULL UNIQUE,
  name        TEXT    NOT NULL,
  is_active   INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tenant_id ON ai_tenant(tenant_id);

-- ── 租户级配置（覆盖 System 级默认值）────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_tenant_config (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id    TEXT    NOT NULL,
  config_key   TEXT    NOT NULL,
  config_value TEXT    NOT NULL,
  updated_at   INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(tenant_id, config_key)
);
CREATE INDEX IF NOT EXISTS idx_tc_tenant ON ai_tenant_config(tenant_id);

-- ── 配置版本快照（支持回滚）─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_config_version (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id    TEXT    NOT NULL DEFAULT 'system',
  config_key   TEXT    NOT NULL,
  config_value TEXT    NOT NULL,
  version      INTEGER NOT NULL,
  created_at   TEXT    NOT NULL,
  UNIQUE(tenant_id, config_key, version)
);
CREATE INDEX IF NOT EXISTS idx_cv_tenant ON ai_config_version(tenant_id);

-- ── 初始数据 ─────────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO ai_config (config_key, config_value) VALUES
  ('system_role',          '你是厦门大学信息学院保研加分助手。你的职责是：帮助学生和老师了解保研综合成绩加分政策、申请流程及系统操作。回答时请以下列知识库内容为主要依据，如果知识库没有相关信息，请如实告知。回答语言：中文，简洁专业。'),
  ('api_key',              ''),
  ('base_url',             'https://dashscope.aliyuncs.com/compatible-mode/v1'),
  ('chat_model',           'qwen3-max'),
  ('embedding_model',      'text-embedding-v3'),
  ('context_max_messages', '20'),
  ('vendor',               'qwen'),
  ('embedding_vendor',     'qwen');

INSERT OR IGNORE INTO ai_tenant (tenant_id, name, is_active, created_at)
VALUES ('default', '默认租户（厦门大学信息学院）', 1, datetime('now'));