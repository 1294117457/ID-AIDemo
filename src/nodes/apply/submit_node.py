"""submitNode - 提交节点 - 对应 TS: submitNode.ts"""
import json
from typing import Any
from langchain_core.messages import HumanMessage, AIMessage
from langchain_core.messages import BaseMessage
from tools.backend_client import BackendClient


async def submit_node(state: dict, config: dict) -> dict:
    """
    提交节点
    
    归属: apply 子图
    功能: 将申请提交到后端
    """
    print("--apply:submit")
    
    check_results: list[str] = state.get("check_results", [])
    messages: list[BaseMessage] = state.get("messages", [])
    
    # 从 config 获取参数
    user_token = config.get("configurable", {}).get("user_token", "")
    thread_id = config.get("configurable", {}).get("thread_id", "")
    
    # 解析 suggestions
    suggestions = []
    for r in check_results:
        try:
            parsed = json.loads(r)
            if "error" not in parsed:
                suggestions.append({
                    "templateId": parsed.get("templateId"),
                    "ruleId": parsed.get("ruleId"),
                    "estimatedScore": parsed.get("estimatedScore"),
                })
        except json.JSONDecodeError:
            continue
    
    if not suggestions:
        return {
            "messages": [AIMessage(content="提交失败：没有有效的加分项")]
        }
    
    # 提交到后端
    result = await BackendClient.submit_application(
        user_token=user_token,
        session_id=thread_id,
        suggestions=suggestions,
    )
    
    if result.get("success"):
        reply = "加分申请已提交成功！请等待审核。"
    else:
        reply = f"提交失败：{result.get('error', '未知错误')}"
    
    return {
        "messages": [AIMessage(content=reply)]
    }
