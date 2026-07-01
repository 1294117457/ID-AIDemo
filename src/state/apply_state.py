"""ApplyState - apply 子图状态 - 对应 TS: ApplyState.ts"""
from typing import Annotated, Literal, Sequence, TypedDict
from langgraph.graph import add_messages
from langchain_core.messages import BaseMessage


class ApplyState(TypedDict):
    """apply 子图状态 - 继承 MainState 并扩展"""
    
    messages: Annotated[Sequence[BaseMessage], add_messages]
    
    # 主图透传
    intent: Annotated[Literal["consult", "apply", "insufficient"], {"__root__": "apply"}]
    forced_intent: Annotated[Literal["consult", "apply"] | None, {"__root__": None}]
    missing_info: Annotated[list[str], {"__root__": []}]
    document_text: Annotated[str, {"__root__": ""}]
    
    # apply 专用
    templates: Annotated[list[dict], {"__root__": []}]
    
    # policyContext: RAG 检索到的政策参考
    policy_context: Annotated[str, {"__root__": ""}]
    
    # checkResults: LLM 匹配结果 (JSON 字符串数组)
    check_results: Annotated[list[str], {"__root__": []}]
