"""配置路由 - 对应 TS: config/index.ts"""
from fastapi import APIRouter, Depends, Body
from middleware.auth import require_auth, AuthContext
from config.database import engine
from sqlalchemy import text
from router.response import ok_response, fail_response

router = APIRouter(prefix="/ai/config", tags=["Config"])


def get_all_config() -> dict:
    """从数据库获取所有配置"""
    with engine.connect() as conn:
        rows = conn.execute(text("SELECT config_key, config_value FROM ai_config")).fetchall()
        config = {row[0]: row[1] for row in rows}
    return {
        "system_role": config.get("system_role", ""),
        "api_key": config.get("api_key", ""),
        "base_url": config.get("base_url", ""),
        "chat_model": config.get("chat_model", ""),
        "embedding_model": config.get("embedding_model", ""),
        "context_max_messages": int(config.get("context_max_messages", "20")),
    }


def update_config(key: str, value: str) -> bool:
    """更新配置项"""
    with engine.connect() as conn:
        conn.execute(
            text("""
                INSERT INTO ai_config (config_key, config_value, updated_at)
                VALUES (:key, :value, EXTRACT(EPOCH FROM NOW())::INTEGER)
                ON CONFLICT (config_key) 
                DO UPDATE SET config_value = :value, updated_at = EXTRACT(EPOCH FROM NOW())::INTEGER
            """),
            {"key": key, "value": value}
        )
        conn.commit()
    return True


@router.get("")
async def get_config(auth: AuthContext = Depends(require_auth)):
    """获取配置"""
    try:
        config = get_all_config()
        config["api_key"] = ""  # 不返回真实 API Key
        return ok_response(config)
    except Exception as e:
        return fail_response(500, str(e))


@router.put("")
async def update_config_handler(
    body: dict = Body(...),
    auth: AuthContext = Depends(require_auth),
):
    """更新配置"""
    allowed_keys = [
        "system_role", "api_key", "base_url",
        "chat_model", "embedding_model", "context_max_messages"
    ]
    try:
        for key, value in body.items():
            if key in allowed_keys:
                str_value = str(value) if not isinstance(value, str) else value
                update_config(key, str_value)
        return ok_response(get_all_config())
    except Exception as e:
        return fail_response(500, str(e))
