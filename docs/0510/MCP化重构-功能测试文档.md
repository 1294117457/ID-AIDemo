# MCP 化重构 — 功能测试文档

> 日期：2026-05-10
> 涉及工程：idagent、idbackend
> 前置条件：后端 `McpToolsController` 已部署，Agent 服务已启动

---

## 一、测试环境准备

### 1.1 启动服务

```bash
# 1. 启动后端（确保 McpToolsController 可访问）
cd idbackend
mvn spring-boot:run
# 确认日志中出现：Started Application in X seconds

# 2. 启动 Agent
cd idagent
npm run dev
# 确认日志中出现：Listening on http://localhost:3000
```

### 1.2 获取测试 Token

在浏览器中登录前端（F12 → Application → Local Storage → accessToken），
或通过登录接口获取：

```bash
curl -s -X POST http://localhost:8080/api/authserver/login \
  -H "Content-Type: application/json" \
  -d '{"username":"student@xmu.edu.cn","password":"xxx"}' | jq .data.accessToken
```

以下测试中，将 Token 记为 `<TOKEN>`。

---

## 二、后端接口测试（MCP 工具）

### 2.1 工具一：get_score_templates

**接口**：`GET /internal/mcp/tools/get_score_templates`

**测试命令**：

```bash
curl -s http://localhost:8080/internal/mcp/tools/get_score_templates \
  -H "Authorization: Bearer <TOKEN>"
```

**期望结果**：

```json
{
  "code": 200,
  "data": {
    "templates": [
      {
        "id": 1,
        "templateName": "学科竞赛类",
        "templateType": "CONDITION",
        "scoreType": 0,
        "templateMaxScore": 12,
        "reviewCount": 1,
        "rules": [
          { "id": 101, "ruleName": "国家级一等奖", "ruleScore": 8 }
        ]
      }
    ]
  }
}
```

**验证点**：

| 场景 | 操作 | 期望结果 |
|---|---|---|
| 正常调用 | 带有效 JWT | 返回模板列表，`code: 200` |
| JWT 无效 | Token 改为 `xxx` | 返回 `401` 或 `403` |

---

### 2.2 工具二：get_user_info

**接口**：`GET /internal/mcp/tools/get_user_info?userId={userId}`

**前置**：从 JWT 中知道自己的 userId，假设为 `123`

**测试命令**：

```bash
curl -s "http://localhost:8080/internal/mcp/tools/get_user_info?userId=123" \
  -H "Authorization: Bearer <TOKEN>"
```

**期望结果**：

```json
{
  "code": 200,
  "data": {
    "userInfo": {
      "userId": 123,
      "studentId": "stu2021001",
      "studentName": "张三",
      "major": "计算机科学与技术",
      "enrollmentYear": 2021
    }
  }
}
```

**验证点**：

| 场景 | 操作 | 期望结果 |
|---|---|---|
| 正常调用 | 查自己的 userId | 返回个人信息，`code: 200` |
| 跨用户查询 | `userId=456`（非自己的 ID） | 返回 `code: 403`，日志有警告 |

---

### 2.3 工具三：submit_application

**接口**：`POST /internal/mcp/tools/submit_application`

**测试命令**：

```bash
curl -s -X POST http://localhost:8080/internal/mcp/tools/submit_application \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": 999,
    "templateName": "学科竞赛类",
    "templateType": "CONDITION",
    "scoreType": 0,
    "applyScore": 8,
    "ruleId": 101,
    "reviewCount": 1,
    "remark": "测试提交",
    "proofItems": [
      { "proofFileId": 1, "proofValue": 8, "remark": "" }
    ]
  }'
```

**期望结果**：

```json
{
  "code": 200,
  "data": 1
}
```

**验证点**：

| 场景 | 操作 | 期望结果 |
|---|---|---|
| 正常提交 | 提交有效申请 | 返回申请 ID，`code: 200` |
| userId 伪造 | `userId=999`（非自己的 ID） | 后端强制覆盖为 JWT 中的真实 userId，申请仍成功写入 |
| 无效 Token | Token 改为 `xxx` | 返回 `401` 或 `403` |

**数据库验证**：

```sql
SELECT id, user_id, template_name, apply_score, remark
FROM score_application
WHERE template_name = '学科竞赛类'
ORDER BY id DESC LIMIT 1;
```

确认 `user_id` 为 JWT 对应的真实用户 ID，而非伪造值。

---

## 三、Agent 接口测试（端到端）

### 3.1 聊天入口（非流式）

**接口**：`POST /api/aichat/chat`

**测试命令**（咨询场景）：

```bash
curl -s -X POST http://localhost:8080/api/aichat/chat \
  -H "Authorization: Bearer <TOKEN>" \
  -F "message=我想了解一下创新创业类加分政策"
  # 期望：返回 AI 回复，intent 为 consult
```

**期望结果**：

```json
{
  "code": 200,
  "data": {
    "reply": "...",
    "intent": "consult",
    "interrupted": false
  }
}
```

### 3.2 聊天入口（流式 SSE）

**接口**：`POST /api/aichat/stream`

**测试命令**（流式输出）：

```bash
curl -s -N -X POST http://localhost:8080/api/aichat/stream \
  -H "Authorization: Bearer <TOKEN>" \
  -F "message=请介绍一下保研加分政策" \
  -F "sessionId=test_session_001"
```

**期望输出**：

```
data: {"type":"session","data":{"sessionId":"test_session_001"}}

data: {"type":"token","data":{"content":"根据"}}

data: {"type":"token","data":{"content":"知识库的内容..."}}

...

data: {"type":"result","data":{"reply":"...","intent":"consult","interrupted":false}}

data: [DONE]
```

**验证点**：

| 场景 | 操作 | 期望结果 |
|---|---|---|
| 正常流式 | 发消息，收到 token 流 | SSE 输出中包含 `token` 事件，`result` 事件中 `intent` 正确 |
| JWT 无效 | 不带 Token | 返回 401，Agent 无法调用 MCP（`getScoreTemplatesMcp` 失败） |

### 3.3 申请入口（intent=apply）

**接口**：`POST /api/aichat/stream` + `intent=apply`

**测试命令**（强制进入申请流程，跳过 classify）：

```bash
curl -s -N -X POST http://localhost:8080/api/aichat/stream \
  -H "Authorization: Bearer <TOKEN>" \
  -F "message=我上传了挑战杯国赛一等奖的证书，请帮我申请加分" \
  -F "intent=apply" \
  -F "sessionId=test_apply_001"
```

**期望输出**（apply 流程完整链路）：

```
# 1. fetchPolicyNode → RAG 检索政策
data: {"type":"token","data":{"content":"正在为您检索相关政策..."}}
data: {"type":"token","data":{"content":"..."}}

# 2. analyzeMatchNode → MCP 拉 templates + LLM 匹配
data: {"type":"token","data":{"content":"正在为您匹配加分项..."}}
data: {"type":"token","data":{"content":"为您匹配到以下加分项：\n\n• **学科竞赛类** / 国家级一等奖（预计 8 分）"}}

# 3. summarizeNode → 汇总（无流式输出，跳过）

# 4. confirmNode → interrupt
data: {"type":"interrupt","data":{"question":"已为您匹配到以下加分项，请上传对应证明材料后点击「确认提交」：...","suggestions":[...],"requireFiles":true}}

data: [DONE]
```

**验证点**：

| 节点 | 验证方式 | 期望结果 |
|---|---|---|
| fetchPolicyNode | 控制台日志 `--apply:fetchPolicy` | 出现日志 |
| analyzeMatchNode | 控制台日志 `--apply:analyzeMatch: MCP 拉取到 N 个模板` | 出现日志，显示拉取数量 |
| summarizeNode | 控制台日志 `--apply:summarize` | 出现日志 |
| confirmNode | SSE 输出 `interrupt` 事件 | 返回 `type:interrupt` 包含 question 和 suggestions |

### 3.4 中断恢复（resume-stream）

**接口**：`POST /api/aichat/resume-stream`

**前置**：已完成 3.3 流程，`sessionId=test_apply_001`，收到了 interrupt

**测试命令**（确认提交）：

```bash
curl -s -N -X POST http://localhost:8080/api/aichat/resume-stream \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "test_apply_001",
    "supplement": "{\"action\":\"confirm\",\"proofFileIds\":[1],\"proofValues\":[8]}"
  }'
```

**期望输出**：

```
# submitNode 执行
# 1. MCP getUserInfo → 拉取成功
# 2. MCP submitApplication → 提交成功
data: {"type":"token","data":{"content":"✅ 申请已提交成功！"}}
data: {"type":"result","data":{"intent":"apply","interrupted":false,...}}

data: [DONE]
```

**验证点**：

| 场景 | 操作 | 期望结果 |
|---|---|---|
| 确认提交 | `action: confirm` + `proofFileIds` | 申请提交成功，数据库有新记录 |
| 用户取消 | `action: cancel` | 返回"已取消申请"，数据库无新记录 |

**数据库验证**：

```sql
SELECT id, user_id, template_name, apply_score, remark, status
FROM score_application
WHERE user_id = <真实用户ID>
ORDER BY id DESC LIMIT 1;
```

---

## 四、鉴权安全测试

### 4.1 Agent 无法伪造 userId

**测试**：`submit_application` 接口，dto 中 userId=999，JWT 中 userId=123

```bash
curl -s -X POST http://localhost:8080/internal/mcp/tools/submit_application \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"userId":999,...}'
```

**验证**：数据库中该申请的 `user_id` 字段为 123（JWT 中的真实值），而非 999（dto 中的伪造值）

### 4.2 无效 JWT 无法调用 MCP

| 测试接口 | Token | 期望结果 |
|---|---|---|
| `/internal/mcp/tools/get_score_templates` | `xxx` | 401 / 403 |
| `/internal/mcp/tools/get_user_info?userId=123` | `xxx` | 401 / 403 |
| `/internal/mcp/tools/submit_application` | `xxx` | 401 / 403 |

### 4.3 跨用户查询被拦截

```bash
# 当前登录用户 userId=123
curl -s "http://localhost:8080/internal/mcp/tools/get_user_info?userId=456" \
  -H "Authorization: Bearer <TOKEN>"
```

**期望结果**：`{"code": 403, "msg": "无权访问其他用户信息"}`

---

## 五、会话持久化测试

### 5.1 消息持久化

```bash
# 创建会话
curl -s http://localhost:8080/api/aichat/conversation/create \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"firstMessage":"测试消息"}'
```

```bash
# 获取消息列表
curl -s "http://localhost:8080/api/aichat/conversation/{sessionId}/messages" \
  -H "Authorization: Bearer <TOKEN>"
```

**期望**：消息已持久化，包含 user/assistant/interrupt 三种角色

---

## 六、测试结果汇总表

| 功能 | 测试接口 | 通过标准 |
|---|---|---|
| MCP 获取 templates | `GET /internal/mcp/tools/get_score_templates` | 返回模板列表，JWT 无效拒绝 |
| MCP 获取 userInfo | `GET /internal/mcp/tools/get_user_info` | 返回个人信息，跨用户拒绝 |
| MCP 提交申请 | `POST /internal/mcp/tools/submit_application` | 申请写入数据库，userId 防伪造 |
| JWT 透传 | Agent → 后端各接口 | Agent 有权调用 MCP |
| 咨询流程 | `/api/aichat/stream` (intent=consult) | 正常回复 |
| 申请流程 | `/api/aichat/stream` (intent=apply) | fetch → analyze → summarize → interrupt |
| 中断恢复 | `/api/aichat/resume-stream` | confirm 提交成功，cancel 取消 |
| 会话持久化 | `/api/aichat/conversation/*` | 消息正确保存 |

---

## 七、常见问题排查

| 问题 | 可能原因 | 排查方式 |
|---|---|---|
| MCP 调用返回 401 | 后端 Security Filter 拦截 | 检查 `SecurityConfig` 是否放行了 `/internal/mcp/**` |
| `getScoreTemplatesMcp` 失败 | JWT 未透传 | 确认 `AICHatController` 的 `Authorization` header 被正确传递 |
| `submitNode` 报"获取用户信息失败" | `userId` 为空 | 确认 `x-user-id` header 被正确设置 |
| `applyScore` 写入为 0 | `proofFileIds` 为空 | `confirm` 响应中 `proofFileIds` 必须非空 |
| 申请 `user_id` 错误 | dto 中 userId 被篡改 | 查看后端日志 `[MCP] submit_application: userId 不匹配` |
