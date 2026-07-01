"""JWT 鉴权中间件 - 对应 TS: auth.ts"""
from typing import Optional, Callable
from fastapi import Request, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from starlette.middleware.base import BaseHTTPMiddleware
from jose import jwt, JWTError
from config.settings import get_settings

settings = get_settings()
security = HTTPBearer(auto_error=False)


class AuthContext:
    """认证上下文"""
    def __init__(
        self,
        user_id: Optional[str] = None,
        username: Optional[str] = None,
        tenant_id: Optional[str] = None,
        user_token: Optional[str] = None,
    ):
        self.user_id = user_id
        self.username = username
        self.tenant_id = tenant_id
        self.user_token = user_token


async def require_auth(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> AuthContext:
    """
    强鉴权：必须登录
    
    对应 TS: requireAuth
    """
    if not credentials:
        raise HTTPException(status_code=401, detail="未登录，请重新登录")
    
    token = credentials.credentials
    
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET,
            algorithms=[settings.JWT_ALGORITHM]
        )
        
        return AuthContext(
            user_id=str(payload.get("userId", "")),
            username=payload.get("sub"),
            tenant_id=payload.get("tenantId"),
            user_token=token,
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token 已过期，请重新登录")
    except JWTError as e:
        raise HTTPException(status_code=401, detail=f"Token 验证失败: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=401, detail="Token 验证异常")


async def optional_auth(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> Optional[AuthContext]:
    """
    可选鉴权：允许未登录
    
    对应 TS: optionalAuth
    """
    if not credentials:
        return None
    
    token = credentials.credentials
    
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET,
            algorithms=[settings.JWT_ALGORITHM]
        )
        
        return AuthContext(
            user_id=str(payload.get("userId", "")),
            username=payload.get("sub"),
            tenant_id=payload.get("tenantId"),
            user_token=token,
        )
    except Exception:
        return None


def extract_auth_from_header(auth_header: str) -> tuple[Optional[str], Optional[str], Optional[str]]:
    """
    从 Authorization header 提取认证信息
    
    Args:
        auth_header: Authorization header 值
        
    Returns:
        (user_id, username, user_token)
    """
    if not auth_header or not auth_header.startswith("Bearer "):
        return None, None, None
    
    token = auth_header[7:].strip()
    if not token:
        return None, None, None
    
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET,
            algorithms=[settings.JWT_ALGORITHM]
        )
        return (
            str(payload.get("userId", "")),
            payload.get("sub"),
            token,
        )
    except Exception:
        return None, None, None
