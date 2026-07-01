"""健康检查路由"""
from fastapi import APIRouter
from router.response import ok_response

router = APIRouter(tags=["Health"])


@router.get("/health")
async def health_check():
    """健康检查"""
    return ok_response({"status": "ok"})


@router.get("/")
async def root():
    """根路径"""
    return ok_response({"message": "Agent API", "version": "1.0.0"})
