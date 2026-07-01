"""JWT 工具 - 对应 TS: jwt.ts"""
from jose import jwt, JWTError
from config.settings import get_settings

settings = get_settings()


class JWTError(Exception):
    """JWT 错误"""
    def __init__(self, message: str, code: int = 401):
        self.message = message
        self.code = code
        super().__init__(message)


def verify_jwt(token: str) -> dict:
    """
    验证 JWT token
    
    Args:
        token: JWT token 字符串
        
    Returns:
        解码后的 payload
        
    Raises:
        JWTError: token 无效或过期
    """
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET,
            algorithms=[settings.JWT_ALGORITHM]
        )
        return payload
    except jwt.ExpiredSignatureError:
        raise JWTError("Token 已过期，请重新登录", 401)
    except jwt.JWTClaimsError:
        raise JWTError("Token 格式错误", 401)
    except Exception as e:
        raise JWTError(f"Token 验证失败: {str(e)}", 401)


def extract_auth(auth_header: str) -> tuple[str | None, str | None, str | None]:
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
        payload = verify_jwt(token)
        user_id = payload.get("userId")
        username = payload.get("sub")
        tenant_id = payload.get("tenantId")
        return user_id, username, token
    except JWTError:
        return None, None, None
