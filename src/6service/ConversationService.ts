// ─── Conversation Service — 会话与消息的 SQLite 持久化 ──────────────────────
// 所有会话数据（消息 + 元数据 + LangGraph Checkpoint）聚合到 idagent 的 SQLite
// idbackend 只做透明代理，通过 x-user-id 请求头传递用户身份

import { getDb } from '../1common/config.js'

// ── 类型定义 ──────────────────────────────────────────────────────────────────

export interface ConversationMeta {
  id: number
  user_id: string
  session_id: string
  title: string
  status: number
  is_deleted: number
  created_at: string
  updated_at: string
  message_count: number
  last_message: string | null
}

export interface MessageRecord {
  id: number
  session_id: string
  role: string
  content: string
  msg_type: string
  extra_data: string | null
  created_at: string
}

// ── 工具函数 ──────────────────────────────────────────────────────────────────

function now(): string {
  return new Date().toISOString()
}

function genSessionId(): string {
  return `sess_${crypto.randomUUID().replace(/-/g, '')}`
}

// ── 会话元数据操作 ────────────────────────────────────────────────────────────

/**
 * 创建新会话，返回会话 ID 和 sessionId
 */
export function createConversation(userId: string, firstMessage = ''): { id: number; sessionId: string; title: string } {
  const db = getDb()
  const sessionId = genSessionId()
  const title = firstMessage.trim().slice(0, 30) || '新对话'
  const t = now()

  const result = db.prepare(`
    INSERT INTO ai_conversation (user_id, session_id, title, status, is_deleted, created_at, updated_at)
    VALUES (?, ?, ?, 1, 0, ?, ?)
  `).run(userId, sessionId, title, t, t)

  return { id: Number(result.lastInsertRowid), sessionId, title }
}

/**
 * 获取指定用户的所有会话列表（按更新时间倒序）
 * last_message = 该会话最新一条用户消息或 AI 回复的 content（子查询保证正确取最新）
 */
export function getConversations(userId: string, limit = 50, offset = 0): ConversationMeta[] {
  const db = getDb()
  return db.prepare(`
    SELECT
      c.id, c.user_id, c.session_id, c.title, c.status, c.is_deleted, c.created_at, c.updated_at,
      COUNT(m.id) AS message_count,
      (
        SELECT content FROM ai_message
        WHERE session_id = c.session_id
        ORDER BY created_at DESC LIMIT 1
      ) AS last_message
    FROM ai_conversation c
    LEFT JOIN ai_message m ON m.session_id = c.session_id
    WHERE c.user_id = ? AND c.is_deleted = 0
    GROUP BY c.id
    ORDER BY c.updated_at DESC
    LIMIT ? OFFSET ?
  `).all(userId, limit, offset) as ConversationMeta[]
}

/**
 * 根据 sessionId 获取会话元信息
 */
export function getConversationBySession(sessionId: string): ConversationMeta | null {
  const db = getDb()
  const row = db.prepare(`
    SELECT c.id, c.user_id, c.session_id, c.title, c.status, c.is_deleted, c.created_at, c.updated_at,
           COUNT(m.id) AS message_count,
           (
             SELECT content FROM ai_message
             WHERE session_id = c.session_id
             ORDER BY created_at DESC LIMIT 1
           ) AS last_message
    FROM ai_conversation c
    LEFT JOIN ai_message m ON m.session_id = c.session_id
    WHERE c.session_id = ? AND c.is_deleted = 0
    GROUP BY c.id
  `).get(sessionId) as ConversationMeta | undefined
  return row ?? null
}

/**
 * 根据 sessionId 获取会话 ID
 */
export function getConversationIdBySession(sessionId: string): number | null {
  const db = getDb()
  const row = db.prepare(
    `SELECT id FROM ai_conversation WHERE session_id = ? AND is_deleted = 0`
  ).get(sessionId) as { id: number } | undefined
  return row ? Number(row.id) : null
}

/**
 * 更新会话标题
 */
export function updateConversationTitle(sessionId: string, title: string): void {
  const db = getDb()
  db.prepare(`
    UPDATE ai_conversation SET title = ?, updated_at = ? WHERE session_id = ?
  `).run(title.slice(0, 100), now(), sessionId)
}

/**
 * 归档会话
 */
export function archiveConversation(sessionId: string): void {
  const db = getDb()
  db.prepare(`
    UPDATE ai_conversation SET status = 0, updated_at = ? WHERE session_id = ?
  `).run(now(), sessionId)
}

/**
 * 删除会话（软删除 + 删除消息）
 */
export function deleteConversation(sessionId: string): void {
  const db = getDb()
  const tx = db.transaction(() => {
    db.prepare(`DELETE FROM ai_message WHERE session_id = ?`).run(sessionId)
    db.prepare(`UPDATE ai_conversation SET is_deleted = 1, updated_at = ? WHERE session_id = ?`).run(now(), sessionId)
  })
  tx()
}

/**
 * 更新会话的 updated_at（追加消息后调用）
 */
export function touchConversation(sessionId: string): void {
  const db = getDb()
  db.prepare(`UPDATE ai_conversation SET updated_at = ? WHERE session_id = ?`).run(now(), sessionId)
}

/**
 * 搜索会话（按标题或消息内容关键词）
 */
export function searchConversations(userId: string, keyword: string): ConversationMeta[] {
  if (!keyword.trim()) return []
  const db = getDb()
  const k = `%${keyword.trim()}%`
  return db.prepare(`
    SELECT c.id, c.user_id, c.session_id, c.title, c.status, c.is_deleted, c.created_at, c.updated_at,
           COUNT(m.id) AS message_count,
           (
             SELECT content FROM ai_message
             WHERE session_id = c.session_id
             ORDER BY created_at DESC LIMIT 1
           ) AS last_message
    FROM ai_conversation c
    LEFT JOIN ai_message m ON m.session_id = c.session_id
    WHERE c.user_id = ? AND c.is_deleted = 0
      AND (c.title LIKE ? OR m.content LIKE ?)
    GROUP BY c.id
    ORDER BY c.updated_at DESC
    LIMIT 50
  `).all(userId, k, k) as ConversationMeta[]
}

/**
 * 获取会话总数
 */
export function getConversationCount(userId: string): number {
  const db = getDb()
  const row = db.prepare(
    `SELECT COUNT(*) AS cnt FROM ai_conversation WHERE user_id = ? AND is_deleted = 0`
  ).get(userId) as { cnt: number }
  return row.cnt
}

// ── 消息操作 ──────────────────────────────────────────────────────────────────

/**
 * 追加一条消息到指定会话
 */
export function appendMessage(
  sessionId: string,
  role: string,
  content: string,
  msgType = 'message',
  extraData?: any
): number {
  const db = getDb()
  const t = now()
  const extra = extraData ? JSON.stringify(extraData) : null
  const result = db.prepare(`
    INSERT INTO ai_message (session_id, role, content, msg_type, extra_data, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(sessionId, role, content, msgType, extra, t)

  // 更新会话的 updated_at
  touchConversation(sessionId)
  return Number(result.lastInsertRowid)
}

/**
 * 获取指定会话的所有消息（按时间升序）
 */
export function getMessages(sessionId: string): MessageRecord[] {
  const db = getDb()
  return db.prepare(`
    SELECT id, session_id, role, content, msg_type, extra_data, created_at
    FROM ai_message
    WHERE session_id = ?
    ORDER BY created_at ASC
  `).all(sessionId) as MessageRecord[]
}

/**
 * 获取指定会话的最后一条消息
 */
export function getLastMessage(sessionId: string): MessageRecord | null {
  const db = getDb()
  const row = db.prepare(`
    SELECT id, session_id, role, content, msg_type, extra_data, created_at
    FROM ai_message
    WHERE session_id = ?
    ORDER BY created_at DESC
    LIMIT 1
  `).get(sessionId) as MessageRecord | undefined
  return row ?? null
}

/**
 * 删除指定会话的所有消息（保留会话元数据）
 */
export function clearMessages(sessionId: string): void {
  const db = getDb()
  db.prepare(`DELETE FROM ai_message WHERE session_id = ?`).run(sessionId)
}
