"""知识库路由 - 支持文件上传/列表/删除/搜索"""
from fastapi import APIRouter, Depends, Query, UploadFile, File
from middleware.auth import require_auth, AuthContext
from rag.search import (
    search_knowledge,
    add_knowledge_from_file,
    list_knowledge_files,
    delete_knowledge_by_source,
)
from rag.file_parser import parse_file_to_text
from router.response import ok_response, fail_response

router = APIRouter(prefix="/ai/knowledge", tags=["Knowledge"])

CHUNK_SIZE = 500
CHUNK_OVERLAP = 50


def split_text(text: str, chunk_size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> list[str]:
    """将长文本按字符数切分，相邻块有重叠"""
    if len(text) <= chunk_size:
        return [text] if text.strip() else []
    chunks = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        chunks.append(text[start:end])
        start = end - overlap
    return [c for c in chunks if c.strip()]


@router.get("/list")
async def list_files(auth: AuthContext = Depends(require_auth)):
    """获取知识库文件列表（含每个文件的 chunk 数量）"""
    try:
        files = await list_knowledge_files()
        return ok_response(files)
    except Exception as e:
        return fail_response(500, str(e))


@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    auth: AuthContext = Depends(require_auth),
):
    """上传文件到知识库（解析 → 切分 → 向量化）"""
    if not file.filename:
        return fail_response(400, "请选择文件")

    allowed = {".pdf", ".doc", ".docx", ".xls", ".xlsx", ".md", ".txt"}
    suffix = "." + file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    if suffix not in allowed:
        return fail_response(400, f"不支持的文件格式: {suffix}，支持 {', '.join(allowed)}")

    try:
        content = await file.read()
        if len(content) > 20 * 1024 * 1024:
            return fail_response(400, "文件大小不能超过 20MB")

        text = parse_file_to_text(content, file.filename)
        if not text.strip() or text.startswith("["):
            return fail_response(400, f"文件解析失败或内容为空: {text}")

        chunks = split_text(text)
        if not chunks:
            return fail_response(400, "文件内容为空，无法添加到知识库")

        success = await add_knowledge_from_file(chunks, file.filename)
        if success:
            return ok_response({"message": f"上传成功，共 {len(chunks)} 个知识块", "chunkCount": len(chunks)})
        else:
            return fail_response(500, "向量化写入失败，请检查数据库连接")
    except Exception as e:
        return fail_response(500, str(e))


@router.delete("/{source_file:path}")
async def delete_file(
    source_file: str,
    auth: AuthContext = Depends(require_auth),
):
    """删除知识库中指定文件的所有 chunk"""
    if not source_file:
        return fail_response(400, "缺少文件名")
    try:
        success = await delete_knowledge_by_source(source_file)
        if success:
            return ok_response({"message": "删除成功"})
        else:
            return fail_response(500, "删除失败")
    except Exception as e:
        return fail_response(500, str(e))


@router.get("/search")
async def search(
    query: str = Query(..., min_length=1),
    top_k: int = Query(5, ge=1, le=20),
    auth: AuthContext = Depends(require_auth),
):
    """检索知识库（内部使用）"""
    try:
        results = await search_knowledge(query, top_k)
        return ok_response({"results": results})
    except Exception as e:
        return fail_response(500, str(e))
