"""analyzeMatchNode - LLM 匹配 + MCP 拉 templates - 对应 TS: analyzeMatchNode.ts"""
import json
from typing import Any
from pydantic import BaseModel, Field
from langchain_core.messages import HumanMessage, SystemMessage
from models.llm import create_chat_model
from prompts.templates import ANALYZE_SYSTEM, analyze_user_prompt
from tools.backend_client import BackendClient


class Suggestion(BaseModel):
    """加分建议"""
    templateId: int = Field(description="模板id")
    templateName: str = Field(description="模板名称")
    ruleId: int = Field(description="匹配的规则id")
    ruleName: str = Field(description="匹配的规则名称")
    estimatedScore: float = Field(description="预计加分")
    reason: str = Field(description="一句话匹配理由，不超过50字")


class SuggestionSchema(BaseModel):
    """匹配结果 Schema"""
    suggestions: list[Suggestion] = Field(default_factory=list)


async def analyze_match_node(state: dict, config: dict) -> dict:
    """
    LLM 材料分析匹配节点
    
    归属: apply 子图
    功能: 调用后端 API 获取加分模板，LLM 分析材料匹配
    """
    print("--apply:analyzeMatch")
    
    document_text: str = state.get("document_text", "")
    policy_context: str = state.get("policy_context", "")
    
    # 从 config 获取 user_token
    user_token = config.get("configurable", {}).get("user_token", "")
    
    # 调用后端 API 获取加分模板
    result = await BackendClient.get_score_templates(user_token)
    
    if not result.get("success"):
        print.warn(f"--apply:analyzeMatch: 后端 API 失败: {result.get('error')}")
        return {"check_results": ['{"error":"无可用加分模板，请稍后重试"}']}
    
    templates = result.get("data", {}).get("templates", [])
    if not templates:
        # 兼容新旧格式
        templates = result.get("data", []) if isinstance(result.get("data"), list) else []
    
    if not templates:
        print.warn("--apply:analyzeMatch: MCP 返回模板为空")
        return {"check_results": ['{"error":"无可用加分模板，请稍后重试"}']}
    
    print(f"--apply:analyzeMatch: 获取到 {len(templates)} 个模板")
    
    # 提取模板信息用于 prompt
    templates_for_prompt = []
    for t in templates:
        rules = []
        for r in t.get("rules", []):
            rules.append({
                "id": r.get("id"),
                "ruleName": r.get("ruleName"),
                "ruleScore": r.get("ruleScore"),
            })
        templates_for_prompt.append({
            "id": t.get("id"),
            "templateName": t.get("templateName"),
            "templateType": t.get("templateType"),
            "rules": rules,
        })
    
    # LLM 分析匹配
    model = create_chat_model(temperature=0.1)
    structured_model = model.with_structured_output(SuggestionSchema)
    
    response = await structured_model.ainvoke([
        SystemMessage(content=ANALYZE_SYSTEM),
        HumanMessage(content=analyze_user_prompt(
            document_text[:2000],
            json.dumps(templates_for_prompt, ensure_ascii=False),
            policy_context
        ))
    ])
    
    # 转换为 JSON 字符串数组
    check_results = []
    for s in response.suggestions:
        check_results.append(json.dumps({
            "templateId": s.templateId,
            "templateName": s.templateName,
            "ruleId": s.ruleId,
            "ruleName": s.ruleName,
            "estimatedScore": s.estimatedScore,
            "reason": s.reason,
        }, ensure_ascii=False))
    
    return {"check_results": check_results}
