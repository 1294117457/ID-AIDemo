"""知识库路由 - 对应 TS: knowledge/index.ts"""
from fastapi import APIRouter, Depends, Body, Query
from middleware.auth import require_auth, AuthContext
from rag.search import search_knowledge, add_knowledge
from schemas.types import KnowledgeUploadRequest, KnowledgeSearchRequest
from router.response import ok_response, fail_response

router = APIRouter(prefix="/ai/knowledge", tags=["Knowledge"])


@router.get("/search")
async def search(
    query: str = Query(..., min_length=1),
    top_k: int = Query(5, ge=1, le=20),
    auth: AuthContext = Depends(require_auth),
):
    """检索知识库"""
    try:
        results = await search_knowledge(query, top_k)
        return ok_response({"results": results})
    except Exception as e:
        return fail_response(500, str(e))


@router.post("/upload")
async def upload(
    body: KnowledgeUploadRequest,
    auth: AuthContext = Depends(require_auth),
):
    """上传知识到向量库"""
    try:
        if not body.content or not body.content.strip():
            return fail_response(400, "内容不能为空")
        
        success = await add_knowledge([body.content], [body.metadata])
        if success:
            return ok_response({"message": "上传成功"})
        else:
            return fail_response(500, "上传失败")
    except Exception as e:
        return fail_response(500, str(e))
