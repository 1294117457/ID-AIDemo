"""数据库初始化 - PostgreSQL + pgvector"""
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, Session
from langgraph.checkpoint.postgres import PostgresSaver
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from .settings import get_settings

settings = get_settings()

# ── 关系型数据引擎 ──────────────────────────────────────────────
engine = create_engine(
    settings.DATABASE_URL,
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,
    echo=False,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db() -> Session:
    """获取数据库会话"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ── LangGraph Checkpoint ────────────────────────────────────────
_checkpointer: PostgresSaver | None = None


def get_checkpointer() -> PostgresSaver:
    """获取 LangGraph checkpointer (PostgreSQL)"""
    global _checkpointer
    if _checkpointer is None:
        _checkpointer = PostgresSaver.from_conn_string(settings.DATABASE_URL)
        _checkpointer.setup()
    return _checkpointer


# ── 初始化数据库 ────────────────────────────────────────────────
def init_db() -> None:
    """初始化数据库表结构"""
    with engine.connect() as conn:
        # 创建 pgvector 扩展
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        
        # ai_config 表
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS ai_config (
                config_key TEXT PRIMARY KEY,
                config_value TEXT NOT NULL,
                updated_at INTEGER NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::INTEGER
            )
        """))
        
        # ai_conversation 表
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS ai_conversation (
                id SERIAL PRIMARY KEY,
                user_id TEXT NOT NULL,
                session_id TEXT NOT NULL UNIQUE,
                title TEXT NOT NULL DEFAULT '新对话',
                status INTEGER NOT NULL DEFAULT 1,
                is_deleted INTEGER NOT NULL DEFAULT 0,
                created_at TIMESTAMP NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMP NOT NULL DEFAULT NOW()
            )
        """))
        
        # ai_message 表
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS ai_message (
                id SERIAL PRIMARY KEY,
                session_id TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                msg_type TEXT NOT NULL DEFAULT 'message',
                extra_data TEXT,
                created_at TIMESTAMP NOT NULL DEFAULT NOW()
            )
        """))
        
        # 创建索引
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_conv_user ON ai_conversation(user_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_conv_session ON ai_conversation(session_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_msg_session ON ai_message(session_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_msg_created ON ai_message(created_at)"))
        
        # 向量表 (pgvector)
        # 向量维度 1024 对应 qwen3 text-embedding-v3
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS policy_vectors (
                id SERIAL PRIMARY KEY,
                content TEXT NOT NULL,
                metadata JSONB,
                embedding vector(1024),
                created_at TIMESTAMP NOT NULL DEFAULT NOW()
            )
        """))
        
        conn.commit()
    
    print(f"[db] initialized at {settings.DATABASE_URL}")


def init_config() -> None:
    """初始化默认配置"""
    defaults = [
        ("system_role", "你是厦门大学信息学院保研加分助手。你的职责是：帮助学生和老师了解保研综合成绩加分政策、申请流程及系统操作。回答时请以下列知识库内容为主要依据，如果知识库没有相关信息，请如实告知。回答语言：中文，简洁专业。"),
        ("api_key", ""),
        ("base_url", "https://dashscope.aliyuncs.com/compatible-mode/v1"),
        ("chat_model", "qwen3-max"),
        ("embedding_model", "text-embedding-v3"),
        ("context_max_messages", "20"),
    ]
    
    with engine.connect() as conn:
        for key, value in defaults:
            conn.execute(text("""
                INSERT INTO ai_config (config_key, config_value)
                VALUES (:key, :value)
                ON CONFLICT (config_key) DO NOTHING
            """), {"key": key, "value": value})
        conn.commit()
