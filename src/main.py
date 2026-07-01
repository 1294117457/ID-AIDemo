"""FastAPI 应用入口 - 对应 TS: main.ts"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from config.settings import get_settings
from config.database import init_db, init_config
from router import (
    agent_router,
    conversation_router,
    config_router,
    knowledge_router,
    health_router,
)

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    # 启动时
    print("[agent] 启动中...")
    try:
        init_db()
        init_config()
        print("[agent] 数据库初始化完成")
    except Exception as e:
        print(f"[agent] 数据库初始化失败: {e}")
        print("[agent] 继续启动，数据库功能可能不可用")
    
    yield
    
    # 关闭时
    print("[agent] 关闭中...")


# 创建应用
app = FastAPI(
    title="Agent API",
    description="厦门大学信息学院保研加分助手 API",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册路由
app.include_router(health_router)
app.include_router(agent_router)
app.include_router(conversation_router)
app.include_router(config_router)
app.include_router(knowledge_router)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=True,
    )
