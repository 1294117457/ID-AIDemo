"""会话路由 - 对应 TS: conversation/index.ts"""
from fastapi import APIRouter, Depends, Query, Body
from middleware.auth import require_auth, AuthContext
from service.conversation_service import (
    create_conversation,
    list_conversations,
    get_conversation_by_session,
    get_messages,
    update_conversation_title,
    delete_conversation,
)
from router.response import ok_response, fail_response

router = APIRouter(prefix="/ai/conversation", tags=["Conversation"])


@router.get("/list")
async def get_conversation_list(
    auth: AuthContext = Depends(require_auth),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    """获取会话列表"""
    try:
        conversations = list_conversations(auth.user_id, limit)
        total = len(conversations)
        return ok_response({"list": conversations, "total": total})
    except Exception as e:
        return fail_response(500, str(e))


@router.post("/create")
async def create(
    body: dict = Body(...),
    auth: AuthContext = Depends(require_auth),
):
    """创建会话"""
    try:
        first_message = body.get("firstMessage", "").strip()
        session_id = body.get("sessionId", "")
        result = create_conversation(
            session_id=session_id or f"session_{auth.user_id}_{int(__import__('time').time())}",
            user_id=auth.user_id,
            title=first_message[:50] if first_message else "新对话",
        )
        return ok_response(result)
    except Exception as e:
        return fail_response(500, str(e))


@router.get("/{session_id}")
async def get_conversation(
    session_id: str,
    auth: AuthContext = Depends(require_auth),
):
    """获取会话详情"""
    conv = get_conversation_by_session(session_id)
    if not conv:
        return fail_response(404, "会话不存在")
    return ok_response(conv)


@router.get("/{session_id}/messages")
async def get_conversation_messages(
    session_id: str,
    auth: AuthContext = Depends(require_auth),
):
    """获取会话消息"""
    try:
        messages = get_messages(session_id)
        return ok_response(messages)
    except Exception as e:
        return fail_response(500, str(e))


@router.put("/{session_id}/title")
async def update_title(
    session_id: str,
    body: dict = Body(...),
    auth: AuthContext = Depends(require_auth),
):
    """更新会话标题"""
    title = body.get("title", "").strip()
    if not title:
        return fail_response(400, "标题不能为空")
    try:
        update_conversation_title(session_id, title)
        return ok_response(None)
    except Exception as e:
        return fail_response(500, str(e))


@router.delete("/{session_id}")
async def delete(
    session_id: str,
    auth: AuthContext = Depends(require_auth),
):
    """删除会话"""
    try:
        delete_conversation(session_id)
        return ok_response(None)
    except Exception as e:
        return fail_response(500, str(e))
