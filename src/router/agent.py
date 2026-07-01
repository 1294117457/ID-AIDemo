"""Agent 路由 - 对应 TS: agent/index.ts"""
import json
from typing import Optional, AsyncGenerator
from fastapi import APIRouter, Depends, Form, UploadFile, File
from fastapi.responses import StreamingResponse

from middleware.auth import require_auth, AuthContext
from service.agent_service import AgentService, parse_agent_params
from schemas.types import AgentChatRequest, ResumeRequest
from router.response import ok_response, fail_response

router = APIRouter(prefix="/ai/agent", tags=["Agent"])


async def parse_form_request(
    message: str = Form(...),
    session_id: str = Form("default"),
    intent: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
) -> dict:
    document_text = ""
    if file and file.filename:
        from rag.file_parser import parse_file_to_text
        content = await file.read()
        document_text = parse_file_to_text(content, file.filename)
    return await parse_agent_params(
        message=message,
        session_id=session_id,
        document_text=document_text,
        intent=intent,
    )


@router.post("/chat")
async def chat(
    auth: AuthContext = Depends(require_auth),
    message: str = Form(...),
    session_id: str = Form("default"),
    intent: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
):
    if not message.strip() and (not file or not file.filename):
        return fail_response(400, "请输入文字或上传文件")
    try:
        params = await parse_form_request(message, session_id, intent, file)
        result = await AgentService.invoke(params)
        return ok_response(result.model_dump())
    except Exception as e:
        return fail_response(500, str(e))

@router.post('/stream')
async def stream(
    auth: AuthContext = Depends(require_auth),
    message: str = Form(...),
    session_id: str = Form('default'),
    intent: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
):
    if not message.strip() and (not file or not file.filename):
        return fail_response(400, '请输入文字或上传文件')
    async def event_generator():
        try:
            params = await parse_form_request(message, session_id, intent, file)
            params['user_id'] = auth.user_id
            async for event in AgentService.stream(params):
                yield f'data: {json.dumps(event)}\n\n'
        except Exception as e:
            yield f'data: {json.dumps({"type": "error", "data": {"message": str(e)}})}\n\n'
        yield 'data: [DONE]\n\n'
    return StreamingResponse(event_generator(), media_type='text/event-stream')

@router.post('/resume')
async def resume(
    body: ResumeRequest,
    auth: AuthContext = Depends(require_auth),
):
    if not body.session_id or not body.supplement or not body.supplement.strip():
        return fail_response(400, '缺少 sessionId 或 supplement')
    try:
        result = await AgentService.resume(
            body.session_id, body.supplement.strip(),
            user_id=auth.user_id, user_token=auth.user_token
        )
        return ok_response(result.model_dump())
    except Exception as e:
        return fail_response(500, str(e))
