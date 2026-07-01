"""会话服务 - 对应 TS: ConversationService.ts"""
from datetime import datetime
from typing import Optional
from sqlalchemy.orm import Session
from config.database import engine
from sqlalchemy import text


def get_conversation_by_session(session_id: str) -> Optional[dict]:
    """
    根据 session_id 获取会话
    
    对应 TS: getConversationBySession
    """
    with engine.connect() as conn:
        row = conn.execute(
            text("""
                SELECT id, user_id, session_id, title, status, is_deleted, created_at, updated_at
                FROM ai_conversation
                WHERE session_id = :session_id AND is_deleted = 0
            """),
            {"session_id": session_id}
        ).fetchone()
        
        if row:
            return {
                "id": row[0],
                "user_id": row[1],
                "session_id": row[2],
                "title": row[3],
                "status": row[4],
                "is_deleted": row[5],
                "created_at": row[6],
                "updated_at": row[7],
            }
        return None


def create_conversation(session_id: str, user_id: str, title: str = "新对话") -> dict:
    """
    创建会话
    
    对应 TS: createConversation
    """
    now = datetime.now().isoformat()
    
    with engine.connect() as conn:
        conn.execute(
            text("""
                INSERT INTO ai_conversation (user_id, session_id, title, status, is_deleted, created_at, updated_at)
                VALUES (:user_id, :session_id, :title, 1, 0, :now, :now)
                ON CONFLICT (session_id) DO UPDATE SET
                    title = :title,
                    updated_at = :now
            """),
            {"user_id": user_id, "session_id": session_id, "title": title, "now": now}
        )
        conn.commit()
    
    return get_conversation_by_session(session_id)


def list_conversations(user_id: str, limit: int = 50) -> list[dict]:
    """
    获取用户的会话列表
    
    对应 TS: listConversations
    """
    with engine.connect() as conn:
        rows = conn.execute(
            text("""
                SELECT id, user_id, session_id, title, status, is_deleted, created_at, updated_at
                FROM ai_conversation
                WHERE user_id = :user_id AND is_deleted = 0
                ORDER BY updated_at DESC
                LIMIT :limit
            """),
            {"user_id": user_id, "limit": limit}
        ).fetchall()
        
        return [
            {
                "id": row[0],
                "user_id": row[1],
                "session_id": row[2],
                "title": row[3],
                "status": row[4],
                "is_deleted": row[5],
                "created_at": row[6],
                "updated_at": row[7],
            }
            for row in rows
        ]


def append_message(
    session_id: str,
    role: str,
    content: str,
    msg_type: str = "message",
    extra_data: str | None = None
) -> int:
    """
    添加消息
    
    对应 TS: appendMessage
    """
    now = datetime.now().isoformat()
    
    with engine.connect() as conn:
        result = conn.execute(
            text("""
                INSERT INTO ai_message (session_id, role, content, msg_type, extra_data, created_at)
                VALUES (:session_id, :role, :content, :msg_type, :extra_data, :now)
            """),
            {
                "session_id": session_id,
                "role": role,
                "content": content,
                "msg_type": msg_type,
                "extra_data": extra_data,
                "now": now
            }
        )
        conn.commit()
        
        # 获取插入的 ID
        row = conn.execute(text("SELECT lastval()")).fetchone()
        return row[0] if row else 0


def get_messages(session_id: str, limit: int = 100) -> list[dict]:
    """
    获取会话消息
    
    对应 TS: getMessages
    """
    with engine.connect() as conn:
        rows = conn.execute(
            text("""
                SELECT id, session_id, role, content, msg_type, extra_data, created_at
                FROM ai_message
                WHERE session_id = :session_id
                ORDER BY created_at ASC
                LIMIT :limit
            """),
            {"session_id": session_id, "limit": limit}
        ).fetchall()
        
        return [
            {
                "id": row[0],
                "session_id": row[1],
                "role": row[2],
                "content": row[3],
                "msg_type": row[4],
                "extra_data": row[5],
                "created_at": row[6],
            }
            for row in rows
        ]


def update_conversation_title(session_id: str, title: str) -> bool:
    """更新会话标题"""
    now = datetime.now().isoformat()
    
    with engine.connect() as conn:
        conn.execute(
            text("""
                UPDATE ai_conversation
                SET title = :title, updated_at = :now
                WHERE session_id = :session_id
            """),
            {"title": title, "session_id": session_id, "now": now}
        )
        conn.commit()
    
    return True


def delete_conversation(session_id: str) -> bool:
    """删除会话 (软删除)"""
    now = datetime.now().isoformat()
    
    with engine.connect() as conn:
        conn.execute(
            text("""
                UPDATE ai_conversation
                SET is_deleted = 1, updated_at = :now
                WHERE session_id = :session_id
            """),
            {"session_id": session_id, "now": now}
        )
        conn.commit()
    
    return True
