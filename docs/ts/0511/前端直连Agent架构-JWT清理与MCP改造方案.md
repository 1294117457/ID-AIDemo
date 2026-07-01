# 前端直连 Agent 架构 — JWT 残留清理 & MCP 改造方案

> 生成时间：2026-05-11
> 状态：待实施（已整合官方 SDK，方案已确定）

---

## 一、现状架构全图

```
┌─────────────────────────────────────────────────────────────┐
│              前端 (idfrontend / idfrontend-admin)           │
│                                                              │
│  Authorization: Bearer <accessToken>                          │
│  FormData: { message, sessionId, intent?, file? }             │
│  Target: ${VITE_AGENT_BASE_URL}/ai/agent/stream              │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTP (CORS, 直连 Agent 端口 3001)
                           ▼
┌──────────────────────────────────────────────────────────────┐
│              idagent (Express Node.js, 端口 3001)              │
│                                                               │
│  1. requireAuth 中间件：verifyJWT(token) → userId             │
│  2. AsyncLocalStorage：存储当前请求的 userId + token          │
│                                                               │
│  ├─ fetchPolicyNode  → Chroma 向量库 (本地，无后端依赖)        │
│  ├─ analyzeMatchNode → MCP: getScoreTemplatesTool()           │
│  │                     → MCP Server (http://localhost:8080)   │
│  │                     → X-User-Token: <前端 JWT>              │
│  └─ submitNode       → MCP: getUserInfoTool(userId)          │
│                        MCP: submitApplicationTool(body)       │
│                        → MCP Server                           │
│                        → X-User-Token: <前端 JWT>              │
└──────────────────────────────────────────────────────────────┘
                           │ Streamable-HTTP (MCP 协议)
                           ▼
┌──────────────────────────────────────────────────────────────┐
│              idbackend (Spring Boot, 端口 8080)                │
│                                                               │
│  McpToolsController (/internal/mcp/tools/*)                    │
│    ├─ getScoreTemplates   (公开数据，无需用户身份)            │
│    ├─ getUserInfo         (JWT 覆盖 query userId)            │
│    └─ submitApplication   (JWT 覆盖 body userId)             │
│                                                               │
│  InternalAgentController (/internal/agent/*)                    │
│    └─ submitFromAgent     (ServiceKey 鉴权，**已废弃**)       │
└──────────────────────────────────────────────────────────────┘
```

---

## 二、JWT 残留代码清单 & 清理方案

### 2.1 可直接删除的废弃代码

| 文件 | 废弃原因 | 影响范围 |
|---|---|---|
| `idbackend/.../controller/businessController/InternalAgentController.java` | ServiceKey 方案已废弃，被 MCP Server 替代 | 无（所有调用方已切到 MCP） |
| `idbackend/.../controller/mcp/McpToolsController.java` | 旧版 HTTP MCP，已被 Spring AI MCP Server 替代 | 无（所有调用方已切到 MCP） |
| `idbackend/.../controller/dto/score/AgentSubmitDto.java` 中的 `InternalAgent` 相关字段 | 同上，需审查后清理 | 需审查 |
| `idagent/.env` 中的 `INTERNAL_TOKEN` | 仅供 `InternalAgentController` 使用，Controller 删除后可删 | 无 |
| `idbackend/.../annotation/PublicAccess.java` 中对 `InternalAgentController` 和 `McpToolsController` 的 `@PublicAccess` 标注 | Controller 删除后无需此标注 | 无 |
| `idbackend/.../config/.../InternalAuthConfig.java`（如果存在 ServiceKey 专用配置） | 同上 | 无 |

**删除后验证：**
```bash
# 确认旧 Controller 没有其他调用方
rg "internal/agent/submit" idbackend/src
rg "internal/mcp/tools" idbackend/src
rg "X-Internal-Service-Key" idbackend/src
rg "INTERNAL_TOKEN" idbackend/src idagent/src
```
应全部返回空。

---

### 2.2 需要修改的残留 JWT 传递代码

#### 2.2.1 Agent → Backend JWT 传递链

**核心问题：** 前端 JWT 被透传到 Agent，再从 Agent 透传到后端，形成了「JWT 三跳」，且 userId 作为参数存在越权风险。

```
前端 JWT → Agent (verifyJWT 验证) → 后端 MCP
                    ↓
            userId 作为参数传入后端
            → 若后端不验证参数中的 userId，则存在越权风险
```

**解决思路：**

- Agent 端：用 `AsyncLocalStorage`（Node.js 原生，ThreadLocal 等价）存储当前请求的 JWT，无需层层透传
- 后端端：从请求头 `X-User-Token` 中解析 JWT，**强制取 userId**，忽略参数中传入的任何 userId

```
前端 JWT ──验证──→ Agent（存入 AsyncLocalStorage）
                    ↓
           Node 层 / mcpClient.ts / LangGraph
                    └─ getCurrentToken() 取 JWT → 填入 X-User-Token 请求头
                                                 ↓
后端 McpAuthFilter ──验证 JWT──→ McpToolsService
                                          ↓
                                   从 JWT 取 userId（忽略参数）
                                   └─ AgentSubmitDto.setUserId(userIdFromJwt)
```

**修改范围：**

| 文件 | 当前代码 | 改为 |
|---|---|---|
| `idagent/.../1common/context/requestContext.ts` | **新增** | `AsyncLocalStorage` 上下文存储 |
| `idagent/.../7controller/middleware/auth.ts` | `verifyJWT` 后存入 `req` | 改为存入 `AsyncLocalStorage` |
| `idagent/.../7controller/mcp/mcpClient.ts` | `Authorization: userToken` | `X-User-Token: <JWT>` 透传到后端 |
| `idagent/.../7controller/mcp/mcpClient.ts` | 不读取 token | `getCurrentToken()` 从 `AsyncLocalStorage` 取 |
| `idagent/.../6service/AgentService.ts` 第 257 行 | `// userToken 透传到后端 MCP 接口` | 删除此注释 |
| `idagent/.../analyze/index.ts` 第 20-22 行 | 提取 `userToken` 并传入 `analyzeCertificate` | 删除，`analyzeCertificate` 的 `userToken` 参数移除 |
| `idagent/.../KnowledgeService.ts` | `userToken?: string` 参数，`getScoreTemplatesMcp(userToken)` | 删除参数，直接调用 `getScoreTemplatesTool()` |
| `idagent/.../common/config.ts` | `BACKEND_URL = JAVA_BACKEND_URL` | 删除（不再需要） |
| `idagent/.env` | `INTERNAL_TOKEN` | 删除；新增 `MCP_SERVER_URL`（`http://localhost:8080/api/mcp`）|

#### 2.2.2 前端 JWT 验证代码（不应删除）

| 文件 | 代码 | 是否保留 | 理由 |
|---|---|---|---|
| `idagent/.../middleware/auth.ts` | `requireAuth` / `verifyJWT` | **保留** | 前端直连 Agent，必须验证用户身份 |
| `idagent/.../1common/utils/jwt.ts` | JWT 验证逻辑 | **保留** | 供 `requireAuth` 使用 |
| `idagent/.env` 的 `JWT_SECRET` | Agent 独立 JWT 密钥 | **保留** | Agent 自验证前端 JWT，与后端共享同一密钥 |
| `idfrontend/src/api/agent.ts` | `Authorization: Bearer ${token}` | **保留** | 前端到 Agent 的鉴权 |
| `idfrontend-admin/src/api/agent.ts` | 同上 | **保留** | 同上 |

---

## 三、真正 MCP 协议改造方案

### 3.1 目标架构

```
┌────────────────────────────────────────────────────────────┐
│                   idagent (MCP Host)                        │
│                                                              │
│  @langchain/mcp-adapters — MultiServerMCPClient              │
│  └─► 连接到后端 MCP Server（Streamable-HTTP）                │
│                                                              │
│  AsyncLocalStorage ─── 存储当前请求的前端 JWT                │
│                                                              │
│  LangGraph Node 调用工具时（无感知）：                         │
│    analyzeMatchNode → MCP: getScoreTemplates                  │
│    submitNode       → MCP: getUserInfo                       │
│                       MCP: submitApplication                  │
└────────────────────────────┬─────────────────────────────────┘
                             │ Streamable-HTTP（POST /api/mcp）
                             │ X-User-Token: Bearer <前端 JWT>
                             ▼
┌────────────────────────────────────────────────────────────┐
│                   idbackend (MCP Server)                     │
│                                                              │
│  spring-ai-starter-mcp-server-webmvc                         │
│  @McpTool 注解注册工具（Streamable-HTTP，端口 8080）        │
│                                                              │
│  ├─ tools/list    → 自动发现（Spring AI 扫描 @McpTool）    │
│  ├─ tools/call    → 执行工具（后端从 JWT 自取 userId）     │
│  ├─ initialize    → 握手                                    │
│  └─ ping          → Spring AI 自动处理                      │
│                                                              │
│  鉴权：复用现有 AuthInterceptor + UserContext                │
│  后端从 UserContext 强制取 userId，不再依赖参数传递           │
└────────────────────────────────────────────────────────────┘
```

### 3.2 前后端 + Agent 各自职责

| 服务 | 职责 | 改动范围 |
|---|---|---|
| **idbackend** | 实现 MCP Server，`@McpTool` 暴露三个工具，Streamable-HTTP 传输 | 新增 Spring AI MCP 依赖，工具类加注解 |
| **idagent** | 实现 MCP Client，`MultiServerMCPClient` 连接后端，`AsyncLocalStorage` 存储 JWT | 新增 `requestContext.ts` + `mcpClient.ts`，Node 改用 MCP |
| **idfrontend / idfrontend-admin** | 不变，前端直连 Agent 架构不变 | 无需改动 |

### 3.3 安全鉴权设计

```
越权风险分析：

场景一：前端伪造 userId
  前端 JWT 中 userId=123，参数传 userId=456
  → 后端从 JWT 取 userId=123，参数中的 456 被忽略 ✓ 安全

场景二：Agent bug 用错 userId
  Agent 实际用户 123，调用时传了 userId=456
  → 后端从 JWT 取 userId=123，参数中的 456 被忽略 ✓ 安全

场景三：Agent 被攻破
  攻击者控制 Agent，任意指定 userId
  → 后端从 JWT 取 userId，但 JWT 本身由前端传给 Agent
  → 仍受前端 JWT 约束，攻击者无法伪造非登录用户的身份 ✓ 基本安全

结论：后端从 JWT 强制取 userId，参数中的 userId 一律忽略，
      从根本上消除越权漏洞。
```

---

### 3.4 前后端 SDK 选型依据

#### Agent 端（TypeScript）

| 选项 | 说明 |
|---|---|
| **@langchain/mcp-adapters（采用）** | LangChain 官方 MCP 客户端，`MultiServerMCPClient` 一行连接，支持 Streamable-HTTP、自动重连、多服务器管理。npm 周下载 21 万次，生态成熟。 |
| 手写 jsonRpcCall | 不推荐。MCP 四阶段（initialize / tools/list / tools/call / ping）都要自己实现，协议细节多，容易出错。 |

```bash
npm install @langchain/mcp-adapters
```

#### 后端端（Java）

| 选项 | 说明 |
|---|---|
| **spring-ai-starter-mcp-server-webmvc（采用）** | Spring AI 官方 MCP Server 启动器，`@McpTool` 注解声明工具，自动处理 initialize / tools/list / tools/call / ping，Streamable-HTTP 开箱即用。 |
| 手写 MCP Server | 不推荐。协议细节复杂（JSON-RPC 2.0、SSE、错误处理），Spring AI 已封装完整。 |

---

## 四、详细实施步骤

---

### 步骤 1：后端 — 实现 MCP Server（`idbackend`）

#### 1.1 新增 pom.xml 依赖

```xml
<dependency>
    <groupId>org.springframework.ai</groupId>
    <artifactId>spring-ai-starter-mcp-server-webmvc</artifactId>
</dependency>
```

> Spring AI 版本需与项目中其他 spring-ai-* 依赖保持一致。

#### 1.2 新增配置（`application.yml`）

```yaml
spring:
  ai:
    mcp:
      server:
        protocol: STREAMABLE
        name: idbackend-mcp-server
        version: 1.0.0
        type: SYNC
        instructions: "厦门大学保研系统后端 MCP 工具集"
        tool-change-notification: true
        streamable-http:
          mcp-endpoint: /api/mcp
```

#### 1.3 新增 MCP 工具类（`McpToolsService.java`）

用 `@McpTool` 注解声明工具，Spring AI 自动注册到 MCP Server，无需手动写 JSON Schema。

**重要：userId 从 JWT 自取，不信任参数中传入的任何值。**

```java
package com.zch.idbackend.mcp;

import com.zch.idbackend.context.UserContext;
import com.zch.idbackend.service.businessService.ApplicationService;
import com.zch.idbackend.mapper.businessMapper.TemplateMapper;
import com.zch.idbackend.mapper.functionMapper.UserMapper;
import org.springframework.ai.tool.annotation.Tool;
import org.springframework.ai.tool.callback.ToolCallbackProvider;
import org.springframework.ai.tool.method.MethodToolCallbackProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Bean;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;

/**
 * MCP 工具服务 — 通过 @McpTool 注解暴露为 MCP 工具
 *
 * Spring AI 自动扫描 @Tool 注解，将方法签名 + 注解描述转换为 MCP JSON Schema。
 *
 * 鉴权：复用现有 AuthInterceptor + UserContext。
 * AuthInterceptor 在 preHandle 中解析 X-User-Token，存入 UserContext。
 * 工具方法直接调用 UserContext.getUserId()，不信任参数中传入的任何 userId，
 * 从根本上消除越权风险。
 */
@Service
public class McpToolsService {

    @Autowired private TemplateMapper templateMapper;
    @Autowired private UserMapper userMapper;
    @Autowired private ApplicationService applicationService;

    // ── 工具一：获取加分模板列表 ────────────────────────────────────────────

    @Tool(description = "获取所有激活的加分模板列表（含审核规则）。无需参数，返回模板名称、类型、分数上限及规则详情。")
    public List<Map<String, Object>> getScoreTemplates() {
        return templateMapper.findAllActive().stream().map(t -> Map.<String, Object>of(
            "id",               t.getId(),
            "templateName",     t.getTemplateName(),
            "templateType",    t.getTemplateType(),
            "scoreType",       t.getScoreType(),
            "templateMaxScore",t.getTemplateMaxScore(),
            "reviewCount",     t.getReviewCount(),
            "description",     t.getDescription(),
            "rules",           ruleService.getRuleDetailsByTemplateId(t.getId())
        )).toList();
    }

    // ── 工具二：获取用户信息 ──────────────────────────────────────────────

    /**
     * userId 从 UserContext 自取。
     * 模板是公开数据，不需要用户身份，但返回的用户信息需与 JWT 对应。
     */
    @Tool(description = "获取指定用户的基本信息。参数：userId（整数），返回学号、姓名、专业、年级。")
    public Map<String, Object> getUserInfo(Integer userIdParam) {
        // 强制从 UserContext 取 userId，参数中的 userIdParam 忽略
        Integer userId = UserContext.getUserId();
        if (userId == null) {
            throw new RuntimeException("未登录或 Token 无效");
        }

        UserPO user = userMapper.selectById(userId);
        if (user == null) {
            throw new RuntimeException("用户不存在: userId=" + userId);
        }
        String username = user.getUsername() != null ? user.getUsername() : "";
        String studentId = username.contains("@") ? username.split("@")[0] : username;

        return Map.<String, Object>of(
            "userId",         userId,
            "studentId",      studentId,
            "studentName",    user.getFullName() != null ? user.getFullName() : "",
            "major",          user.getMajor() != null ? user.getMajor() : "",
            "enrollmentYear", user.getGrade() != null ? user.getGrade() : 0
        );
    }

    // ── 工具三：提交加分申请 ──────────────────────────────────────────────

    /**
     * userId 从 UserContext 自取，参数中的任何 userId 值一律忽略。
     * 这样即使 Agent 传错了 userId，后端也只会提交到 JWT 对应的用户。
     */
    @Tool(description = "提交加分申请。参数：userId（整数，仅作参考）、templateName（字符串）、applyScore（整数）、proofItems（证明材料数组）等。返回申请编号。")
    public Map<String, Object> submitApplication(
        Integer userIdParam,                        // ← 参数名仅作文档参考，实际被忽略
        String templateName,
        Integer applyScore,
        Integer ruleId,
        String remark,
        List<Map<String, Object>> proofItems
    ) {
        // 强制从 UserContext 取 userId，参数中的 userIdParam 忽略
        Integer userId = UserContext.getUserId();
        if (userId == null) {
            throw new RuntimeException("未登录或 Token 无效");
        }

        AgentSubmitDto dto = new AgentSubmitDto();
        dto.setUserId(userId);                        // ← 强制用 UserContext 中的
        dto.setTemplateName(templateName);
        dto.setApplyScore(applyScore != null ? applyScore : 0);
        dto.setRuleId(ruleId);
        dto.setRemark(remark);
        dto.setProofItems(buildProofItems(proofItems));

        ResultVo<?> result = applicationService.submitFromAgent(dto);
        if (result.getCode() == 200) {
            return Map.of("applicationId",
                result.getData() != null ? result.getData().toString() : "");
        }
        throw new RuntimeException("提交失败: " + result.getMsg());
    }

    // ── Spring Bean：注册工具到 MCP Server ─────────────────────────────────

    @Bean
    public ToolCallbackProvider mcpTools(McpToolsService mcpToolsService) {
        return MethodToolCallbackProvider.builder()
            .toolObjects(mcpToolsService)
            .build();
    }
}
```

#### 1.4 后端复用：现有 `AuthInterceptor` + `UserContext`

**无需新增任何文件**。现有后端已有完整的鉴权体系：

```
AuthInterceptor.java    ──── JWT 验证 + UserContext 写入 + 角色权限校验
UserContext.java        ──── ThreadLocal 等价（Java 原生）
WebConfig.java         ──── 注册拦截器到 /api/**
```

**`AuthInterceptor` 已做的事（完全满足 MCP 需求）：**

- ✅ 验证 `Authorization: Bearer <前端JWT>` 请求头
- ✅ 调用 `JWTUtils.verify()` 解析 JWT
- ✅ 调用 `UserContext.set(userId, username, roles, permissions)` 存入 ThreadLocal
- ✅ 在 `afterCompletion` 中调用 `UserContext.clear()` 自动清理
- ✅ 处理 `OPTIONS` 预检请求
- ✅ 拦截 `/api/**` 路径（`/**` 已覆盖 `/api/mcp`）

**唯一需要的改动：**

`AuthInterceptor` 当前读取请求头 `Authorization: Bearer <JWT>`。由于 MCP 协议内部占用 `Authorization` 头，前端 JWT 通过 `X-User-Token` 请求头传递。因此需要修改 `AuthInterceptor` 的请求头读取逻辑：

```java
// AuthInterceptor.java — 第 50 行附近
// 旧：
String token = request.getHeader("Authorization");

// 新：优先从 X-User-Token 取（MCP 调用），降级从 Authorization 取（普通接口）
String token = request.getHeader("X-User-Token");
if (token == null) {
    token = request.getHeader("Authorization");
}
if (token == null || !token.startsWith("Bearer ")) {
    return sendError(response, 401, "未登录，请重新登录");
}
```

> **为什么不新增 Filter？** Filter 运行在 Interceptor 之前，会绕开 Spring MVC 的 `HandlerInterceptor` 体系，导致 `UserContext` 和 `afterCompletion` 清理逻辑无法生效，且两套上下文并存增加维护成本。直接复用 `AuthInterceptor` 是最简洁、最安全的选择。

#### 1.5 后端：彻底删除旧 Controller

直接删除以下文件，不再保留废弃版本：

```bash
# 删除旧 Controller
rm idbackend/src/.../controller/businessController/InternalAgentController.java
rm idbackend/src/.../controller/mcp/McpToolsController.java

# 清理 PublicAccess 注解中对上述两个类的标注（如有）

# 清理 AgentSubmitDto 中的 InternalAgent 相关字段（需审查后处理）
```

---

### 步骤 2：Agent — 实现 MCP Client（`idagent`）

#### 2.1 目录结构

```
7controller/mcp/
├── requestContext.ts   ──── AsyncLocalStorage 上下文存储（ThreadLocal 等价）
├── mcpClient.ts       ──── MultiServerMCPClient 核心（initialize + 工具调用）
├── toolList.ts        ──── 工具清单类型定义 + 获取
└── index.ts          ──── 统一导出
```

#### 2.2 `requestContext.ts` — AsyncLocalStorage 上下文存储

Node.js 原生支持，无需安装任何依赖。

```typescript
// 7controller/mcp/requestContext.ts
// AsyncLocalStorage 是 Node.js 16+ 内置模块，等价于 Java 的 ThreadLocal
// 用于在异步调用链中存储当前请求的用户数据（userId + JWT）

import { AsyncLocalStorage } from 'async_hooks'

// ── 上下文类型定义 ──────────────────────────────────────────────────────────

export interface RequestContext {
  userId?: number
  token?: string      // 前端用户 JWT（透传到后端 X-User-Token）
  sessionId?: string
}

// ── 全局存储实例（进程级别单例）──────────────────────────────────────────────

export const requestContext = new AsyncLocalStorage<RequestContext>()

// ── 工具函数 ────────────────────────────────────────────────────────────────

/**
 * 获取当前请求的用户 ID
 * 任何异步调用链中都能访问，包括 fetch、then、async/await
 */
export function getCurrentUserId(): number | undefined {
  return requestContext.getStore()?.userId
}

/**
 * 获取当前请求的前端 JWT
 * 用于填入 MCP 请求头 X-User-Token
 */
export function getCurrentToken(): string | undefined {
  return requestContext.getStore()?.token
}

/**
 * 获取完整请求上下文
 */
export function getRequestContext(): RequestContext | undefined {
  return requestContext.getStore()
}

/**
 * 带上下文的异步执行包装器
 *
 * 用法（auth 中间件中）：
 *   requestContext.run({ userId, token }, () => next())
 *
 * 用法（其他模块中）：
 *   const userId = getCurrentUserId()  // 整个异步链内都有效
 */
export async function withContext<T>(
  context: RequestContext,
  fn: () => T
): Promise<Awaited<T>> {
  return requestContext.run(context, fn)
}
```

#### 2.3 `mcpClient.ts` — MCP Client 核心

使用 `@langchain/mcp-adapters` 的 `MultiServerMCPClient`，内部自动处理 initialize / tools/list / tools/call / ping 全流程。

**关键：token 从 `requestContext` 自动取，不作为参数层层透传。**

```typescript
// 7controller/mcp/mcpClient.ts
// MultiServerMCPClient 替代手写 jsonRpcCall，内部自动处理 MCP 全流程

import { MultiServerMCPClient } from '@langchain/mcp-adapters'
import type { Tool } from '@langchain/core/tools'
import { getCurrentToken } from './requestContext.js'
import type { GetScoreTemplatesResponse, GetUserInfoResponse, SubmitApplicationResponse } from '../../1common/types/shared.js'

// ── 类型定义 ────────────────────────────────────────────────────────────────

export interface McpToolResult<T = unknown> {
  success: boolean
  data?: T
  error?: string
}

// ── MCP Client 单例 ─────────────────────────────────────────────────────────

let _client: MultiServerMCPClient | null = null
let _initialized = false

/**
 * 获取 MCP Client 单例（延迟初始化）
 *
 * 内部自动完成：
 *   1. connect → initialize 握手
 *   2. tools/list 获取工具清单
 *   3. 注册 LangChain Tool（供 LangGraph 使用）
 *
 * Streamable-HTTP 传输，前端 JWT 通过 X-User-Token 透传到后端
 */
export async function getMcpClient(): Promise<MultiServerMCPClient> {
  if (_initialized && _client) return _client

  const MCP_SERVER_URL = process.env.MCP_SERVER_URL ?? 'http://localhost:8080/api/mcp'

  // 从 AsyncLocalStorage 取当前请求的前端 JWT
  // 此函数在 graph.invoke() 的异步调用链中被调用，
  // AsyncLocalStorage 保证了正确的请求上下文
  const userToken = getCurrentToken() ?? ''

  _client = new MultiServerMCPClient({
    throwOnLoadError: true,
    prefixToolNameWithServerName: false,
    onConnectionError: 'ignore',

    mcpServers: {
      idbackend: {
        transport: 'http',
        url: MCP_SERVER_URL,
        // 前端 JWT 透传到后端 McpAuthFilter 验证
        // 注意用 X-User-Token，不是 Authorization（MCP 协议占用 Authorization）
        headers: {
          'X-User-Token': `Bearer ${userToken}`,
        },
        reconnect: {
          enabled: true,
          maxAttempts: 3,
          delayMs: 2000,
        },
      },
    },
  })

  _initialized = true
  console.log('[mcp] MultiServerMCPClient 初始化完成')
  console.log(`[mcp]   连接到: ${MCP_SERVER_URL}`)

  return _client
}

/**
 * 获取所有 MCP 工具（LangChain Tool 格式）
 *
 * 这些工具直接注册到 LangGraph 的 Tool Registry，
 * LLM 能在推理时自动看到并决定调用哪些工具。
 *
 * 被 5graph/graph.ts 调用，将工具注册到 LangGraph
 */
export async function getMcpTools(): Promise<Tool[]> {
  const client = await getMcpClient()
  const tools = await client.getTools()
  console.log(`[mcp] 获取到 ${tools.length} 个工具`)
  return tools
}

/**
 * 手动调用指定工具（用于 Node 层显式调用）
 *
 * 场景：当 Node 需要精确控制调用时机时使用。
 * 如 submitNode 需要先 getUserInfo 再 submitApplication，有严格顺序。
 *
 * 内部调用 MultiServerMCPClient.callTool，自动走 tools/call 协议。
 * X-User-Token 已在 getMcpClient() 时填入（从 AsyncLocalStorage 取）。
 */
export async function callMcpTool<T = unknown>(
  toolName: string,
  args: Record<string, unknown> = {}
): Promise<McpToolResult<T>> {
  try {
    const client = await getMcpClient()
    const result = await client.callTool(toolName, args)

    // 解析结果：MCP 返回 content: [{ type: 'text', text: '...' }]
    const content = (result as any)?.content?.[0]
    if (!content || content.type !== 'text') {
      return { success: false, error: 'MCP 响应格式异常（期望 text 类型）' }
    }

    const parsed = JSON.parse(content.text)

    // 后端统一返回格式：{ code: 200, data: {...}, msg: 'success' }
    if (parsed && typeof parsed === 'object' && 'code' in parsed) {
      if (parsed.code === 200) {
        return { success: true, data: parsed.data as T }
      }
      return { success: false, error: parsed.msg ?? `code=${parsed.code}` }
    }

    // 工具直接返回裸数据（如 List 返回数组）
    return { success: true, data: parsed as T }

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error(`[mcp] callTool(${toolName}) 失败: ${msg}`)
    return { success: false, error: msg }
  }
}

// ── 工具一：getScoreTemplates ──────────────────────────────────────────────

/**
 * 通过 MCP 调用后端 getScoreTemplates 工具
 * 无需参数（模板列表是公开的）
 * 用于 analyzeMatchNode：LLM 匹配前先拉取模板数据
 */
export async function getScoreTemplatesTool(): Promise<McpToolResult<GetScoreTemplatesResponse>> {
  return callMcpTool<GetScoreTemplatesResponse>('getScoreTemplates', {})
}

// ── 工具二：getUserInfo ─────────────────────────────────────────────────────

/**
 * 通过 MCP 调用后端 getUserInfo 工具
 * 用于 submitNode：提交申请前获取用户身份
 *
 * 注意：userId 传参仅作参考，后端会从 JWT 强制取真正的 userId
 */
export async function getUserInfoTool(
  userId: number
): Promise<McpToolResult<{ userInfo: GetUserInfoResponse['userInfo'] }>> {
  return callMcpTool('getUserInfo', { userIdParam: userId })
}

// ── 工具三：submitApplication ───────────────────────────────────────────────

/**
 * 通过 MCP 调用后端 submitApplication 工具
 * 用于 submitNode：用户确认后提交加分申请
 *
 * 注意：userId 传参仅作参考，后端会从 JWT 强制取真正的 userId
 */
export async function submitApplicationTool(
  body: {
    templateName: string
    applyScore: number
    ruleId?: number
    remark?: string
    proofItems: Array<{ proofFileId: number; proofValue: number; remark?: string }>
  }
): Promise<McpToolResult<SubmitApplicationResponse>> {
  // 从 AsyncLocalStorage 取 userId（与 JWT 对应）
  const userId = (() => {
    const ctx = getRequestContext()
    return ctx?.userId ?? 0
  })()

  return callMcpTool<SubmitApplicationResponse>('submitApplication', {
    userIdParam: userId,   // 仅作参考，后端从 JWT 取
    ...body,
  })
}

/**
 * 关闭 MCP Client（服务停止时调用）
 */
export async function closeMcpClient(): Promise<void> {
  if (_client) {
    await _client.close()
    _client = null
    _initialized = false
    console.log('[mcp] MultiServerMCPClient 已关闭')
  }
}
```

#### 2.4 `toolList.ts` — 工具清单类型定义

```typescript
// 7controller/mcp/toolList.ts
// 工具清单的类型定义，供其他层引用
// 实际工具清单由 MultiServerMCPClient 在运行时动态获取，此处只定义类型

import type { McpToolResult } from './mcpClient.js'

export interface McpToolDefinition {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

/**
 * 获取当前 MCP Client 已注册的工具定义列表
 *
 * 用途：
 *   - 5graph/graph.ts 注册工具到 LangGraph Tool Registry
 *   - 调试时查看当前可用工具清单
 */
export async function listMcpTools(): Promise<McpToolDefinition[]> {
  const { getMcpTools } = await import('./mcpClient.js')
  const tools = await getMcpTools()

  return tools.map(tool => ({
    name: tool.name,
    description: tool.description ?? '',
    inputSchema: (tool as any).argsSchema ?? {},
  }))
}
```

#### 2.5 `index.ts` — 统一导出

```typescript
// 7controller/mcp/index.ts
// 统一导出，供其他层引用

// 上下文存储（ThreadLocal 等价）
export { requestContext, getCurrentUserId, getCurrentToken, getRequestContext, withContext } from './requestContext.js'

// Client 核心
export { getMcpClient, getMcpTools, callMcpTool, closeMcpClient } from './mcpClient.js'

// 工具封装（Node 直接调用）
export {
  getScoreTemplatesTool,
  getUserInfoTool,
  submitApplicationTool,
} from './mcpClient.js'

// 类型
export type { McpToolResult } from './mcpClient.js'
export type { McpToolDefinition } from './toolList.js'
export type { RequestContext } from './requestContext.js'
```

---

### 步骤 3：Agent — 将 MCP 工具注册到 LangGraph（`5graph/graph.ts`）

```typescript
// 5graph/graph.ts — 新增 MCP 工具注册

import { StateGraph, START, END } from '@langchain/langgraph'
import { SqliteSaver } from '@langchain/langgraph-checkpoint-sqlite'
import { MainStateAnnotation, ApplyStateAnnotation, ConsultStateAnnotation } from '../3state/index.js'
import { CHECKPOINT_PATH } from '../1common/config.js'
import { createChatModel } from '../2model/model.js'
import { getMcpTools } from '../7controller/mcp/index.js'

// 主图节点
import { classifyNode, askForMoreNode } from '../4node/classify/index.js'
// consult 子图节点
import { retrieveNode, answerNode } from '../4node/consult/index.js'
// apply 子图节点
import {
  fetchPolicyNode,
  analyzeMatchNode,
  summarizeNode,
  confirmRoute,
  confirmNode,
  submitNode,
} from '../4node/apply/index.js'

// ─────────────────────────────────────────────────────────────────
// 懒加载编译（模块级缓存，只在首次调用时编译一次）
// ─────────────────────────────────────────────────────────────────

let _compiled: any = null

export async function getCompiledGraph() {
  if (!_compiled) {
    // ── 咨询子图 ─────────────────────────────────────────
    const consultSubgraph = new StateGraph(ConsultStateAnnotation)
      .addNode('retrieve', retrieveNode)
      .addNode('answer',   answerNode)
      .addEdge(START, 'retrieve')
      .addEdge('retrieve', 'answer')
      .addEdge('answer', END)
      .compile()

    // ── 申请子图 ─────────────────────────────────────────
    const applySubgraph = new StateGraph(ApplyStateAnnotation)
      .addNode('fetchPolicy',     fetchPolicyNode)
      .addNode('analyzeAndMatch', (state, config: any) => analyzeMatchNode(state, config))
      .addNode('summarize',       summarizeNode)
      .addNode('confirm',         confirmNode)
      .addNode('submit',          (state, config: any) => submitNode(state, config))
      .addEdge(START, 'fetchPolicy')
      .addEdge('fetchPolicy', 'analyzeAndMatch')
      .addEdge('analyzeAndMatch', 'summarize')
      .addConditionalEdges('summarize', confirmRoute, { confirm: 'confirm', end: END })
      .addEdge('confirm', 'submit')
      .addEdge('submit', END)
      .compile()

    // ── 主图 ─────────────────────────────────────────────
    const checkpointer = SqliteSaver.fromConnString(CHECKPOINT_PATH)

    // 关键：MCP 工具在 Graph 编译时绑定到 LLM
    // 这样 LLM 在推理时能"看到"这些工具，自主决定调用
    let mcpTools: any[] = []
    try {
      mcpTools = await getMcpTools()
      console.log(`[graph] MCP 工具注册到 LangGraph: ${mcpTools.length} 个`)
    } catch (e) {
      console.warn(`[graph] MCP 工具加载失败，继续编译（工具调用可能不可用）: ${e instanceof Error ? e.message : String(e)}`)
    }

    // LLM 绑定 MCP 工具（核心：tools 参数）
    const llmWithMcpTools = createChatModel(0.3).bindTools(mcpTools)

    const mainGraph = new StateGraph(MainStateAnnotation)
      .addNode('classify', (state, config) => classifyNode(state, config, llmWithMcpTools))
      .addNode('ask',      (state, config) => askForMoreNode(state, config, llmWithMcpTools))
      .addNode('applyGraph',   applySubgraph)
      .addNode('consultGraph', consultSubgraph)
      .addEdge(START, 'classify')
      .addConditionalEdges('classify', (s) => s.intent, {
        insufficient: 'ask',
        apply:        'applyGraph',
        consult:      'consultGraph',
      })
      .addEdge('ask', 'classify')
      .addEdge('applyGraph',   END)
      .addEdge('consultGraph', END)
      .compile({ checkpointer })

    _compiled = mainGraph
  }
  return _compiled
}
```

---

### 步骤 4：Agent — 修改 Node 层调用方式

#### 4.1 修改 `analyzeMatchNode.ts`

```typescript
// 旧（自定义 HTTP，需要 userToken 参数层层透传）
import { getScoreTemplatesMcp } from '../../../7controller/mcp/index.js'
const result = await getScoreTemplatesMcp(userToken)

// 新（MCP SDK，AsyncLocalStorage 自动取 token）
import { getScoreTemplatesTool } from '../../../7controller/mcp/index.js'
const result = await getScoreTemplatesTool()   // 无需参数，token 从 AsyncLocalStorage 取
```

#### 4.2 修改 `submitNode.ts`

```typescript
// 旧（自定义 HTTP，userToken 层层透传）
import { getUserInfoMcp, submitApplicationMcp } from '../../../7controller/mcp/index.js'
const infoResult = await getUserInfoMcp(Number(userId), userToken)
const submitResult = await submitApplicationMcp(submitBody, userToken)

// 新（MCP SDK，userId 从 AsyncLocalStorage 取）
import { getUserInfoTool, submitApplicationTool } from '../../../7controller/mcp/index.js'
const infoResult = await getUserInfoTool(Number(userId))   // userId 仅作参考
const submitResult = await submitApplicationTool(submitBody) // userId 从 AsyncLocalStorage 取
```

#### 4.3 修改 `KnowledgeService.ts`

```typescript
// 旧
export async function analyzeCertificate(file, templates, userToken?: string) {
  if (effectiveTemplates.length === 0 && userToken) {
    const result = await getScoreTemplatesMcp(userToken)
  }
}

// 新：删除 userToken 参数，直接用 MCP
export async function analyzeCertificate(file, templates) {
  if (effectiveTemplates.length === 0) {
    const result = await getScoreTemplatesTool()   // token 从 AsyncLocalStorage 取
  }
}
```

---

### 步骤 5：Agent — `main.ts` 初始化 + `authMiddleware` 改造

#### 5.1 修改 `authMiddleware.ts` — 注入 AsyncLocalStorage 上下文

```typescript
// 7controller/middleware/auth.ts
// 修改 verifyJWT 后的处理逻辑：将 userId + token 存入 AsyncLocalStorage

import { requestContext } from '../1common/context/requestContext.js'

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization ?? ''

  if (!authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing Authorization header' })
    return
  }

  const token = authHeader.slice(7)
  try {
    const payload = verifyJWT(token)

    // 将当前请求的上下文存入 AsyncLocalStorage
    // 整个异步调用链（Controller → AgentService → Node → mcpClient）都能通过
    // getCurrentUserId() / getCurrentToken() 访问到此上下文
    requestContext.run(
      {
        userId:    payload.userId,
        token,
        sessionId: req.body?.sessionId,
      },
      () => next()    // ← next() 必须在 run() 回调内调用
    )

  } catch (e) {
    res.status(401).json({ error: 'Invalid or expired token' })
  }
}
```

#### 5.2 `main.ts` — 启动入口

```typescript
// main.ts — 启动入口

import 'dotenv/config'
import { createApp } from './7controller/index.js'
import { getMcpClient } from './7controller/mcp/index.js'
import { closeMcpClient } from './7controller/mcp/index.js'

const PORT = Number(process.env.PORT ?? 3001)

async function bootstrap() {
  // ── MCP Client 预热 ─────────────────────────────────────────
  // 注意：此时没有请求上下文（无前端 JWT），仅做连接测试
  // 实际请求的 JWT 在每个 HTTP 请求的 authMiddleware 中通过 AsyncLocalStorage 注入

  const MCP_SERVER_URL = process.env.MCP_SERVER_URL ?? 'http://localhost:8080/api/mcp'

  try {
    // 预热：不带 token 的连接，测试后端是否可达
    // 实际工具调用时会重新带上前端 JWT
    await getMcpClient()
    console.log(`[mcp] ✓ 预热成功，连接到 ${MCP_SERVER_URL}`)
  } catch (e) {
    console.warn('[mcp] ⚠ MCP 预热失败，工具调用可能不可用:', e instanceof Error ? e.message : String(e))
    // Agent 继续启动，MCP 工具不可用时 Node 层有降级逻辑
  }

  const app = createApp()

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[agent] 运行中 → http://0.0.0.0:${PORT}`)
  })
}

// ── 优雅关闭 ──────────────────────────────────────────────────
process.on('SIGINT', async () => {
  await closeMcpClient()
  process.exit(0)
})

bootstrap()
```

---

## 五、MCP 四阶段与模块的对应关系

### 5.1 四阶段在各模块的分布

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         MCP 四阶段与 Agent 模块对应                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  main.ts（服务启动，一次性）                                                 │
│    └─ getMcpClient()（预热，不带 token）                                     │
│         ├─ 阶段一：initialize（MultiServerMCPClient.connect() 自动完成）      │
│         └─ 阶段二：tools/list（MultiServerMCPClient.getTools() 自动完成）    │
│                                                                             │
│  authMiddleware（每个 HTTP 请求）                                            │
│    └─ requestContext.run({ userId, token }, () => next())                   │
│         ↓                                                                   │
│         整个请求的异步调用链共享同一上下文                                     │
│                                                                             │
│  5graph/graph.ts（Graph 编译时，一次性）                                      │
│    └─ getMcpTools() → LLM.bindTools(tools)                                   │
│         └─ 阶段二：tools/list 结果注册到 LangGraph Tool Registry               │
│                                                                             │
│  4node/（每次 Node 执行时）                                                 │
│    ├─ analyzeMatchNode → getScoreTemplatesTool()                             │
│    │                     └─ 阶段三：tools/call（X-User-Token 来自 AsyncLocalStorage）
│    ├─ submitNode       → getUserInfoTool() + submitApplicationTool()         │
│    │                     └─ 阶段三：tools/call                               │
│    └─ LLM 推理        → tools/call（LLM 自主决定，工具自动被调用）           │
│                                                                             │
│  MultiServerMCPClient 内部（自动，无需手动处理）                              │
│    └─ 阶段四：ping + 重连（reconnect: { enabled: true }）                   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 各模块职责定位

```
src/
├── 1common/
│   ├── config.ts         ──── MCP_SERVER_URL 环境变量
│   ├── types/shared.ts   ──── MCP 工具的 TypeScript 类型
│   └── utils/jwt.ts      ──── JWT 验证逻辑（供 authMiddleware 使用）
│
├── 2model/
│   └── model.ts          ──── LLM 工厂
│                              └─ .bindTools(mcpTools) 绑定 MCP 工具
│                                  ↓
│                                  LLM 能"看见"工具，自动决定是否调用
│
├── 3state/
│   └── index.ts          ──── 状态定义（templates 字段存 MCP 返回数据）
│
├── 4node/
│   └── apply/
│       ├── analyzeMatchNode.ts   ── 阶段三：tools/call
│       │                           └─ getScoreTemplatesTool()（无需参数）
│       └── submitNode.ts          ── 阶段三：tools/call
│                                   └─ getUserInfoTool() + submitApplicationTool()
│                                       （userId 从 AsyncLocalStorage 取）
│
├── 5graph/
│   └── graph.ts          ──── LangGraph 编排
│                              └─ getMcpTools() → bindTools() 注册到 LLM
│
├── 6service/
│   └── AgentService.ts   ──── Agent 入口（invokeAgent）
│                              └─ 无需透传 userToken
│
└── 7controller/
    ├── middleware/
    │   └── auth.ts        ──── 验证 JWT → 存入 AsyncLocalStorage
    └── mcp/
        ├── requestContext.ts ── AsyncLocalStorage 上下文（ThreadLocal 等价）
        ├── mcpClient.ts     ── MultiServerMCPClient 核心
        │   ├── getMcpClient()       ── 初始化（X-User-Token 从 requestContext 取）
        │   ├── getMcpTools()         ── 获取工具清单（阶段二）
        │   ├── callMcpTool()         ── 手动调用工具（阶段三）
        │   └── getScoreTemplatesTool / getUserInfoTool / submitApplicationTool()
        ├── toolList.ts     ── 工具清单类型定义
        └── index.ts        ── 统一导出
```

---

## 六、整体迁移路径（建议执行顺序）

```
第一阶段：清理废弃代码（不影响功能）
├── 删除 InternalAgentController.java
├── 删除 McpToolsController.java（HTTP 旧版 MCP）
├── 删除 INTERNAL_TOKEN 环境变量
├── 清理 PublicAccess 注解中对上述两个类的标注（如有）
├── 验证无其他调用方
└── 确认删除后 Agent → 后端流程仍正常

第二阶段：新增后端 MCP Server（Spring AI）
├── 新增 spring-ai-starter-mcp-server-webmvc 依赖
├── 新增 application.yml MCP 配置
├── 新增 McpToolsService.java（@McpTool 注解）
├── 修改 AuthInterceptor.java（读取 X-User-Token 请求头）
└── 验证：后端 /api/mcp 端点可达

第三阶段：新增 Agent MCP Client（@langchain/mcp-adapters）
├── 新增 requestContext.ts（AsyncLocalStorage）
├── 新增 mcpClient.ts（MultiServerMCPClient）
├── 新增 toolList.ts
├── 修改 authMiddleware.ts（注入 AsyncLocalStorage）
├── 修改 main.ts（预热 MCP Client）
├── 修改 5graph/graph.ts（注册 MCP 工具到 LangGraph）
└── 验证：Agent 能连接到后端 MCP Server

第四阶段：修改 Node 层调用方式
├── 修改 analyzeMatchNode.ts（用 getScoreTemplatesTool）
├── 修改 submitNode.ts（用 getUserInfoTool / submitApplicationTool）
├── 修改 KnowledgeService.ts（删除 userToken 参数）
└── 验证：端到端工具调用正常

第五阶段：生产部署
├── 配置 MCP_SERVER_URL 环境变量
├── 确认 JWT_SECRET 在 Agent 和后端保持一致
└── 监控 MCP 连接健康状态
```

---

## 七、面试可阐述的改进点

### JWT 清理（AsyncLocalStorage）后

> 前端直连 Agent 后，Agent 到后端的工具调用不再需要层层透传 userToken。我们在 Node.js 端用 `AsyncLocalStorage`（等价于 Java 的 `ThreadLocal`）存储当前请求的 JWT，Node 层和 MCP Client 随时通过 `getCurrentToken()` 取用，无需在函数参数中层层传递。后端 MCP Server 从请求头 `X-User-Token` 解析 JWT，通过复用现有的 `AuthInterceptor` + `UserContext`（ThreadLocal）体系自动注入用户上下文，工具方法直接调用 `UserContext.getUserId()`，忽略参数中传入的任何 `userId`，从根本上消除越权风险。

### MCP SDK 改造后

> Agent 与后端通过标准 MCP（Model Context Protocol）协议通信。Agent 作为 MCP Host，后端作为 MCP Server，三个业务工具以 `@McpTool` 注解声明，Spring AI 自动生成 JSON Schema。传输层使用 Streamable-HTTP（Agent 端 `@langchain/mcp-adapters` 的 `MultiServerMCPClient`，后端 `spring-ai-starter-mcp-server-webmvc`）。
>
> `MultiServerMCPClient` 内部自动处理 initialize / tools/list / tools/call / ping 全流程，并内置重连机制。工具在 Graph 编译时绑定到 LLM，LLM 在推理时能自动看到并决定调用哪些工具。

---

## 八、参考文件索引

| 文件 | 当前状态 | 改动后 |
|---|---|---|
| `idbackend/.../controller/businessController/InternalAgentController.java` | ServiceKey 旧版 | **删除** |
| `idbackend/.../controller/mcp/McpToolsController.java` | 旧版 HTTP MCP | **删除** |
| `idbackend/.../pom.xml` | 无 MCP 依赖 | 新增 `spring-ai-starter-mcp-server-webmvc` |
| `idbackend/.../mcp/McpToolsService.java` | **新增** | `@McpTool` 注解声明三个工具，userId 从 `UserContext` 自取 |
| `idbackend/.../application.yml` | 无 MCP 配置 | 新增 `spring.ai.mcp.server` 配置段 |
| `idbackend/.../config/intercept/AuthInterceptor.java` | 已存在 | **小改**：读取 `X-User-Token` 请求头（兼容 MCP） |
| `idbackend/.../context/UserContext.java` | 已存在 | **复用**，无需修改 |
| `idagent/.../7controller/mcp/requestContext.ts` | **新增** | `AsyncLocalStorage` 上下文存储（ThreadLocal 等价） |
| `idagent/.../7controller/mcp/mcpClient.ts` | 自定义 HTTP | 改为 `MultiServerMCPClient`，`X-User-Token` 透传 |
| `idagent/.../7controller/mcp/toolList.ts` | **新增** | 工具清单类型定义 |
| `idagent/.../7controller/mcp/index.ts` | 导出旧接口 | 改为导出 `requestContext` + `MultiServerMCPClient` 相关接口 |
| `idagent/.../7controller/middleware/auth.ts` | 直接验证 JWT | 改为存入 `AsyncLocalStorage`（`requestContext.run()`） |
| `idagent/.../5graph/graph.ts` | 无 MCP 工具绑定 | 新增 `getMcpTools()` + `bindTools()` |
| `idagent/.../4node/apply/nodes/analyzeMatchNode.ts` | `getScoreTemplatesMcp(userToken)` | `getScoreTemplatesTool()` |
| `idagent/.../4node/apply/nodes/submitNode.ts` | `getUserInfoMcp(id, token)` + `submitApplicationMcp(body, token)` | `getUserInfoTool(id)` + `submitApplicationTool(body)` |
| `idagent/.../6service/KnowledgeService.ts` | `userToken` 参数 | 删除参数 |
| `idagent/.env` | `INTERNAL_TOKEN` + `BACKEND_URL` | 删除，新增 `MCP_SERVER_URL` |
| `idfrontend/src/api/agent.ts` | Bearer JWT 透传 | **无需改动** |
| `idfrontend-admin/src/api/agent.ts` | 同上 | **无需改动** |
