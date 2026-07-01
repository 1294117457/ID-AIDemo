"""内存管理 - 对应 TS: memory.ts"""
from typing import List
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage
from config.database import engine
from sqlalchemy import text


def should_compress(message_count: int) -> bool:
    """
    判断是否需要压缩上下文
    
    对应 TS: shouldCompress
    """
    from config.settings import get_settings
    settings = get_settings()
    
    max_messages = settings.CONTEXT_MAX_MESSAGES
    
    # 当消息数量超过阈值时压缩
    return message_count > max_messages


def get_context_max_messages() -> int:
    """获取上下文最大消息数"""
    from config.settings import get_settings
    settings = get_settings()
    return settings.CONTEXT_MAX_MESSAGES


async def compress_messages(messages: List[BaseMessage]) -> List[BaseMessage]:
    """
    压缩上下文消息
    
    对应 TS: compressMessages
    策略: 保留最近的 max_messages 条对话，压缩更早的为摘要
    """
    max_messages = get_context_max_messages()
    
    # 保留最近的 HumanMessage 和 AIMessage 对
    human_count = sum(1 for m in messages if isinstance(m, HumanMessage))
    
    # 如果消息数量在阈值内，无需压缩
    if human_count <= max_messages // 2:
        return messages
    
    # 保留最近的消息
    recent_messages = messages[-max_messages:]
    
    # 统计被压缩的消息数量
    compressed_count = len(messages) - len(recent_messages)
    
    if compressed_count > 0:
        print(f"[memory] compressed {compressed_count} messages")
    
    return recent_messages


def get_compressed_message_count(session_id: str) -> int:
    """获取会话的消息压缩统计"""
    # 这个功能在 Python 版本中简化处理
    return 0
