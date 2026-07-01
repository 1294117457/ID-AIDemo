"""统一响应格式"""
from typing import Any
from fastapi.responses import JSONResponse


def ok_response(data: Any = None, msg: str = "成功") -> JSONResponse:
    return JSONResponse({"code": 200, "msg": msg, "data": data})


def fail_response(code: int, msg: str, data: Any = None) -> JSONResponse:
    return JSONResponse({"code": code, "msg": msg, "data": data})
