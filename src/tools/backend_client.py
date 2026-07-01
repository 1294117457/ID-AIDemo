"""后端 API 客户端 - 替代 MCP"""
import httpx
from config.settings import get_settings

settings = get_settings()


class BackendClient:
    """后端 API 调用客户端"""
    
    BASE_URL = settings.JAVA_BACKEND_URL

    @classmethod
    async def get_score_templates(cls, user_token: str) -> dict:
        """
        获取加分模板列表
        
        对应 TS: getScoreTemplatesTool
        """
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(
                    f"{cls.BASE_URL}/internal/tools/score-templates",
                    headers={"X-User-Token": user_token} if user_token else {},
                )
                response.raise_for_status()
                data = response.json()
                
                if data.get("code") == 200:
                    return {
                        "success": True,
                        "data": data.get("data", {})
                    }
                else:
                    return {
                        "success": False,
                        "error": data.get("msg", "获取模板失败")
                    }
        except httpx.TimeoutException:
            return {"success": False, "error": "请求超时"}
        except httpx.HTTPStatusError as e:
            return {"success": False, "error": f"HTTP错误: {e.response.status_code}"}
        except Exception as e:
            return {"success": False, "error": str(e)}

    @classmethod
    async def get_user_info(cls, user_token: str, user_id: int | str) -> dict:
        """
        获取用户信息
        
        对应 TS: getUserInfoTool
        """
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(
                    f"{cls.BASE_URL}/internal/tools/user-info",
                    headers={
                        "X-User-Token": user_token,
                        "X-User-Id": str(user_id)
                    } if user_token else {"X-User-Id": str(user_id)},
                )
                response.raise_for_status()
                data = response.json()
                
                if data.get("code") == 200:
                    return {
                        "success": True,
                        "data": data.get("data", {})
                    }
                else:
                    return {
                        "success": False,
                        "error": data.get("msg", "获取用户信息失败")
                    }
        except Exception as e:
            return {"success": False, "error": str(e)}

    @classmethod
    async def submit_application(
        cls,
        user_token: str,
        session_id: str,
        suggestions: list[dict],
        file_key: str | None = None
    ) -> dict:
        """
        提交加分申请
        
        对应 TS: submitApplicationTool
        """
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    f"{cls.BASE_URL}/internal/tools/applications",
                    headers={"X-User-Token": user_token} if user_token else {},
                    json={
                        "sessionId": session_id,
                        "suggestions": suggestions,
                        "fileKey": file_key
                    },
                )
                response.raise_for_status()
                data = response.json()
                
                if data.get("code") == 200:
                    return {
                        "success": True,
                        "data": data.get("data", {})
                    }
                else:
                    return {
                        "success": False,
                        "error": data.get("msg", "提交申请失败")
                    }
        except Exception as e:
            return {"success": False, "error": str(e)}
