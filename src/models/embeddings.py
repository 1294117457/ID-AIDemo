"""Embeddings 工厂"""
from langchain_openai import OpenAIEmbeddings
from config.settings import get_settings

settings = get_settings()

_embedding_model: OpenAIEmbeddings | None = None


def create_embeddings() -> OpenAIEmbeddings:
    """Embedding 模型工厂"""
    global _embedding_model
    if _embedding_model is None:
        api_key = _get_api_key()
        base_url = _get_base_url()
        model_name = _get_embedding_model()
        
        _embedding_model = OpenAIEmbeddings(
            openai_api_key=api_key,
            openai_api_base=base_url,
            model=model_name,
            batch_size=6,
            max_retries=3,
        )
    
    return _embedding_model


def _get_api_key() -> str:
    """获取 API Key"""
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


def _get_embedding_model() -> str:
    """获取 embedding 模型名称"""
    from config.database import engine
    from sqlalchemy import text
    
    try:
        with engine.connect() as conn:
            row = conn.execute(
                text("SELECT config_value FROM ai_config WHERE config_key = 'embedding_model'")
            ).fetchone()
            if row:
                return row[0]
    except Exception:
        pass
    
    return settings.QWEN_EMBEDDING_MODEL
