# 0511 前端直连 Agent + JWT 鉴权改造 — 实施报告

> 生成日期：2026-05-11
> 状态：✅ 已完成实施

---

## 一、改造概述

### 1.1 改造目标

将前端与 Agent 的通信从「前端 → 后端（代理）→ Agent」三层架构，简化为「前端 → Agent（直连）」两层架构。同时在 Agent 端实现真正的 JWT 鉴权，不再依赖后端透传的 `x-user-id` 请求头。

### 1.2 最终架构

```
┌────────────────────────────────────────────────────────────────────┐
│                           BROWSER                                   │
│   idfrontend (localhost:5173)   │   idfrontend-admin (localhost:5174)│
└──────────┬──────────────────────┴─────────────────────────────────────┘
           │
           │  Authorization: Bearer <JWT>  (直连，不经过后端)
           ▼
┌─────────────────────────────────────────────────────────────────┐
│                         idagent (localhost:3001)                  │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐   │
│  │  requireAuth 中间件 (JWT 验证)                              │   │
│  │  verifyJWT(token) → userId (密码学保证)                     │   │
│  │  - 签名验证                                                 │   │
│  │  - tokenType = 'access' 检查                                │   │
│  │  - 过期时间检查                                              │   │
│  └────────────────────────────────────────────────────────────┘   │
│                          │                                        │
│  ┌──────────┐  ┌──────────────────┐  ┌───────────────────────┐   │
│  │ /agent   │  │ /conversation    │  │ /knowledge            │   │
│  │ /config  │  │ /analyze        │  │ /ai (health, 公开)    │   │
│  └──────────┘  └──────────────────┘  └───────────────────────┘   │
│                                                                 │
│  Agent → 后端 MCP 接口（带 JWT）                                  │
└───────────────────────────┬─────────────────────────────────────┘
                            │  Authorization: Bearer <JWT>
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    idbackend (localhost:8080)                     │
│                   /internal/mcp/tools/* (JWT 验证)                 │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
                     ┌──────────────┐
                     │   MySQL DB    │
                     └──────────────┘
```

---

## 二、变更清单

### 2.1 `idagent` 变更

| 操作 | 文件路径 | 说明 |
|------|---------|------|
| **新增** | `src/1common/utils/jwt.ts` | JWT 验证工具（与后端 JWTUtils 一致） |
| **新增** | `src/7controller/middleware/auth.ts` | requireAuth 中间件 |
| **修改** | `src/7controller/index.ts` | 应用 requireAuth 中间件 + CORS 配置 |
| **修改** | `src/7controller/agent/index.ts` | 使用 req.userId（中间件注入）|
| **修改** | `src/7controller/conversation/index.ts` | 使用 req.userId，修复 sessionId 类型 |
| **修改** | `src/7controller/knowledge/index.ts` | 添加鉴权，修复 await 位置 |
| **修改** | `src/7controller/analyze/index.ts` | 添加鉴权 |
| **修改** | `src/7controller/config/index.ts` | 添加鉴权 |
| **修改** | `src/7controller/health.ts` | 响应格式改为 `{code, msg, data}` |
| **修改** | `src/6service/utils/auth.ts` | 优先使用中间件注入的 userId |
| **修改** | `src/6service/AgentService.ts` | parseAgentParams 不再信任 x-user-id |
| **修改** | `.env` | 新增 JWT_SECRET、AGENT_PUBLIC_URL |
| **修改** | `package.json` | 新增 jsonwebtoken、@types/jsonwebtoken |
| **删除** | - | 无 |

### 2.2 `idfrontend` 变更

| 操作 | 文件路径 | 说明 |
|------|---------|------|
| **新增** | `src/api/agent.ts` | Agent 直连 API（完整重写） |
| **修改** | `.env.dev` | 新增 VITE_AGENT_BASE_URL |
| **修改** | `.env.prod` | 新增 VITE_AGENT_BASE_URL |
| **修改** | `.env.test` | 新增 VITE_AGENT_BASE_URL |
| **修改** | `src/views/ai-chat/index.vue` | 导入改为 @/api/agent |
| **修改** | `src/views/score/index.vue` | 导入改为 @/api/agent |
| **修改** | `src/api/components/apiAIchat.ts` | 清理废弃函数，保留类型和会话 API |

### 2.3 `idfrontend-admin` 变更

| 操作 | 文件路径 | 说明 |
|------|---------|------|
| **新增** | `src/api/agent.ts` | Agent 直连 API（完整重写） |
| **修改** | `.env.dev` | 新增 VITE_AGENT_BASE_URL |
| **修改** | `.env.prod` | 新增 VITE_AGENT_BASE_URL |
| **修改** | `.env.test` | 新增 VITE_AGENT_BASE_URL |
| **修改** | `src/views/ai-chat/index.vue` | 重写，添加完整会话持久化功能 |
| **修改** | `src/views/ai-manage/KnowledgePanel.vue` | 导入改为 @/api/agent |
| **修改** | `src/views/ai-manage/AiConfigPanel.vue` | 导入改为 @/api/agent（已有） |
| **修改** | `src/api/modules/apiAIagent.ts` | 清空，标记为废弃 |

### 2.4 `idbackend` 变更

| 操作 | 文件路径 | 说明 |
|------|---------|------|
| **删除** | `controller/businessController/ChatController.java` | 旧版非 LangGraph 接口 |
| **删除** | `controller/aichat/AICHatController.java` | Agent 透传代理 |
| **删除** | `service/businessService/AICHatService.java` | Agent 透传代理 |
| **删除** | `controller/aiapply/AIApplyController.java` | 申请流程透传代理 |
| **删除** | `service/businessService/AIApplyService.java` | 申请流程透传代理 |

---

## 三、关键实现细节

### 3.1 JWT 验证（Agent 端）

**`src/1common/utils/jwt.ts`**

使用 `jsonwebtoken` 库实现与后端完全一致的 JWT 验证：

```typescript
import jwt from 'jsonwebtoken'

// 密钥必须与后端一致
const JWT_SECRET = process.env.JWT_SECRET ?? 'id-backend-default-secret-key-2024-change-in-production'

export function verifyJWT(token: string): JWTPayload {
  const decoded = jwt.verify(token, JWT_SECRET) as jwt.JwtPayload

  if (decoded['tokenType'] !== 'access') {
    throw new JWTError('Token 类型错误，请使用 Access Token', 403)
  }
  // ...
  return { tokenType: 'access', userId, sub: username, ... }
}
```

**`src/7controller/middleware/auth.ts`**

```typescript
export function requireAuth(req, res, next) {
  const token = req.headers['authorization']?.slice(7)
  try {
    const payload = verifyJWT(token)
    req.userId = payload.userId      // 密码学保证的 userId
    req.username = payload.sub
    next()
  } catch (e) {
    if (e instanceof JWTError) {
      res.status(e.code).json({ code: e.code, msg: e.message, data: null })
    }
  }
}
```

### 3.2 统一响应格式

所有 Agent 接口均返回 `{code, msg, data}` 格式：

```json
{ "code": 200, "msg": "成功", "data": { ... } }
{ "code": 401, "msg": "未登录，请重新登录", "data": null }
{ "code": 403, "msg": "Token 已过期，请刷新", "data": null }
```

### 3.3 CORS 配置

`src/7controller/index.ts` 配置了允许的前端域名：

```typescript
app.use(cors({
  origin: [
    'http://localhost:5173',   // idfrontend dev
    'http://localhost:5174',   // idfrontend-admin dev
    'http://localhost:3001',   // Agent 自身
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-user-id'],
}))
```

### 3.4 API 路由映射变化

| 前端请求（改造后） | Agent 路由 | 鉴权 |
|------------------|-----------|------|
| `POST /ai/agent/stream` | `/ai/agent/stream` | requireAuth |
| `POST /ai/agent/resume-stream` | `/ai/agent/resume-stream` | requireAuth |
| `GET /ai/conversation/list` | `/ai/conversation/list` | requireAuth |
| `POST /ai/conversation/create` | `/ai/conversation/create` | requireAuth |
| `GET /ai/conversation/:id/messages` | `/ai/conversation/:id/messages` | requireAuth |
| `DELETE /ai/conversation/:id` | `/ai/conversation/:id` | requireAuth |
| `GET /ai/knowledge/list` | `/ai/knowledge/list` | requireAuth |
| `POST /ai/knowledge/upload` | `/ai/knowledge/upload` | requireAuth |
| `DELETE /ai/knowledge/:file` | `/ai/knowledge/:file` | requireAuth |
| `GET /ai/config/` | `/ai/config/` | requireAuth |
| `PUT /ai/config/` | `/ai/config/` | requireAuth |
| `GET /ai` | `/ai`（health） | **公开** |

---

## 四、测试结果

### 4.1 Agent 端测试（全部通过）

| 测试 | 预期 | 实际 | 结果 |
|------|------|------|------|
| Health 端点（无鉴权） | 200 + `{code:200, msg:..., data:...}` | 200 + 新格式响应 | ✅ |
| `/agent/chat` 无 token | 401 + 未登录 | 401 + `{"code":401,"msg":"未登录，请重新登录"...}` | ✅ |
| `/agent/chat` 无效 token | 401 + Token 无效 | 401 + `{"code":401,"msg":"Token 无效，请重新登录"...}` | ✅ |
| `/conversation/list` 无 token | 401 | 401 + 未登录 | ✅ |
| `/knowledge/list` 无 token | 401 | 401 + 未登录 | ✅ |
| `/config/` 无 token | 401 | 401 + 未登录 | ✅ |

### 4.2 TypeScript 编译测试

| 项目 | 命令 | 结果 |
|------|------|------|
| idagent | `tsc --noEmit` | ✅ 无错误 |
| idfrontend | `vue-tsc --noEmit` | ✅ 无错误 |
| idfrontend-admin | `vue-tsc --noEmit` | ✅ 无错误 |

---

## 五、环境变量配置

### 5.1 idagent（`.env`）

```env
# JWT 鉴权（必须与后端一致）
JWT_SECRET=id-backend-default-secret-key-2024-change-in-production

# Agent 直连地址
AGENT_PUBLIC_URL=http://localhost:3001
```

### 5.2 idfrontend / idfrontend-admin（`.env.dev`）

```env
VITE_AGENT_BASE_URL=http://localhost:3001
```

### 5.3 生产环境配置

```env
# idagent 生产
JWT_SECRET=<与后端一致的密钥>
AGENT_PUBLIC_URL=https://your-agent-domain.com

# 前端生产
VITE_AGENT_BASE_URL=https://your-agent-domain.com
```

**⚠️ 重要：生产环境 JWT_SECRET 必须与后端 `application.yml` 中的 `jwt.secret` 完全一致！**

---

## 六、部署顺序

1. **启动 idbackend**（确保 `/internal/mcp/tools/*` 接口可用）
2. **部署 idagent**（配置 JWT_SECRET）
3. **部署 idfrontend 和 idfrontend-admin**（配置 VITE_AGENT_BASE_URL）

---

## 七、已知限制

1. **生产 JWT_SECRET 尚未配置**：当前使用默认密钥，生产部署时必须设置与后端一致的密钥
2. **生产 Agent 域名尚未配置**：VITE_AGENT_BASE_URL 在生产环境需要指向实际的 Agent 域名
3. **Redis 依赖**：后端登录等功能依赖 Redis，测试需要 Redis 运行
4. **CORS 生产域名**：生产部署时需要在 Agent 的 CORS 配置中添加实际的前端域名

---

## 八、四个工程整体架构（改造后）

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              BROWSER (客户端)                                │
│                                                                             │
│  ┌────────────────────────────┐    ┌──────────────────────────────────────┐  │
│  │     idfrontend           │    │         idfrontend-admin             │  │
│  │   (localhost:5173)      │    │         (localhost:5174)              │  │
│  │                          │    │                                      │  │
│  │  登录 → JWT 存 localStorage                                               │
│  │  VITE_BASE_API = 后端地址                                                 │
│  │  VITE_AGENT_BASE_URL = Agent地址                                         │
│  │  src/api/agent.ts → 直连 Agent                                          │
│  │  src/api/components/*.ts → 后端 API（申请、文件等）                       │
│  └────────────┬─────────────┘    └──────────────────────┬─────────────────┘  │
└────────────────┼────────────────────────────────────────┼────────────────────┘
                 │                                        │
                 │  ┌────────────────┐                    │
                 │  │ 后端 API       │                    │
                 │  │ /api/auth/*   │                    │
                 │  │ /api/user/*   │                    │
                 │  │ /api/application/*                                    │
                 │  │ /api/file/*   │                    │
                 │  │ /internal/mcp/tools/* (JWT验证)                        │
                 │  └───────┬────────┘                    │
                 │          │                           │
                 ▼          ▼                           ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                         idbackend (localhost:8080)                           │
│                                                                             │
│  JWT 验证 ──▶ AuthInterceptor ──▶ UserContext（ThreadLocal）              │
│  角色/权限查询 ──▶ RbacService（Redis 缓存）                                  │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────┐           │
│  │  Spring MVC Controllers                                     │           │
│  │  LoginController / UserController / ApplicationController  │           │
│  │  McpToolsController / InternalAgentController              │           │
│  │  FileController / TemplateController / ProofController     │           │
│  └──────────────────────────────────────────────────────────────┘           │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────┐           │
│  │  已删除（Agent 直连后不再需要）：                            │           │
│  │  AICHatController / AICHatService                          │           │
│  │  AIApplyController / AIApplyService                        │           │
│  │  ChatController                                            │           │
│  └──────────────────────────────────────────────────────────────┘           │
│                              │                                              │
└──────────────────────────────┼──────────────────────────────────────────────┘
                               │  MCP 调用（带 JWT）
                               ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                         idagent (localhost:3001)                            │
│                                                                             │
│  requireAuth 中间件 ──▶ verifyJWT(token) ──▶ req.userId (密码学保证)       │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────┐           │
│  │  Express Routes                                            │           │
│  │  /ai/agent/*        (对话，SSE 流式)                        │           │
│  │  /ai/conversation/*  (会话管理，持久化到 SQLite)               │           │
│  │  /ai/knowledge/*    (知识库管理)                            │           │
│  │  /ai/config/*       (AI 配置管理)                          │           │
│  │  /ai/analyze/*      (证明材料分析)                          │           │
│  │  /ai               (health，公开)                          │           │
│  └──────────────────────────────────────────────────────────────┘           │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────┐           │
│  │  LangGraph (AgentService)                                   │           │
│  │  分类 → 咨询/申请流程 → LLM + RAG + MCP 调用后端             │           │
│  └──────────────────────────────────────────────────────────────┘           │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────┐           │
│  │  数据存储                                                    │           │
│  │  data/agent.db (SQLite) — 会话、消息、Checkpoint            │           │
│  │  data/knowledge/ — RAG 向量索引                               │           │
│  └──────────────────────────────────────────────────────────────┘           │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 四个工程职责

| 工程 | 技术栈 | 职责 | 数据 |
|------|--------|------|------|
| `idfrontend` | Vue3 | 学生前端，AI 助手 + 申请流程 | localStorage（JWT） |
| `idfrontend-admin` | Vue3 | 管理后台，AI 管理 + 成绩审核 | localStorage（JWT） |
| `idbackend` | Java/Spring | 业务逻辑，数据库操作，MCP 工具 | MySQL + Redis |
| `idagent` | Node.js/Express | AI 对话引擎，RAG，知识库 | SQLite |

### 通信关系

```
前端 ──── JWT ────▶ 后端         （业务 API：用户、申请、文件）
前端 ──── JWT ────▶ Agent        （AI 对话：SSE、知识库、配置）
Agent ──── JWT ────▶ 后端 MCP    （RAG 查询、用户信息、提交申请）
后端 ──────────────▶ MySQL       （业务数据）
Agent ──────────────▶ SQLite      （会话、消息、向量）
```
