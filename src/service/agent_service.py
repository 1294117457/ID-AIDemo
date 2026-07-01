"""Agent 服务 - 对应 TS: AgentService.ts"""
import json
from typing import Optional, AsyncGenerator, Any
from langgraph.types import Command
from langchain_core.messages import HumanMessage, AIMessage
from langchain_core.messages import BaseMessage
from schemas.types import AgentInput, AgentResult
from utils.constants import SKIP_NODES
from .conversation_service import append_message, get_conversation_by_session
from .memory import should_compress, compress_messages
from rag.file_parser import parse_file_to_text, decode_filename


class AgentService:
    """Agent 对话编排服务"""
    
    _compiled_graph = None
    
    @classmethod
    async def get_graph(cls):
        """获取编译后的图"""
        if cls._compiled_graph is None:
            from graph.builder import build_main_graph
            cls._compiled_graph = await build_main_graph()
        return cls._compiled_graph
    
    @classmethod
    def _extract_result(cls, state: dict) -> dict:
        """从状态中提取结果"""
        messages: list[BaseMessage] = state.get("messages", [])
        
        # 获取最后一条 AI 消息
        ai_messages = [m for m in messages if hasattr(m, '_get_type') and m._get_type() == 'ai']
        last_ai = ai_messages[-1] if ai_messages else None
        
        # 解析 checkResults
        check_results: list[str] = state.get("check_results", [])
        suggestions = []
        for r in check_results:
            try:
                parsed = json.loads(r)
                if "error" not in parsed:
                    suggestions.append(parsed)
            except json.JSONDecodeError:
                continue
        
        return {
            "interrupted": False,
            "reply": str(last_ai.content) if last_ai and hasattr(last_ai, 'content') else "",
            "intent": state.get("intent", "consult"),
            "document_text": state.get("document_text", ""),
            "suggestions": suggestions,
        }
    
    @classmethod
    async def _check_interrupt(cls, config: dict) -> Optional[dict]:
        """检查是否有中断"""
        graph = await cls.get_graph()
        
        try:
            snapshot = await graph.aget_state(config)
            interrupts = snapshot.tasks if hasattr(snapshot, 'tasks') else []
            
            for task in interrupts:
                if hasattr(task, 'interrupts') and task.interrupts:
                    interrupt = task.interrupts[0]
                    if isinstance(interrupt, dict) and interrupt.get("type") == "confirm":
                        suggestions = interrupt.get("suggestions", [])
                        return {
                            "interrupted": True,
                            "question": interrupt.get("question", ""),
                            "suggestions": suggestions,
                            "reply": "",
                            "intent": "apply",
                            "document_text": "",
                        }
        except Exception as e:
            print(f"[agent] check_interrupt error: {e}")
        
        return None
    
    @classmethod
    async def _compress_if_needed(cls, config: dict) -> dict:
        """检查并压缩上下文"""
        graph = await cls.get_graph()
        
        try:
            snapshot = await graph.aget_state(config)
            messages: list[BaseMessage] = snapshot.values.get("messages", []) if hasattr(snapshot, 'values') else []
            
            # 筛选相关消息
            relevant = [m for m in messages 
                       if hasattr(m, '_get_type') 
                       and m._get_type() in ('human', 'ai')]
            
            previous_count = len(relevant)
            
            if not should_compress(previous_count):
                return {"compressed": False, "previous": previous_count, "new": previous_count}
            
            # 压缩
            compressed = await compress_messages(relevant)
            await graph.aupdate_state(config, {"messages": compressed})
            
            new_count = len(compressed)
            print(f"[memory] compressed {previous_count} → {new_count} messages")
            
            return {"compressed": True, "previous": previous_count, "new": new_count}
        except Exception as e:
            print(f"[agent] compress error: {e}")
            return {"compressed": False, "previous": 0, "new": 0}
    
    @classmethod
    def _safe_append_message(cls, session_id: str, user_id: str | None, role: str, content: str, msg_type: str = "message", extra_data: str = None):
        """安全写入消息"""
        try:
            if user_id:
                conv = get_conversation_by_session(session_id)
                if conv and conv.get("user_id") != user_id:
                    print(f"[persist] 安全拦截：会话 {session_id} 属于 {conv.get('user_id')}，拒绝用户 {user_id} 写入")
                    return
            
            append_message(session_id, role, content, msg_type, extra_data)
            print(f"[persist] ✓ 保存 {role} 消息，会话={session_id}，内容长度={len(content)}")
        except Exception as e:
            print(f"[persist] ✗ 保存消息失败: {e}")
    
    @classmethod
    async def invoke(cls, input: AgentInput) -> AgentResult:
        """
        执行 Agent 对话
        
        对应 TS: invokeAgent
        """
        config = {
            "configurable": {
                "thread_id": input.session_id,
                "user_token": input.user_token or "",
                "user_id": input.user_id or "",
            }
        }
        
        graph = await cls.get_graph()
        
        # 保存用户消息
        if input.user_id:
            cls._safe_append_message(input.session_id, input.user_id, "user", input.user_input)
        
        # 检查并压缩上下文
        compress_result = await cls._compress_if_needed(config)
        
        # 执行图
        result = await graph.ainvoke({
            "messages": [HumanMessage(content=input.user_input)],
            "document_text": input.document_text or "",
            "forced_intent": input.forced_intent,
        }, config)
        
        # 检查中断
        interrupt_result = await cls._check_interrupt(config)
        if interrupt_result:
            if input.user_id:
                cls._safe_append_message(
                    input.session_id, input.user_id, "interrupt",
                    interrupt_result.get("question", ""), "interrupt"
                )
            return AgentResult(**interrupt_result)
        
        # 保存助手回复
        if input.user_id and result:
            messages: list[BaseMessage] = result.get("messages", [])
            ai_messages = [m for m in messages if hasattr(m, '_get_type') and m._get_type() == 'ai']
            if ai_messages:
                last_ai = ai_messages[-1]
                if hasattr(last_ai, 'content') and last_ai.content:
                    cls._safe_append_message(input.session_id, input.user_id, "assistant", str(last_ai.content))
        
        extracted = cls._extract_result(result)
        return AgentResult(**extracted)
    
    @classmethod
    async def resume(cls, session_id: str, supplement: str, user_id: str = None, user_token: str = None) -> AgentResult:
        """
        恢复中断的对话
        
        对应 TS: resumeAgent
        """
        config = {
            "configurable": {
                "thread_id": session_id,
                "user_id": user_id or "",
                "user_token": user_token or "",
            }
        }
        
        graph = await cls.get_graph()
        
        # 保存用户补充
        if user_id:
            cls._safe_append_message(session_id, user_id, "user", supplement)
        
        # 使用 Command(resume=...) 恢复
        result = await graph.ainvoke(
            Command(resume=supplement),
            config
        )
        
        # 检查中断
        interrupt_result = await cls._check_interrupt(config)
        if interrupt_result:
            return AgentResult(**interrupt_result)
        
        extracted = cls._extract_result(result)
        return AgentResult(**extracted)
    
    @classmethod
    async def stream(cls, input: AgentInput) -> AsyncGenerator[dict, None]:
        """
        流式执行 Agent
        
        对应 TS: streamAgent
        """
        config = {
            "configurable": {
                "thread_id": input.session_id,
                "user_token": input.user_token or "",
                "user_id": input.user_id or "",
            }
        }
        
        graph = await cls.get_graph()
        
        # 保存用户消息
        if input.user_id:
            cls._safe_append_message(input.session_id, input.user_id, "user", input.user_input)
        
        # 检查并压缩上下文
        compress_result = await cls._compress_if_needed(config)
        if compress_result.get("compressed"):
            yield {
                "type": "context_compressed",
                "data": {
                    "message": f"上下文已自动压缩（{compress_result['previous']} → {compress_result['new']} 条），继续对话。"
                }
            }
        
        # 流式执行
        assistant_content = ""
        
        try:
            async for event in graph.astream_events(
                {
                    "messages": [HumanMessage(content=input.user_input)],
                    "document_text": input.document_text or "",
                    "forced_intent": input.forced_intent,
                },
                config,
                version="v2"
            ):
                if event.get("event") == "on_chat_model_stream":
                    node = event.get("metadata", {}).get("langgraph_node", "")
                    if node in SKIP_NODES:
                        continue
                    
                    chunk = event.get("data", {}).get("chunk", {})
                    token = chunk.get("content", "") if isinstance(chunk, dict) else ""
                    
                    if token:
                        assistant_content += token
                        yield {"type": "token", "data": {"content": token}}
        except Exception as e:
            yield {"type": "error", "data": {"message": str(e)}}
            return
        
        # 保存助手回复
        if input.user_id and assistant_content:
            cls._safe_append_message(input.session_id, input.user_id, "assistant", assistant_content)
        
        # 检查中断
        interrupt_result = await cls._check_interrupt(config)
        if interrupt_result:
            if input.user_id:
                cls._safe_append_message(
                    input.session_id, input.user_id, "interrupt",
                    interrupt_result.get("question", ""), "interrupt"
                )
            yield {
                "type": "interrupt",
                "data": {
                    "question": interrupt_result.get("question"),
                    "suggestions": interrupt_result.get("suggestions", []),
                    "require_files": len(interrupt_result.get("suggestions", [])) > 0
                }
            }
            return
        
        # 返回最终结果
        try:
            snapshot = await graph.aget_state(config)
            extracted = cls._extract_result(snapshot.values if hasattr(snapshot, 'values') else {})
            yield {"type": "result", "data": extracted}
        except Exception as e:
            yield {"type": "error", "data": {"message": str(e)}}
    
    @classmethod
    async def stream_resume(cls, session_id: str, supplement: str, user_id: str = None, user_token: str = None) -> AsyncGenerator[dict, None]:
        """
        流式恢复对话
        
        对应 TS: streamResume
        """
        config = {
            "configurable": {
                "thread_id": session_id,
                "user_token": user_token or "",
                "user_id": user_id or "",
            }
        }
        
        graph = await cls.get_graph()
        
        # 保存用户补充
        if user_id:
            cls._safe_append_message(session_id, user_id, "user", supplement)
        
        # 检查并压缩上下文
        compress_result = await cls._compress_if_needed(config)
        
        # 流式恢复
        assistant_content = ""
        
        try:
            async for event in graph.astream_events(
                Command(resume=supplement),
                config,
                version="v2"
            ):
                if event.get("event") == "on_chat_model_stream":
                    node = event.get("metadata", {}).get("langgraph_node", "")
                    if node in SKIP_NODES:
                        continue
                    
                    chunk = event.get("data", {}).get("chunk", {})
                    token = chunk.get("content", "") if isinstance(chunk, dict) else ""
                    
                    if token:
                        assistant_content += token
                        yield {"type": "token", "data": {"content": token}}
        except Exception as e:
            yield {"type": "error", "data": {"message": str(e)}}
            return
        
        # 保存助手回复
        if user_id and assistant_content:
            cls._safe_append_message(session_id, user_id, "assistant", assistant_content)
        
        # 检查中断
        interrupt_result = await cls._check_interrupt(config)
        if interrupt_result:
            if user_id:
                cls._safe_append_message(
                    session_id, user_id, "interrupt",
                    interrupt_result.get("question", ""), "interrupt"
                )
            yield {
                "type": "interrupt",
                "data": {
                    "question": interrupt_result.get("question"),
                    "suggestions": interrupt_result.get("suggestions", []),
                    "require_files": len(interrupt_result.get("suggestions", [])) > 0
                }
            }
            return
        
        # 返回最终结果
        try:
            snapshot = await graph.aget_state(config)
            extracted = cls._extract_result(snapshot.values if hasattr(snapshot, 'values') else {})
            yield {"type": "result", "data": extracted}
        except Exception as e:
            yield {"type": "error", "data": {"message": str(e)}}


async def parse_agent_params(
    message: str,
    session_id: str,
    user_id: str = None,
    user_token: str = None,
    document_text: str = "",
    intent: str = None
) -> AgentInput:
    """
    解析 Agent 参数
    
    对应 TS: parseAgentParams
    """
    forced_intent = None
    if intent in ("apply", "consult"):
        forced_intent = intent
    
    return AgentInput(
        user_input=message.strip(),
        session_id=session_id or "default",
        user_id=user_id,
        user_token=user_token,
        document_text=document_text,
        forced_intent=forced_intent,
    )
