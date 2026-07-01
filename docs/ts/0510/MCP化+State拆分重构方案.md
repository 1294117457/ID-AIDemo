# MCP 化 + State 拆分重构方案

> 日期：2026-05-10（第三次修订）
> 涉及工程：idagent、idbackend
> 目标：
> 1. Agent 通过 MCP 主动调用后端获取 templates 和 userInfo，不再被动注入
> 2. Agent 继承前端 JWT Token，后端统一验证
> 3. 解耦 LangGraph State，拆分为 MainState / ConsultState / ApplyState，删除冗余字段
> 4. 拆分 `src/4node/` 目录，每类节点独立文件
>
> **本方案暂不涉及前端直连 Agent**，保持现有后端转发架构不变。
> **不直连 MySQL**，所有数据访问统一经后端 MCP 接口。

---

## 一、现状与目标

### 1.1 当前问题一览

| 问题 | 说明 |
|---|---|
| **数据被动注入** | templates 和 userInfo 由后端查询后通过请求参数注入，Agent 无法独立工作 |
| **鉴权用共享密钥** | Agent → 后端用固定 `INTERNAL_SERVICE_KEY`，无用户身份，userId 可伪造 |
| **applyNodes.ts 臃肿** | 一个文件 186 行含 6 个函数（3 个 node、1 个 router、2 个工具），职责混乱 |
| **State 字段堆叠** | MainState 包含主图 + apply + consult 三套字段，归属不清 |
| **answerDraft 冗余** | 仅被 answerNode 写入，从未被任何节点读取 |
| **userInfo 存 State** | 只有 submitNode 需要，却贯穿整个图生命周期 |

### 1.2 目标文件结构

```
src/
├── 4node/
│   ├── classifyNodes.ts          ← 主图节点（classifyNode / askForMoreNode）
│   ├── consultNodes.ts           ← consult 子图节点（retrieveNode / answerNode）
│   └── apply/                   ← apply 子图节点（拆分）
│       ├── index.ts              ← 统一导出
│       └── nodes/
│           ├── fetchPolicyNode.ts     ← fetchPolicyNode（1 个文件）
│           ├── analyzeMatchNode.ts    ← analyzeAndMatchNode（1 个文件）
│           ├── summarizeNode.ts       ← summarizeNode（1 个文件）
│           ├── confirmNode.ts         ← confirmRoute + confirmNode（1 个文件）
│           └── submitNode.ts          ← submitNode（1 个文件）
├── 7mcp/
│   ├── index.ts                  ← 统一导出
│   ├── mcpClient.ts              ← MCP 客户端（JWT 鉴权，不直连 MySQL）
│   └── types.ts                  ← MCP 类型定义
└── 3state/
    └── state.ts                  ← MainState / ApplyState / ConsultState

idbackend/
└── controller/
    └── mcp/
        └── McpToolsController.java   ← MCP 工具服务端（JWT 鉴权）
```

---

## 二、后端 MCP 服务端（idbackend）

### 2.1 鉴权方式

- **不使用 ServiceKey**，走标准 Spring Security JWT 验证
- Agent 的请求带 `Authorization: Bearer <前端JWT>`
- `McpToolsController` 依赖 Spring 的 JWT Filter 自动解析，`UserContext.getUserId()` 可用
- `get_user_info` 和 `submit_application` 强制用 JWT 中的真实 userId 覆盖请求参数，防止伪造

### 2.2 新增 Controller

路径：`idbackend/src/main/java/com/zch/idbackend/controller/mcp/McpToolsController.java`

```java
package com.zch.idbackend.controller.mcp;

import com.zch.idbackend.controller.dto.ResultVo;
import com.zch.idbackend.context.UserContext;
import com.zch.idbackend.mapper.businessMapper.TemplateMapper;
import com.zch.idbackend.mapper.functionMapper.UserMapper;
import com.zch.idbackend.mapper.po.UserPO;
import com.zch.idbackend.mapper.po.score.ScoreTemplatePO;
import com.zch.idbackend.service.businessService.ApplicationService;
import com.zch.idbackend.service.businessService.RuleService;
import com.zch.idbackend.controller.dto.score.AgentSubmitDto;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * MCP 工具服务端
 * 路径前缀：/internal/mcp/tools
 * 鉴权：标准 JWT Token（前端 JWT 继承，Security Filter 自动验证）
 * 不使用 ServiceKey
 */
@Slf4j
@RestController
@RequestMapping("/internal/mcp/tools")
@RequiredArgsConstructor
public class McpToolsController {

    private final TemplateMapper templateMapper;
    private final RuleService ruleService;
    private final UserMapper userMapper;
    private final ApplicationService applicationService;

    // ── 工具一：获取加分模板列表 ────────────────────────────────────────

    /**
     * GET /internal/mcp/tools/get_score_templates
     * 返回所有激活的加分模板（含 rules）
     * 鉴权：任何已登录用户均可调用（模板数据本身是公开的）
     */
    @GetMapping("/get_score_templates")
    public ResultVo getScoreTemplates() {
        List<ScoreTemplatePO> pos = templateMapper.findAllActive();
        List<Map<String, Object>> templates = pos.stream().map(t -> {
            Map<String, Object> m = new HashMap<>();
            m.put("id", t.getId());
            m.put("templateName", t.getTemplateName());
            m.put("templateType", t.getTemplateType());
            m.put("scoreType", t.getScoreType());
            m.put("templateMaxScore", t.getTemplateMaxScore());
            m.put("reviewCount", t.getReviewCount());
            m.put("description", t.getDescription());
            m.put("rules", ruleService.getRuleDetailsByTemplateId(t.getId()));
            return m;
        }).collect(Collectors.toList());

        return ResultVo.success(Map.of("templates", templates));
    }

    // ── 工具二：获取用户信息 ───────────────────────────────────────────

    /**
     * GET /internal/mcp/tools/get_user_info?userId={userId}
     * 返回指定用户的基本信息
     * 安全：JWT 中的 userId 必须与请求参数一致，防止跨用户查询
     */
    @GetMapping("/get_user_info")
    public ResultVo getUserInfo(@RequestParam Integer userId) {
        Integer currentUserId = UserContext.getUserId();
        if (currentUserId == null) {
            return ResultVo.error(401, "未登录");
        }
        if (!currentUserId.equals(userId)) {
            log.warn("[MCP] get_user_info: userId 不匹配，JWT={}, 请求参数={}", currentUserId, userId);
            return ResultVo.error(403, "无权访问其他用户信息");
        }

        UserPO user = userMapper.selectById(userId);
        if (user == null) {
            return ResultVo.error(404, "用户不存在");
        }

        String username = user.getUsername() != null ? user.getUsername() : "";
        String studentId = username.contains("@") ? username.split("@")[0] : username;

        Map<String, Object> userInfo = new HashMap<>();
        userInfo.put("userId", currentUserId);
        userInfo.put("studentId", studentId);
        userInfo.put("studentName", user.getFullName() != null ? user.getFullName() : "");
        userInfo.put("major", user.getMajor() != null ? user.getMajor() : "");
        userInfo.put("enrollmentYear", user.getGrade() != null ? user.getGrade() : 0);

        return ResultVo.success(Map.of("userInfo", userInfo));
    }

    // ── 工具三：提交加分申请 ───────────────────────────────────────────

    /**
     * POST /internal/mcp/tools/submit_application
     * 将加分申请写入数据库
     * 安全：强制使用 JWT 中的真实 userId 覆盖 dto.userId，防止伪造
     */
    @PostMapping("/submit_application")
    public ResultVo submitApplication(@RequestBody AgentSubmitDto dto) {
        Integer currentUserId = UserContext.getUserId();
        if (currentUserId == null) {
            return ResultVo.error(401, "未登录");
        }

        // 强制覆盖：用 JWT 中的真实身份替换 dto 中的值
        if (!currentUserId.equals(dto.getUserId())) {
            log.warn("[MCP] submit_application: userId 不匹配，JWT={}, dto={}，强制覆盖",
                    currentUserId, dto.getUserId());
        }
        dto.setUserId(currentUserId);

        log.info("[MCP] submit_application, userId={}, templateName={}",
                dto.getUserId(), dto.getTemplateName());

        return applicationService.submitFromAgent(dto);
    }
}
```

### 2.3 后端转发 JWT 到 Agent

`AICHatController` 在转发请求到 Agent 时，将前端 JWT 放到 header 中：

```java
// AICHatController.java — stream() / chat() 方法

// 从前端请求中获取原始 JWT Token
String userToken = request.getHeader("Authorization");

// 转发给 Agent 时通过 X-Forwarded-User-Token 传递
// 后端原有的 loadTemplatesJson() / buildUserInfoJson() 调用可以删除或保留（不影响）
// Agent 不再依赖这些注入数据，而是通过 MCP 主动拉取

MultiValueMap<String, Object> parts = new LinkedMultiValueMap<>();
parts.add("message", message.trim());
parts.add("sessionId", sessionId != null ? sessionId : "");
parts.add("userId", userId != null ? userId.toString() : "");
// templates 和 userInfo 不再注入，Agent 通过 MCP 获取
parts.add("userToken", userToken != null ? userToken : "");  // ← 透传前端 JWT

// 调用 aichatService.agentStream 时传入 userToken
aichatService.agentStream(..., userToken);
```

> 注：`AICHatController` 中原有的 `loadTemplatesJson()` 和 `buildUserInfoJson()` 方法可以直接删除（这两个方法现在已经没有调用方了）。

---

## 三、Agent MCP 客户端（idagent）

### 3.1 类型定义

路径：`src/7mcp/types.ts`

```typescript
// ─── Layer 7: MCP — 类型定义 ───────────────────────────────────────────────

export interface ScoreTemplate {
  id:               number
  templateName:     string
  templateType:     string
  scoreType:        number
  templateMaxScore?: number
  reviewCount?:     number
  description?:     string
  rules: Array<{
    id:        number
    ruleName:  string
    ruleScore: number
  }>
}

export interface UserInfo {
  userId:         number
  studentId:      string
  studentName:    string
  major:          string
  enrollmentYear: number
}

export interface McpToolResult<T = any> {
  success: boolean
  data?: T
  error?: string
}

export interface GetScoreTemplatesResponse {
  templates: ScoreTemplate[]
}

export interface GetUserInfoResponse {
  userInfo: UserInfo
}

export interface SubmitApplicationResponse {
  applicationId: string
}
```

### 3.2 MCP 客户端

路径：`src/7mcp/mcpClient.ts`

- 所有调用带 `Authorization: Bearer <userToken>`（前端 JWT 继承）
- 不存 ServiceKey，不直连 MySQL

```typescript
// ─── Layer 7: MCP — Agent → 后端工具调用 ─────────────────────────────────
// 鉴权：继承前端 JWT Token，透传到后端统一验证
// 数据：不直连 MySQL，所有数据经后端 MCP 接口

import { BACKEND_URL } from '../1config/config.js'
import type {
  ScoreTemplate,
  UserInfo,
  McpToolResult,
  GetScoreTemplatesResponse,
  GetUserInfoResponse,
  SubmitApplicationResponse,
} from './types.js'

// ── HTTP 基础 ─────────────────────────────────────────────────────────────

/**
 * 统一 MCP 调用方法
 * @param path    API 路径
 * @param options fetch 选项 + userToken（前端 JWT）
 */
async function mcpFetch<T>(
  path: string,
  options: RequestInit & { userToken: string }
): Promise<McpToolResult<T>> {
  const { userToken, ...fetchOptions } = options

  try {
    const resp = await fetch(`${BACKEND_URL}${path}`, {
      ...fetchOptions,
      headers: {
        'Authorization': userToken,
        'Content-Type': 'application/json',
        ...fetchOptions.headers,
      },
    })

    if (!resp.ok) {
      return { success: false, error: `HTTP ${resp.status}` }
    }

    const json = await resp.json() as any
    if (json.code === 200) {
      return { success: true, data: json.data as T }
    }
    return { success: false, error: json.msg ?? '未知错误' }
  } catch (e) {
    return { success: false, error: String(e) }
  }
}

// ── 工具调用 ───────────────────────────────────────────────────────────────

/**
 * 获取加分模板列表
 * 被 analyzeMatchNode 调用
 */
export async function getScoreTemplatesMcp(
  userToken: string
): Promise<McpToolResult<GetScoreTemplatesResponse>> {
  return mcpFetch<GetScoreTemplatesResponse>(
    '/internal/mcp/tools/get_score_templates',
    { userToken, method: 'GET' }
  )
}

/**
 * 获取用户信息
 * 被 submitNode 调用
 */
export async function getUserInfoMcp(
  userId: number,
  userToken: string
): Promise<McpToolResult<GetUserInfoResponse>> {
  return mcpFetch<GetUserInfoResponse>(
    `/internal/mcp/tools/get_user_info?userId=${userId}`,
    { userToken, method: 'GET' }
  )
}

/**
 * 提交加分申请
 * 被 submitNode 调用
 */
export async function submitApplicationMcp(
  submitBody: Record<string, any>,
  userToken: string
): Promise<McpToolResult<SubmitApplicationResponse>> {
  return mcpFetch<SubmitApplicationResponse>(
    '/internal/mcp/tools/submit_application',
    {
      userToken,
      method: 'POST',
      body: JSON.stringify(submitBody),
    }
  )
}
```

### 3.3 统一导出

路径：`src/7mcp/index.ts`

```typescript
// ─── Layer 7: MCP — 统一导出 ─────────────────────────────────────────────

export { getScoreTemplatesMcp, getUserInfoMcp, submitApplicationMcp } from './mcpClient.js'
export type {
  ScoreTemplate,
  UserInfo,
  McpToolResult,
  GetScoreTemplatesResponse,
  GetUserInfoResponse,
  SubmitApplicationResponse,
} from './types.js'
```

### 3.4 config 新增

```typescript
// src/1config/config.ts 新增
export const BACKEND_URL = process.env.JAVA_BACKEND_URL ?? 'http://localhost:8080'
```

`.env` 无需新增，`JAVA_BACKEND_URL` 已存在，`INTERNAL_SERVICE_KEY` 直接删除。

---

## 四、State 类型拆分（idagent）

### 4.1 拆分结果

```typescript
// ─── Layer 3: State — 解耦后的 State 类型 ─────────────────────────────────

import { MessagesAnnotation, Annotation } from '@langchain/langgraph'

// ── 类型定义（与 MCP types.ts 保持一致）───────────────────────────────────

export interface TemplateRule {
  id:           number
  ruleName:     string
  ruleScore:    number
  description?: string
}

export interface ScoreTemplate {
  id:               number
  templateName:     string
  templateType:     string
  scoreType:        number
  templateMaxScore?: number
  reviewCount?:     number
  description?:     string
  rules:            TemplateRule[]
}

export interface UserInfo {
  userId:         number
  studentId:      string
  studentName:    string
  major:          string
  enrollmentYear: number
}

// ── MainState — 主图控制 ─────────────────────────────────────────────────

export const MainState = Annotation.Root({
  ...MessagesAnnotation.spec,

  intent: Annotation<'consult' | 'apply' | 'insufficient'>({
    reducer: (_, x) => x,
    default: () => 'consult' as const,
  }),

  forcedIntent: Annotation<'consult' | 'apply' | null>({
    reducer: (_, x) => x,
    default: () => null,
  }),

  missingInfo: Annotation<string[]>({
    reducer: (_, x) => x,
    default: () => [] as string[],
  }),
})

export type MainStateType = typeof MainState.State

// ── ApplyState — apply 子图 ──────────────────────────────────────────────

export const ApplyState = Annotation.Root({
  ...MessagesAnnotation.spec,

  // 主图透传
  intent:       Annotation<'consult' | 'apply' | 'insufficient'>({ reducer: (_, x) => x, default: () => 'apply' as const }),
  forcedIntent: Annotation<'consult' | 'apply' | null>({ reducer: (_, x) => x, default: () => null }),
  missingInfo:  Annotation<string[]>({ reducer: (_, x) => x, default: () => [] as string[] }),

  // apply 专用
  documentText:  Annotation<string>({ reducer: (_, x) => x, default: () => '' }),
  templates:     Annotation<ScoreTemplate[]>({ reducer: (_, x) => x, default: () => [] as ScoreTemplate[] }),
  policyContext: Annotation<string>({ reducer: (_, x) => x, default: () => '' }),
  checkResults:  Annotation<string[]>({ reducer: (_, x) => x, default: () => [] as string[] }),
  // userInfo 已删除：改为 MCP 按需拉取，不存入 State
})

export type ApplyStateType = typeof ApplyState.State

// ── ConsultState — consult 子图 ─────────────────────────────────────────

export const ConsultState = Annotation.Root({
  ...MessagesAnnotation.spec,

  // 主图透传
  intent:       Annotation<'consult' | 'apply' | 'insufficient'>({ reducer: (_, x) => x, default: () => 'consult' as const }),
  forcedIntent: Annotation<'consult' | 'apply' | null>({ reducer: (_, x) => x, default: () => null }),
  missingInfo:  Annotation<string[]>({ reducer: (_, x) => x, default: () => [] as string[] }),

  // consult 专用
  retrievedContext: Annotation<string>({ reducer: (_, x) => x, default: () => '' }),
  // answerDraft 已删除：从未被读取，冗余字段
})

export type ConsultStateType = typeof ConsultState.State
```

### 4.2 变更对照

| 字段 | 归属 | 变更 |
|---|---|---|
| `messages` | 全部 | 保留 |
| `intent` / `forcedIntent` / `missingInfo` | 主图/apply/consult | 保留 |
| `documentText` | apply | 保留 |
| `templates` | apply | 保留（MCP 拉取） |
| `policyContext` | apply | 保留 |
| `checkResults` | apply | 保留 |
| `userInfo` | ~~apply~~ | **删除**：MCP 按需拉取，不存 State |
| `retrievedContext` | consult | 保留 |
| `answerDraft` | ~~consult~~ | **删除**：冗余 |

---

## 五、Node 改造（idagent）

### 5.1 apply 子图节点拆分

```
src/4node/apply/
├── index.ts
└── nodes/
    ├── fetchPolicyNode.ts     ← fetchPolicyNode
    ├── analyzeMatchNode.ts    ← analyzeAndMatchNode
    ├── summarizeNode.ts       ← summarizeNode
    ├── confirmNode.ts         ← confirmRoute + confirmNode
    └── submitNode.ts          ← submitNode
```

#### `fetchPolicyNode.ts` — 检索政策

```typescript
// ─── fetchPolicyNode — RAG 检索加分政策 ─────────────────────────────────
// 归属：apply 子图
// 输入：state.documentText
// 输出：state.policyContext

import type { ApplyStateType } from '../../../3state/state.js'
import { searchKnowledge } from '../../../rag/index.js'

export async function fetchPolicyNode(
  state: ApplyStateType
): Promise<Partial<ApplyStateType>> {
  console.log('--apply:fetchPolicy')
  const policyContext = await searchKnowledge(state.documentText.slice(0, 512), 5)
  return { policyContext }
}
```

#### `analyzeMatchNode.ts` — 匹配 + MCP 拉 templates

```typescript
// ─── analyzeAndMatchNode — LLM 匹配 + MCP 拉 templates ──────────────────
// 归属：apply 子图
// 输入：state.documentText / state.policyContext
// 输出：state.checkResults
// MCP：通过 getScoreTemplatesMcp(userToken) 拉取 templates

import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { z } from 'zod'
import type { ApplyStateType } from '../../../3state/state.js'
import { createChatModel } from '../../../2model/model.js'
import { ANALYZE_SYSTEM, analyzeUserPrompt } from '../../prompts.js'
import { getScoreTemplatesMcp } from '../../../7mcp/index.js'

const SuggestionSchema = z.object({
  suggestions: z.array(z.object({
    templateId:     z.number(),
    templateName:   z.string(),
    ruleId:         z.number(),
    ruleName:       z.string(),
    estimatedScore: z.number(),
    reason:         z.string().describe('一句话匹配理由，不超过50字'),
  }))
})

export async function analyzeAndMatchNode(
  state: ApplyStateType,
  config: { configurable: { userToken?: string } }
): Promise<Partial<ApplyStateType>> {
  console.log('--apply:analyzeAndMatch')

  // ── MCP 拉取 templates ───────────────────────────────────────────────
  const userToken = config?.configurable?.userToken ?? ''
  const result = await getScoreTemplatesMcp(userToken)

  if (!result.success || !result.data?.templates?.length) {
    console.warn('--apply:analyzeAndMatch: MCP 拉取失败:', result.error)
    return { checkResults: ['{"error":"无可用加分模板，请稍后重试"}'] }
  }

  const templates = result.data.templates
  console.log(`--apply:analyzeAndMatch: MCP 拉取到 ${templates.length} 个模板`)

  // ── LLM 结构化输出匹配 ───────────────────────────────────────────────
  const templatesForPrompt = templates.map(t => ({
    id: t.id, templateName: t.templateName, templateType: t.templateType,
    rules: t.rules.map(r => ({ id: r.id, ruleName: r.ruleName, ruleScore: r.ruleScore }))
  }))

  const model = createChatModel(0.1).withStructuredOutput(SuggestionSchema)
  const output = await model.invoke([
    new SystemMessage(ANALYZE_SYSTEM),
    new HumanMessage(analyzeUserPrompt(
      state.documentText.slice(0, 2000),
      JSON.stringify(templatesForPrompt, null, 2),
      state.policyContext
    )),
  ])

  return { checkResults: output.suggestions.map(s => JSON.stringify(s)) }
}
```

#### `summarizeNode.ts` — 汇总结果

```typescript
// ─── summarizeNode — 汇总匹配结果 ──────────────────────────────────────
// 归属：apply 子图
// 输入：state.checkResults
// 输出：AI 消息（汇总文本）
// 无外部依赖

import { AIMessage } from '@langchain/core/messages'
import type { ApplyStateType } from '../../../3state/state.js'

export async function summarizeNode(
  state: ApplyStateType
): Promise<Partial<ApplyStateType>> {
  console.log('--apply:summarize')

  const suggestions = state.checkResults
    .map(r => { try { return JSON.parse(r) } catch { return null } })
    .filter(Boolean)

  if (suggestions.length === 0 || (suggestions[0] as any)?.error) {
    return { messages: [new AIMessage(
      '根据您提供的材料，暂未匹配到符合条件的加分项。请确认材料内容是否完整，或补充更多信息。'
    )] }
  }

  const summary = suggestions.map((s: any) =>
    `• **${s.templateName}** / ${s.ruleName}\n  预计加分：${s.estimatedScore} 分\n  理由：${s.reason}`
  ).join('\n\n')

  return { messages: [new AIMessage(`为您匹配到以下加分项：\n\n${summary}`)] }
}
```

#### `confirmNode.ts` — 确认路由 + 确认节点

```typescript
// ─── confirmRoute + confirmNode — 确认节点 ──────────────────────────────
// 归属：apply 子图
// confirmRoute：Router，判断是否有匹配结果
// confirmNode：Node，interrupt 等待前端确认

import { HumanMessage, AIMessage } from '@langchain/core/messages'
import { interrupt } from '@langchain/langgraph'
import type { ApplyStateType } from '../../../3state/state.js'

export function confirmRoute(state: ApplyStateType): 'confirm' | 'end' {
  const suggestions = state.checkResults
    .map(r => { try { return JSON.parse(r) } catch { return null } })
    .filter((s: any) => s && !s.error)
  return suggestions.length > 0 ? 'confirm' : 'end'
}

export async function confirmNode(
  state: ApplyStateType
): Promise<Partial<ApplyStateType>> {
  console.log('--apply:confirm (interrupt)')

  const suggestions = state.checkResults
    .map(r => { try { return JSON.parse(r) } catch { return null } })
    .filter((s: any) => s && !s.error)

  const question = [
    `已为您匹配到以下加分项，请上传对应证明材料后点击「确认提交」：`,
    '',
    ...suggestions.map((s: any, i: number) =>
      `${i + 1}. **${s.templateName}** / ${s.ruleName}（预计 ${s.estimatedScore} 分）\n ${s.reason}`
    ),
  ].join('\n')

  const userAnswer = interrupt({ type: 'confirm' as const, question, suggestions })

  return {
    messages: [
      new AIMessage(question),
      new HumanMessage(String(userAnswer)),
    ],
  }
}
```

#### `submitNode.ts` — MCP 拉 userInfo + 提交

```typescript
// ─── submitNode — 解析确认 + MCP 拉 userInfo + 提交 ───────────────────
// 归属：apply 子图
// 输入：state.messages / state.checkResults / state.userId / state.templates
// 输出：AI 消息（提交结果）
// MCP：getUserInfoMcp + submitApplicationMcp

import { HumanMessage, AIMessage } from '@langchain/core/messages'
import type { ApplyStateType } from '../../../3state/state.js'
import { getUserInfoMcp, submitApplicationMcp } from '../../../7mcp/index.js'

export async function submitNode(
  state: ApplyStateType,
  config: { configurable: { userToken?: string; userId?: string } }
): Promise<Partial<ApplyStateType>> {
  console.log('--apply:submit')

  // ── 1. 解析 interrupt 响应 ───────────────────────────────────────────
  const lastHuman = state.messages.filter(m => m instanceof HumanMessage).at(-1)
  const answer = String(lastHuman?.content ?? '').trim()

  let parsed: any
  try { parsed = JSON.parse(answer) }
  catch { parsed = { action: answer.toLowerCase() === 'cancel' ? 'cancel' : 'unknown' } }

  if (parsed.action === 'cancel') {
    return { messages: [new AIMessage('已取消申请，您可以随时重新发起。')] }
  }

  if (parsed.action !== 'confirm' || !Array.isArray(parsed.proofFileIds) || parsed.proofFileIds.length === 0) {
    return { messages: [new AIMessage('操作异常，请重试或联系管理员。')] }
  }

  const proofFileIds: number[] = parsed.proofFileIds
  const proofValues: number[]  = Array.isArray(parsed.proofValues) ? parsed.proofValues : []

  // ── 2. MCP 拉取 userInfo ─────────────────────────────────────────────
  const userId    = config?.configurable?.userId
  const userToken = config?.configurable?.userToken ?? ''

  if (!userId) {
    return { messages: [new AIMessage('用户身份缺失，请重新登录后再申请。')] }
  }

  const infoResult = await getUserInfoMcp(Number(userId), userToken)
  if (!infoResult.success || !infoResult.data?.userInfo) {
    console.error('--apply:submit: MCP 拉取 userInfo 失败:', infoResult.error)
    return { messages: [new AIMessage('获取用户信息失败，请重新登录后再申请。')] }
  }
  const userInfo = infoResult.data.userInfo

  // ── 3. 构造 submitBody ───────────────────────────────────────────────
  const suggestion = state.checkResults
    .map(r => { try { return JSON.parse(r) } catch { return null } })
    .filter((s: any) => s && !s.error)[0] as any

  if (!suggestion) {
    return { messages: [new AIMessage('申请数据异常，请重新上传证明材料。')] }
  }

  const fullTemplate = state.templates.find(t => t.id === suggestion.templateId)
  const submitBody = {
    userId:         userInfo.userId,
    studentId:      userInfo.studentId,
    studentName:    userInfo.studentName,
    major:          userInfo.major,
    enrollmentYear: userInfo.enrollmentYear,
    templateName:   suggestion.templateName,
    templateType:   fullTemplate?.templateType ?? 'CONDITION',
    scoreType:      fullTemplate?.scoreType ?? 0,
    applyScore:     suggestion.estimatedScore,
    ruleId:         suggestion.ruleId ?? null,
    reviewCount:    fullTemplate?.reviewCount ?? 1,
    remark:         `AI 智能匹配 - ${suggestion.reason ?? ''}`,
    proofItems: proofFileIds.map((id: number, i: number) => ({
      proofFileId: id, proofValue: proofValues[i] ?? 0, remark: '',
    })),
  }

  // ── 4. MCP 提交申请 ─────────────────────────────────────────────────
  const submitResult = await submitApplicationMcp(submitBody, userToken)

  if (submitResult.success) {
    return { messages: [new AIMessage(
      `✅ 申请已提交成功！申请编号：**${submitResult.data?.applicationId ?? '未知'}**，请等待审核员审核。`
    )] }
  }

  return { messages: [new AIMessage(`提交失败：${submitResult.error}，请稍后重试或手动提交。`)] }
}
```

#### `index.ts` — apply 子图统一导出

```typescript
// ─── apply 子图节点 — 统一导出 ──────────────────────────────────────────

export { fetchPolicyNode }    from './nodes/fetchPolicyNode.js'
export { analyzeAndMatchNode } from './nodes/analyzeMatchNode.js'
export { summarizeNode }      from './nodes/summarizeNode.js'
export { confirmRoute, confirmNode } from './nodes/confirmNode.js'
export { submitNode }         from './nodes/submitNode.js'
```

### 5.2 consultNodes.ts — 删除 answerDraft

路径：`src/4node/consultNodes.ts`

```typescript
// ─── Layer 4 Node: Consult Flow ──────────────────────────────────────────

import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { createChatModel } from '../2model/model.js'
import { searchKnowledge } from '../rag/index.js'
import { consultSystemPrompt, getSystemRole } from './prompts.js'
import type { ConsultStateType } from '../3state/state.js'

export async function retrieveNode(
  state: ConsultStateType
): Promise<Partial<ConsultStateType>> {
  console.log('--consult:retrieve')
  const allUserText = state.messages
    .filter(m => m instanceof HumanMessage)
    .map(m => String(m.content))
    .join('\n')
  const retrievedContext = await searchKnowledge(allUserText.slice(0, 512), 5)
  return { retrievedContext }
}

export async function answerNode(
  state: ConsultStateType
): Promise<Partial<ConsultStateType>> {
  const userMsg = state.messages.filter(m => m instanceof HumanMessage).at(-1)!
  const model = createChatModel(0.2)
  const reply = await model.invoke([
    new SystemMessage(consultSystemPrompt(getSystemRole(), state.retrievedContext)),
    new HumanMessage(String(userMsg.content)),
  ])
  // answerDraft 已删除（从未被读取，冗余字段）
  return { messages: [reply] }
}
```

---

## 六、graph.ts 改造（idagent）

### 6.1 节点签名变更

LangGraph 节点函数可以接受第二个参数 `config`，通过 `config.configurable` 访问透传数据：

```typescript
// analyzeMatchNode(state, config)     → config.configurable.userToken
// submitNode(state, config)           → config.configurable.userToken + userId
```

### 6.2 改造后 graph.ts

路径：`src/5graph/graph.ts`

```typescript
// ─── Layer 5: Graph — 图编排 ────────────────────────────────────────────

import { StateGraph, START, END } from '@langchain/langgraph'
import { SqliteSaver } from '@langchain/langgraph-checkpoint-sqlite'
import { MainState, ApplyState, ConsultState } from '../3state/state.js'
import { CHECKPOINT_PATH } from '../1config/config.js'

import { classifyNode, askForMoreNode } from '../4node/classifyNodes.js'
import { retrieveNode, answerNode } from '../4node/consultNodes.js'
import {
  fetchPolicyNode,
  analyzeAndMatchNode,
  summarizeNode,
  confirmRoute,
  confirmNode,
  submitNode,
} from '../4node/apply/index.js'

// ── 咨询子图 ────────────────────────────────────────────────────────────

const consultSubgraph = new StateGraph(ConsultState)
  .addNode('retrieve', retrieveNode)
  .addNode('answer',   answerNode)
  .addEdge(START, 'retrieve')
  .addEdge('retrieve', 'answer')
  .addEdge('answer', END)
  .compile()

// ── 申请子图 ────────────────────────────────────────────────────────────

const applySubgraph = new StateGraph(ApplyState)
  .addNode('fetchPolicy',     fetchPolicyNode)
  .addNode('analyzeAndMatch', analyzeAndMatchNode)
  .addNode('summarize',       summarizeNode)
  .addNode('confirm',         confirmNode)
  .addNode('submit',          submitNode)
  .addEdge(START, 'fetchPolicy')
  .addEdge('fetchPolicy', 'analyzeAndMatch')
  .addEdge('analyzeAndMatch', 'summarize')
  .addConditionalEdges('summarize', confirmRoute, { confirm: 'confirm', end: END })
  .addEdge('confirm', 'submit')
  .addEdge('submit', END)
  .compile()

// ── 主图 ────────────────────────────────────────────────────────────────

const mainGraph = new StateGraph(MainState)
  .addNode('classify',     classifyNode)
  .addNode('ask',          askForMoreNode)
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
  .compile()

// ── 编译（带缓存）───────────────────────────────────────────────────────

let _compiled: Awaited<ReturnType<typeof mainGraph.compile>> | null = null

export async function getCompiledGraph() {
  if (!_compiled) {
    const checkpointer = SqliteSaver.fromConnString(CHECKPOINT_PATH)
    _compiled = mainGraph.compile({ checkpointer })
  }
  return _compiled
}
```

---

## 七、AgentService 改造（idagent）

### 7.1 类型变更

路径：`src/6service/types.ts`

```typescript
import type { ScoreTemplate } from '../3state/state.js'

export interface AgentInput {
  userInput:    string
  documentText?: string
  templates?:   ScoreTemplate[]
  sessionId:    string
  userId?:      string
  userToken:    string   // ← 前端 JWT，透传给 MCP 工具调用
  forcedIntent?: 'consult' | 'apply' | null
}

export interface AgentResult {
  interrupted:  boolean
  reply:        string
  intent:       'consult' | 'apply' | 'insufficient'
  documentText: string
  suggestions:  any[]
  question?:    string
}
```

### 7.2 parseAgentParams — 提取 userToken

路径：`src/6service/AgentService.ts`

```typescript
// ── 参数解析 ────────────────────────────────────────────────────────────

export interface ParsedAgentParams {
  userInput:    string
  sessionId:    string
  userId:       string | null
  documentText: string
  templates:    ScoreTemplate[]
  userToken:    string   // ← 前端 JWT，透传给 MCP
  forcedIntent: 'consult' | 'apply' | null
}

export async function parseAgentParams(req: Request): Promise<ParsedAgentParams> {
  const body = req.body as any

  const userInput  = String(body.message ?? '').trim()
  const sessionId  = body.sessionId ?? 'default'
  // x-user-id 由后端从 JWT 中解析后注入
  const userId     = (req.headers['x-user-id'] as string) || null
  // Authorization header 由后端透传（X-Forwarded-User-Token 或直接透传）
  const userToken  = (req.headers['x-forwarded-user-token'] as string)
                  || (req.headers['authorization'] as string)
                  || ''

  let documentText = ''
  if (req.file) {
    const name = decodeFileName(req.file.originalname)
    const ext  = name.includes('.') ? `.${name.split('.').pop()}` : ''
    documentText = await parseFileToText(req.file.path, ext)
    fs.unlink(req.file.path, () => {})
  }

  // templates 仍解析（前端可能传），但不再作为主要数据源
  let templates: ScoreTemplate[] = []
  try { if (body.templates) templates = JSON.parse(body.templates) } catch {}

  const forcedIntent = (body.intent === 'apply' || body.intent === 'consult')
    ? body.intent as 'consult' | 'apply'
    : null

  return { userInput, sessionId, userId, documentText, templates, userToken, forcedIntent }
}
```

### 7.3 invokeAgent / streamAgent — 透传 userToken 到 config

```typescript
// invokeAgent — 透传 userToken 到 config
export async function invokeAgent(input: AgentInput): Promise<AgentResult> {
  const config = {
    configurable: {
      thread_id:  input.sessionId,
      userToken:  input.userToken,  // ← 透传 MCP 鉴权 token
      userId:     input.userId,
    }
  }
  const app = await getApp()
  if (input.userId) safeAppendMessage(input.sessionId, input.userId, 'user', input.userInput)
  await compressIfNeeded(app, config)

  const result = await app.invoke({
    messages:     [new HumanMessage(input.userInput)],
    documentText: input.documentText ?? '',
    templates:     input.templates ?? [],  // 保留但不再强制依赖
    forcedIntent:  input.forcedIntent ?? null,
    // userInfo 不再传入，nodes 通过 MCP 拉取
  }, config)
  // ...
}

// streamAgent — 同理，透传 userToken
export async function* streamAgent(input: AgentInput): AsyncGenerator<...> {
  const config = {
    configurable: {
      thread_id:  input.sessionId,
      userToken:  input.userToken,
      userId:     input.userId,
    }
  }
  // ...
  const eventStream = app.streamEvents(
    { messages: [new HumanMessage(input.userInput)], documentText: input.documentText ?? '',
      templates: input.templates ?? [], forcedIntent: input.forcedIntent ?? null },
    { ...config, version: 'v2' }
  )
  // ...
}
```

---

## 八、完整文件变更清单

### 8.1 后端（idbackend）

| 操作 | 文件路径 | 说明 |
|---|---|---|
| 新建 | `controller/mcp/McpToolsController.java` | MCP 工具服务端，JWT 鉴权 |
| 修改 | `controller/aichat/AICHatController.java` | 转发前端 JWT，删除 templates/userInfo 注入逻辑 |

### 8.2 Agent（idagent）

| 操作 | 文件路径 | 说明 |
|---|---|---|
| 新建 | `src/7mcp/types.ts` | MCP 类型定义 |
| 新建 | `src/7mcp/mcpClient.ts` | MCP 客户端，JWT 鉴权 |
| 新建 | `src/7mcp/index.ts` | 统一导出 |
| 新建 | `src/4node/apply/index.ts` | apply 子图节点统一导出 |
| 新建 | `src/4node/apply/nodes/fetchPolicyNode.ts` | fetchPolicyNode |
| 新建 | `src/4node/apply/nodes/analyzeMatchNode.ts` | analyzeAndMatchNode + MCP |
| 新建 | `src/4node/apply/nodes/summarizeNode.ts` | summarizeNode |
| 新建 | `src/4node/apply/nodes/confirmNode.ts` | confirmRoute + confirmNode |
| 新建 | `src/4node/apply/nodes/submitNode.ts` | submitNode + MCP |
| 修改 | `src/4node/consultNodes.ts` | answerNode 删除 answerDraft 赋值 |
| 修改 | `src/5graph/graph.ts` | 引用路径更新 |
| 修改 | `src/6service/types.ts` | AgentInput 新增 userToken |
| 修改 | `src/6service/AgentService.ts` | parseAgentParams 提取 userToken；config 透传 userToken |
| 修改 | `src/1config/config.ts` | 新增 BACKEND_URL 导出 |
| 删除 | `src/4node/applyNodes.ts` | 已拆分，删除 |
| 删除 | `.env` 中 `INTERNAL_SERVICE_KEY` | 不再使用 |

---

## 九、实施顺序

### Phase 1：后端 MCP 接口

```
目标：McpToolsController 独立可用，JWT 鉴权正常
步骤：
  1. 新建 controller/mcp/McpToolsController.java
  2. 修改 AICHatController，转发 Authorization header 到 Agent
  3. curl 测试（用真实 JWT）：
     curl http://localhost:8080/internal/mcp/tools/get_score_templates \
       -H "Authorization: Bearer <前端JWT>"
     curl "http://localhost:8080/internal/mcp/tools/get_user_info?userId=123" \
       -H "Authorization: Bearer <前端JWT>"
     curl -X POST http://localhost:8080/internal/mcp/tools/submit_application \
       -H "Authorization: Bearer <前端JWT>" -H "Content-Type: application/json" \
       -d '{...}'
验收：三个接口均返回正确数据，JWT 无效返回 401/403
```

### Phase 2：Agent MCP 客户端

```
目标：Agent 侧 MCP 客户端可正常调用后端接口
步骤：
  1. 新建 src/7mcp/types.ts
  2. 新建 src/7mcp/mcpClient.ts
  3. 新建 src/7mcp/index.ts
  4. 新建 src/1config/config.ts 中 BACKEND_URL 导出
  5. 写测试脚本验证：getScoreTemplatesMcp('<JWT>') 返回模板列表
验收：MCP 调用返回正确数据
```

### Phase 3：applyNodes 拆分

```
目标：将 applyNodes.ts 拆分为 6 个独立文件
步骤：
  1. 新建 src/4node/apply/nodes/ 目录
  2. 新建 5 个节点文件 + index.ts
  3. 修改 src/5graph/graph.ts（引用路径）
  4. 删除 src/4node/applyNodes.ts
验收：apply 流程（fetch → analyze → summarize → confirm → submit）正常运行
```

### Phase 4：节点接入 MCP

```
目标：analyzeMatchNode 和 submitNode 通过 MCP 获取数据
步骤：
  1. analyzeMatchNode 调用 getScoreTemplatesMcp(userToken)
  2. submitNode 调用 getUserInfoMcp(userId, userToken) + submitApplicationMcp(submitBody, userToken)
  3. 测试申请流程完整走通
验收：申请流程正常，MCP 数据正确
```

### Phase 5：State 拆分 + 清理

```
目标：删除 answerDraft 和 userInfo 字段
步骤：
  1. 修改 src/3state/state.ts（MainState / ApplyState / ConsultState 分离）
  2. consultNodes.ts 的 answerNode 删除 answerDraft 赋值
  3. AgentService 的 invoke/stream 不再传 userInfo
验收：全部功能正常，无编译警告
```

---

## 附录：MCP 接口文档

### get_score_templates

```
GET /internal/mcp/tools/get_score_templates
Header: Authorization: Bearer <前端JWT>

响应：
{
  "code": 200,
  "data": {
    "templates": [{
      "id": 1, "templateName": "学科竞赛类", "templateType": "CONDITION",
      "scoreType": 0, "templateMaxScore": 12, "reviewCount": 1,
      "rules": [{ "id": 101, "ruleName": "国家级一等奖", "ruleScore": 8 }]
    }]
  }
}
```

### get_user_info

```
GET /internal/mcp/tools/get_user_info?userId=123
Header: Authorization: Bearer <前端JWT>

响应：
{
  "code": 200,
  "data": {
    "userInfo": { "userId": 123, "studentId": "stu2021001",
      "studentName": "张三", "major": "计算机", "enrollmentYear": 2021 }
  }
}
{ "code": 403, "msg": "无权访问其他用户信息" }
```

### submit_application

```
POST /internal/mcp/tools/submit_application
Header: Authorization: Bearer <前端JWT>, Content-Type: application/json
Body: { "userId": 123, "templateName": "学科竞赛类",
        "applyScore": 8, "proofItems": [...] }

响应：
{ "code": 200, "data": "APP-2026-00001" }
```
