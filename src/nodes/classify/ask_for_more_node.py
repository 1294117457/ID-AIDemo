"""askForMoreNode - 追问缺失信息 - 对应 TS: askForMoreNode.ts"""
from typing import Any
from langchain_core.messages import HumanMessage, AIMessage
from langchain_core.messages import BaseMessage
from models.llm import create_chat_model
from prompts.templates import contextual_ask_prompt


async def ask_for_more_node(state: dict) -> dict:
    """
    追问缺失信息节点
    
    归属: 主图节点
    功能: 当用户信息不足时，生成追问
    """
    messages: list[BaseMessage] = state.get("messages", [])
    missing_info: list[str] = state.get("missing_info", [])
    
    # 提取已有信息
    all_user_text = "\n".join([
        m.content for m in messages
        if isinstance(m, HumanMessage)
    ])
    
    # 生成追问
    model = create_chat_model(temperature=0.3)
    
    prompt = contextual_ask_prompt(all_user_text, missing_info)
    response = await model.ainvoke([HumanMessage(content=prompt)])
    
    ask_message = response.content if hasattr(response, 'content') else str(response)
    
    print(f"-main:askForMoreNode: 追问={ask_message[:50]}...")
    
    return {
        "messages": [
            AIMessage(content=ask_message)
        ]
    }
