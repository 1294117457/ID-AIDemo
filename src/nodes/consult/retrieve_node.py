"""retrieveNode - RAG 向量库检索 - 对应 TS: retrieveNode.ts"""
from typing import Any
from langchain_core.messages import HumanMessage
from langchain_core.messages import BaseMessage
from rag.search import search_knowledge


async def retrieve_node(state: dict) -> dict:
    """
    RAG 向量库检索节点
    
    归属: consult 子图
    功能: 检索政策知识库，获取相关上下文
    """
    print("--consult:retrieve")
    
    messages: list[BaseMessage] = state.get("messages", [])
    
    # 获取最后一条用户消息
    user_messages = [m for m in messages if isinstance(m, HumanMessage)]
    if not user_messages:
        return {"retrieved_context": ""}
    
    last_user_msg = user_messages[-1]
    query = str(last_user_msg.content)
    
    # 检索知识库
    retrieved_context = await search_knowledge(query, top_k=5)
    
    print(f"--consult:retrieve: 检索到 {len(retrieved_context)} 字符")
    
    return {"retrieved_context": retrieved_context}
