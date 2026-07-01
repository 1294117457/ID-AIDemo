"""classifyNode - 意图分类 - 对应 TS: classifyNode.ts"""
import json
from typing import Literal
from pydantic import BaseModel
from langchain_core.messages import HumanMessage
from langchain_core.messages import BaseMessage
from models.llm import create_chat_model
from prompts.templates import classify_prompt


class ClassifyOutput(BaseModel):
    """意图分类输出"""
    intent: Literal["consult", "apply", "insufficient"]
    missing: list[str] = []
    document_text: str = ""


async def classify_node(state: dict) -> dict:
    """
    意图分类节点
    
    归属: 主图节点
    功能: 分析用户输入，判断意图并提取信息
    
    forcedIntent 优先：申请入口专用，优先级高于 LLM 分类
    """
    # forcedIntent 优先
    forced_intent = state.get("forced_intent")
    if forced_intent:
        print(f"-main:classifyNode: forcedIntent={forced_intent}，跳过 LLM 分类")
        return {"intent": forced_intent}
    
    # 提取用户消息
    messages: list[BaseMessage] = state.get("messages", [])
    all_user_text = "\n".join([
        m.content for m in messages
        if isinstance(m, HumanMessage)
    ])
    
    if not all_user_text:
        return {"intent": "consult"}
    
    # LLM 分类
    model = create_chat_model(temperature=0)
    structured_model = model.with_structured_output(ClassifyOutput)
    
    result = await structured_model.ainvoke([
        HumanMessage(content=classify_prompt(all_user_text))
    ])
    
    print(f"-main:classifyNode: 意图={result.intent}, 缺失={result.missing}, 材料={result.document_text[:10] if result.document_text else ''}...")
    
    return {
        "intent": result.intent,
        "missing_info": result.missing or [],
        "document_text": result.document_text or "",
    }
