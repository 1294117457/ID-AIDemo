"""RAG 检索 - 原生 pgvector 实现"""
from typing import Optional, List
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session
from config.settings import get_settings

settings = get_settings()

_engine = None


def get_engine():
    """获取数据库引擎"""
    global _engine
    if _engine is None:
        _engine = create_engine(settings.PG_VECTOR_URL, pool_pre_ping=True)
    return _engine


def get_embeddings_model():
    """获取 Embedding 模型"""
    from models.embeddings import create_embeddings
    return create_embeddings()


async def search_knowledge(query: str, top_k: int = 5) -> str:
    """
    搜索知识库
    
    Args:
        query: 查询文本
        top_k: 返回数量
        
    Returns:
        检索到的上下文文本
    """
    try:
        embeddings = get_embeddings_model()
        
        # 生成查询向量
        query_embedding = embeddings.embed_query(query)
        
        # 执行向量相似度搜索
        engine = get_engine()
        with engine.connect() as conn:
            result = conn.execute(
                text("""
                    SELECT content, 1 - (embedding <=> :query_vector::vector) as similarity
                    FROM policy_vectors
                    ORDER BY embedding <=> :query_vector::vector
                    LIMIT :top_k
                """),
                {"query_vector": str(query_embedding), "top_k": top_k}
            ).fetchall()
            
            if not result:
                return "未找到相关政策信息。"
            
            contexts = [row[0] for row in result]
            return "\n\n---\n\n".join(contexts)
    except Exception as e:
        print(f"[rag] search error: {e}")
        return "检索知识库时发生错误。"


async def add_knowledge(texts: List[str], metadatas: List[dict] | None = None) -> bool:
    """
    添加知识到向量库
    
    Args:
        texts: 文本列表
        metadatas: 元数据列表
        
    Returns:
        是否成功
    """
    try:
        embeddings = get_embeddings_model()
        engine = get_engine()
        
        # 批量生成 embeddings
        embeddings_list = embeddings.embed_documents(texts)
        
        with engine.connect() as conn:
            for i, (text_item, embedding) in enumerate(zip(texts, embeddings_list)):
                metadata = metadatas[i] if metadatas and i < len(metadatas) else {}
                import json
                conn.execute(
                    text("""
                        INSERT INTO policy_vectors (content, metadata, embedding)
                        VALUES (:content, :metadata::jsonb, :embedding::vector)
                    """),
                    {
                        "content": text_item,
                        "metadata": json.dumps(metadata, ensure_ascii=False),
                        "embedding": str(embedding)
                    }
                )
            conn.commit()
        
        return True
    except Exception as e:
        print(f"[rag] add error: {e}")
        return False


async def list_knowledge_files() -> list[dict]:
    """
    列出知识库中所有文件及其 chunk 数量
    
    Returns:
        [{"sourceFile": "xxx.pdf", "chunkCount": 5}, ...]
    """
    try:
        engine = get_engine()
        with engine.connect() as conn:
            rows = conn.execute(
                text("""
                    SELECT metadata->>'source_file' AS source_file, COUNT(*) AS chunk_count
                    FROM policy_vectors
                    WHERE metadata->>'source_file' IS NOT NULL
                    GROUP BY metadata->>'source_file'
                    ORDER BY source_file
                """)
            ).fetchall()
            return [{"sourceFile": row[0], "chunkCount": row[1]} for row in rows]
    except Exception as e:
        print(f"[rag] list_knowledge error: {e}")
        return []


async def delete_knowledge_by_source(source_file: str) -> bool:
    """
    删除指定源文件的所有知识块
    
    Args:
        source_file: 文件名（对应 metadata.source_file）
        
    Returns:
        是否成功
    """
    try:
        engine = get_engine()
        with engine.connect() as conn:
            conn.execute(
                text("DELETE FROM policy_vectors WHERE metadata->>'source_file' = :source_file"),
                {"source_file": source_file}
            )
            conn.commit()
        return True
    except Exception as e:
        print(f"[rag] delete_knowledge error: {e}")
        return False


async def add_knowledge_from_file(texts: list[str], source_file: str) -> bool:
    """
    从文件添加知识，自动附带 source_file 元数据
    """
    import json
    metadatas = [{"source_file": source_file} for _ in texts]
    return await add_knowledge(texts, metadatas)


async def get_system_role() -> str:
    """
    获取系统角色 (从数据库读取)
    """
    from config.database import engine
    from sqlalchemy import text
    
    try:
        with engine.connect() as conn:
            row = conn.execute(
                text("SELECT config_value FROM ai_config WHERE config_key = 'system_role'")
            ).fetchone()
            if row:
                return row[0]
    except Exception as e:
        print(f"[rag] get_system_role error: {e}")
    
    # Fallback
    return "你是厦门大学信息学院保研加分助手。回答语言：中文，简洁专业。"
