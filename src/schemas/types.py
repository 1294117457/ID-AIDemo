"""Pydantic 模型 - 对应 TS: schemas/types.ts"""
from typing import Optional, Literal, Any
from pydantic import BaseModel, Field
from datetime import datetime


class AgentInput(BaseModel):
    """Agent 输入"""
    user_input: str
    session_id: str = "default"
    user_id: Optional[str] = None
    user_token: Optional[str] = None
    document_text: str = ""
    templates: list[dict] = Field(default_factory=list)
    forced_intent: Optional[Literal["consult", "apply"]] = None


class AgentResult(BaseModel):
    """Agent 输出"""
    interrupted: bool = False
    question: Optional[str] = None
    reply: str = ""
    intent: str = "consult"
    document_text: str = ""
    suggestions: list[dict] = Field(default_factory=list)


class AgentChatRequest(BaseModel):
    """聊天请求"""
    message: str = Field(..., description="用户消息")
    session_id: str = Field(default="default", description="会话ID")
    intent: Optional[Literal["apply", "consult"]] = Field(default=None, description="强制意图")


class ResumeRequest(BaseModel):
    """恢复对话请求"""
    session_id: str
    supplement: str


class ConversationCreate(BaseModel):
    """创建会话"""
    session_id: str
    title: str = "新对话"


class MessageResponse(BaseModel):
    """消息响应"""
    id: int
    session_id: str
    role: str
    content: str
    msg_type: str
    extra_data: Optional[str] = None
    created_at: datetime


class ConversationResponse(BaseModel):
    """会话响应"""
    id: int
    user_id: str
    session_id: str
    title: str
    status: int
    is_deleted: bool
    created_at: datetime
    updated_at: datetime


class ConfigView(BaseModel):
    """配置视图"""
    system_role: str
    api_key: str
    base_url: str
    chat_model: str
    embedding_model: str
    context_max_messages: int


class ConfigUpdate(BaseModel):
    """配置更新"""
    system_role: Optional[str] = None
    api_key: Optional[str] = None
    base_url: Optional[str] = None
    chat_model: Optional[str] = None
    embedding_model: Optional[str] = None
    context_max_messages: Optional[int] = None


class KnowledgeUploadRequest(BaseModel):
    """知识库上传"""
    content: str
    metadata: dict = Field(default_factory=dict)


class KnowledgeSearchRequest(BaseModel):
    """知识库检索"""
    query: str
    top_k: int = 5


class SSEEvent(BaseModel):
    """SSE 事件"""
    type: str
    data: Any


class APIResponse(BaseModel):
    """统一 API 响应"""
    code: int = 200
    msg: str = "成功"
    data: Optional[Any] = None
