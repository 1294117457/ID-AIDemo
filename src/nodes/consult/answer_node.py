"""answerNode - 回答生成节点 - 对应 TS: answerNode.ts"""
from typing import Any
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.messages import BaseMessage
from models.llm import create_chat_model
from rag.search import get_system_role


async def answer_node(state: dict) -> dict:
    """
    回答生成节点
    
    归属: consult 子图
    功能: 基于检索到的上下文生成回答
    """
    print("--consult:answer")
    
    messages: list[BaseMessage] = state.get("messages", [])
    retrieved_context: str = state.get("retrieved_context", "")
    
    # 获取用户最后一条消息
    user_messages = [m for m in messages if isinstance(m, HumanMessage)]
    if not user_messages:
        return {"messages": []}
    
    last_user_msg = user_messages[-1]
    
    # 获取系统角色
    system_role = await get_system_role()
    system_prompt = f"""{system_role}

【知识库检索结果】
{retrieved_context}"""
    
    # 生成回答
    model = create_chat_model(temperature=0.3)
    
    response = await model.ainvoke([
        SystemMessage(content=system_prompt),
        HumanMessage(content=str(last_user_msg.content))
    ])
    
    answer = response.content if hasattr(response, 'content') else str(response)
    
    print(f"--consult:answer: 生成回答 {len(answer)} 字符")
    
    return {"messages": [response]}
