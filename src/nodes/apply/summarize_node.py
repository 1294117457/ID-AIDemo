"""summarizeNode - 结果汇总节点 - 对应 TS: summarizeNode.ts"""
import json
from typing import Any
from langchain_core.messages import AIMessage
from prompts.templates import NO_MATCH_REPLY


def parse_check_results(check_results: list[str]) -> list[dict]:
    """
    解析 checkResults，提取 suggestions
    """
    suggestions = []
    for r in check_results:
        try:
            parsed = json.loads(r)
            if "error" not in parsed:
                suggestions.append(parsed)
        except json.JSONDecodeError:
            continue
    return suggestions


async def summarize_node(state: dict) -> dict:
    """
    结果汇总节点
    
    归属: apply 子图
    功能: 汇总匹配结果，生成回复
    """
    print("--apply:summarize")
    
    check_results: list[str] = state.get("check_results", [])
    suggestions = parse_check_results(check_results)
    
    if not suggestions:
        # 无匹配
        reply = NO_MATCH_REPLY
    else:
        # 有匹配，生成回复
        reply_lines = ["根据您提供的材料，已为您匹配到以下加分项：", ""]
        for i, s in enumerate(suggestions, 1):
            reply_lines.append(f"{i}. **{s['templateName']}** / {s['ruleName']}")
            reply_lines.append(f"   预计加分: {s['estimatedScore']} 分")
            reply_lines.append(f"   匹配理由: {s['reason']}")
            reply_lines.append("")
        
        reply = "\n".join(reply_lines)
    
    return {
        "messages": [AIMessage(content=reply)]
    }
