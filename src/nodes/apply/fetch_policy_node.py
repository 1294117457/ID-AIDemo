"""fetchPolicyNode - RAG 检索加分政策 - 对应 TS: fetchPolicyNode.ts"""
from typing import Any
from rag.search import search_knowledge


async def fetch_policy_node(state: dict) -> dict:
    """
    RAG 检索加分政策节点
    
    归属: apply 子图
    功能: 检索政策知识库，获取相关政策上下文
    """
    print("--apply:fetchPolicy")
    
    document_text: str = state.get("document_text", "")
    
    # 使用 document_text 前512字符作为查询
    query = document_text[:512] if document_text else "保研加分政策"
    
    # 检索知识库
    policy_context = await search_knowledge(query, top_k=5)
    
    return {"policy_context": policy_context}
