"""环境配置 - 对应 TS: config.ts"""
import os
from pathlib import Path
from functools import lru_cache
from pydantic_settings import BaseSettings

# .env 文件位于项目根目录（src 的上一级）
_ENV_FILE = Path(__file__).resolve().parent.parent.parent / ".env"


class Settings(BaseSettings):
    # 服务配置
    PORT: int = 3001
    HOST: str = "0.0.0.0"

    # PostgreSQL (关系型数据)
    DATABASE_URL: str = "postgresql://postgres:password@223.109.49.63:5432/agent"

    # pgvector (向量数据)
    PG_VECTOR_URL: str = "postgresql://postgres:password@223.109.49.63:5432/agent"

    # LangGraph Checkpoint
    CHECKPOINT_ENABLED: bool = True

    # JWT
    JWT_SECRET: str = "default_secret_change_me"
    JWT_ALGORITHM: str = "HS256"

    # 后端服务
    JAVA_BACKEND_URL: str = "http://localhost:8080"

    # LLM (通义千问)
    QWEN3_API_KEY: str = ""
    QWEN_BASE_URL: str = "https://dashscope.aliyuncs.com/compatible-mode/v1"
    QWEN_CHAT_MODEL: str = "qwen3-max"
    QWEN_EMBEDDING_MODEL: str = "text-embedding-v3"

    # 上下文压缩
    CONTEXT_MAX_MESSAGES: int = 20

    class Config:
        env_file = str(_ENV_FILE)
        env_file_encoding = "utf-8"


@lru_cache
def get_settings() -> Settings:
    return Settings()
