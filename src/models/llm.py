"""LLM 工厂 - 对应 TS: model.ts"""
from langchain_openai import ChatOpenAI
from config.settings import get_settings

settings = get_settings()

# 缓存模型实例
_llm_cache: dict[float, ChatOpenAI] = {}


def create_chat_model(temperature: float = 0.3) -> ChatOpenAI:
    """
    通用对话模型工厂
    
    Args:
        temperature: 温度参数，按节点用途传入
                    - 0: 结构化输出 (classify, analyze)
                    - 0.1-0.3: 创意回答 (answer)
                    - 0.3-0.7: 摘要生成 (summarize)
    """
    if temperature not in _llm_cache:
        api_key = _get_api_key()
        base_url = _get_base_url()
        model_name = _get_chat_model()
        
        _llm_cache[temperature] = ChatOpenAI(
            api_key=api_key,
            base_url=base_url,
            model=model_name,
            temperature=temperature,
            model_kwargs={"enable_thinking": False},
        )
    
    return _llm_cache[temperature]


def _get_api_key() -> str:
    """获取 API Key (优先从 DB，fallback 到 .env)"""
    from config.database import engine
    from sqlalchemy import text
    
    try:
        with engine.connect() as conn:
            row = conn.execute(
                text("SELECT config_value FROM ai_config WHERE config_key = 'api_key'")
            ).fetchone()
            if row and row[0].strip():
                return row[0].strip()
    except Exception:
        pass
    
    return settings.QWEN3_API_KEY


def _get_base_url() -> str:
    """获取 base URL"""
    from config.database import engine
    from sqlalchemy import text
    
    try:
        with engine.connect() as conn:
            row = conn.execute(
                text("SELECT config_value FROM ai_config WHERE config_key = 'base_url'")
            ).fetchone()
            if row:
                return row[0]
    except Exception:
        pass
    
    return settings.QWEN_BASE_URL


def _get_chat_model() -> str:
    """获取模型名称"""
    from config.database import engine
    from sqlalchemy import text
    
    try:
        with engine.connect() as conn:
            row = conn.execute(
                text("SELECT config_value FROM ai_config WHERE config_key = 'chat_model'")
            ).fetchone()
            if row:
                return row[0]
    except Exception:
        pass
    
    return settings.QWEN_CHAT_MODEL


def clear_cache():
    """清除模型缓存"""
    global _llm_cache
    _llm_cache = {}
