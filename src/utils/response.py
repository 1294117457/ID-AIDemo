"""统一响应格式 - 对应 TS: response.ts"""
from fastapi.responses import JSONResponse
from typing import Any


def success_response(data: Any = None, msg: str = "成功") -> JSONResponse:
    """成功响应"""
    return JSONResponse({
        "code": 200,
        "msg": msg,
        "data": data
    })


def error_response(code: int, msg: str, data: Any = None) -> JSONResponse:
    """错误响应"""
    return JSONResponse({
        "code": code,
        "msg": msg,
        "data": data
    }, status_code=code if code >= 400 else 200)
