"""confirmNode - 确认路由 + 确认节点 - 对应 TS: confirmNode.ts"""
import json
from typing import Literal
from langgraph.types import interrupt, Command
from langchain_core.messages import HumanMessage, AIMessage
from .summarize_node import parse_check_results


def confirm_route(state: dict) -> Literal["confirm", "__end__"]:
    """
    路由判断: 有匹配结果 → confirm；无结果 → 结束
    """
    check_results: list[str] = state.get("check_results", [])
    suggestions = parse_check_results(check_results)
    return "confirm" if suggestions else "__end__"


async def confirm_node(state: dict) -> dict:
    """
    确认节点
    
    归属: apply 子图
    功能: 等待用户确认并上传证明材料（使用 interrupt）
    """
    print("--apply:confirm (interrupt)")
    
    check_results: list[str] = state.get("check_results", [])
    suggestions = parse_check_results(check_results)
    
    # 生成确认问题
    question_lines = ["已为您匹配到以下加分项，请上传对应证明材料后点击「确认提交」：", ""]
    for i, s in enumerate(suggestions, 1):
        question_lines.append(f"{i}. **{s['templateName']}** / {s['ruleName']}（预计 {s['estimatedScore']} 分）")
        question_lines.append(f"   {s['reason']}")
        question_lines.append("")
    
    question = "\n".join(question_lines)
    
    # 使用 interrupt 暂停，等待用户确认
    user_answer = interrupt({
        "type": "confirm",
        "question": question,
        "suggestions": suggestions
    })
    
    return {
        "messages": [
            AIMessage(content=question),
            HumanMessage(content=str(user_answer))
        ]
    }
