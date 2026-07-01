# idagent 工程优化建议文档

> 生成时间：2026-05-03
> 当前版本：基于 LangGraph 的面试助手系统

---

## 一、当前系统架构分析

### 1.1 现有架构概览

```
┌─────────────────────────────────────────────────────────────┐
│                    Express API Layer (Layer 7)              │
│  /agent/*  /analyze/*  /knowledge/*  /config/*            │
└────────────────────────────┬────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────┐
│                    Service Layer (Layer 6)                    │
│              invokeAgent / streamAgent / resumeAgent          │
└────────────────────────────┬────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────┐
│                    Graph Layer (Layer 5)                      │
│        MainGraph (classify → ask/apply/consult)             │
│        SqliteSaver checkpoint（状态持久化）                    │
└────────────────────────────┬────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────┐
│                    Node Layer (Layer 4)                      │
│  classifyNodes / applyNodes / consultNodes / memory           │
│  prompts.ts / rag.ts                                         │
└────────────────────────────┬────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────┐
│                  State Layer (Layer 3)                       │
│                  MainState (messages + business data)          │
└────────────────────────────┬────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────┐
│                 Model Layer (Layer 2)                       │
│               createChatModel / createEmbeddings              │
└────────────────────────────┬────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────┐
│                 Config Layer (Layer 1)                      │
│           config.ts (SQLite + .env)                         │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 当前实现分析

| 模块 | 当前状态 | 说明 |
|------|---------|------|
| **对话状态持久化** | ✅ 已实现 | 使用 SqliteSaver 进行 checkpoint |
| **对话历史查询** | ❌ 未实现 | 仅通过 sessionId 从 checkpoint 恢复，无法直接查询 |
| **多轮对话压缩** | ⚠️ 部分实现 | `memory.ts` 已存在，但服务间调用链路不完整 |
| **MCP (Model Context Protocol)** | ❌ 未实现 | 未集成 MCP 工具 |
| **Skill 能力** | ❌ 未实现 | Agent 仅使用 RAG，无外部工具调用能力 |
| **对话持久化存储** | ❌ 未实现 | 对话记录未存入数据库 |
| **向量数据库** | ⚠️ 内存模式 | 使用 `MemoryVectorStore`，重启后丢失 |

---

## 二、优化需求分析

### 2.1 问题 1：缺少 MCP (Model Context Protocol) 集成

**现状**：Agent 只能进行 RAG 检索和内部处理，无法调用外部工具和服务。

**面试场景需求**：
- 查询学生信息（调用 idbackend API）
- 提交加分申请（调用 idbackend API）
- 查询当前申请状态
- 发送邮件通知
- 搜索更多政策文件

**优化目标**：集成 MCP SDK，实现工具调用能力。

### 2.2 问题 2：缺少 Skill 系统

**现状**：Agent 的能力是固定的（咨询/申请），无法动态扩展。

**面试场景需求**：
- 注册 Skill：注册新的能力（如"查询GPA"、"计算排名"）
- 查询 Skill：列出所有可用 Skill
- 动态调用：根据用户意图调用不同 Skill
- Skill 编排：将多个 Skill 组合使用

**优化目标**：建立 Skill 框架，支持动态注册和调用。

### 2.3 问题 3：对话存储持久化

**现状**：
- 对话通过 `SqliteSaver` 保存 checkpoint（用于恢复）
- 但 checkpoint 只保存状态，不保存完整对话历史
- 无法查询历史对话记录
- 无法导出对话记录

**面试场景需求**：
- 持久化存储完整对话记录
- 支持按 sessionId 查询对话历史
- 支持按时间范围查询
- 支持导出对话记录
- 支持对话标记和摘要

**优化目标**：建立独立的对话存储系统。

### 2.4 问题 4：对话历史查询功能

**现状**：当前无任何对话历史查询 API。

**面试场景需求**：
- 获取当前会话历史
- 获取历史会话列表
- 删除会话
- 搜索历史对话内容

**优化目标**：实现对话历史查询 API。

### 2.5 问题 5：对话压缩功能未启用

**现状**：
- `memory.ts` 已实现压缩逻辑
- `service.ts` 已调用 `compressIfNeeded`
- 但配置为 12 轮触发，且只保存到 checkpoint

**问题**：
1. **压缩后不持久化**：压缩后的摘要保存在 checkpoint 中，但无独立存储
2. **无压缩触发提示**：前端无法感知压缩发生
3. **压缩阈值固定**：无法动态调整

**优化目标**：完善压缩机制，支持独立存储和前端通知。

---

## 三、优化方案详细设计

### 3.1 MCP 集成方案

#### 3.1.1 架构设计

```
┌─────────────────────────────────────────────────────────────┐
│                      MCP Server (Node.js)                    │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │ Student MCP  │  │ Apply MCP   │  │ Policy MCP  │     │
│  │  学生信息    │  │  申请操作   │  │  政策查询   │     │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘     │
└─────────┼─────────────────┼─────────────────┼──────────────┘
          │                 │                 │
          ▼                 ▼                 ▼
┌─────────────────────────────────────────────────────────────┐
│                      MCP Client (Agent)                     │
│  ┌─────────────────────────────────────────────────────┐  │
│  │              Tool Registry (动态注册)                │  │
│  └─────────────────────────────────────────────────────┘  │
│                            │                                │
│                            ▼                                │
│  ┌─────────────────────────────────────────────────────┐  │
│  │         LangGraph ToolNode (调用 MCP 工具)          │  │
│  └─────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

#### 3.1.2 MCP Server 实现

**位置**：`src/mcp/servers/`

**student.server.ts — 学生信息服务**

```typescript
// src/mcp/servers/student.server.ts
import { McpServer, ToolCallback } from '@modelcontextprotocol/sdk/server';

export function createStudentServer(server: McpServer) {
  // 获取学生信息
  server.addTool({
    name: 'get_student_info',
    description: '根据用户ID获取学生基本信息',
    inputSchema: {
      type: 'object',
      properties: {
        userId: { type: 'number', description: '用户ID' }
      },
      required: ['userId']
    },
  }, async ({ userId }) => {
    const resp = await fetch(`${JAVA_BACKEND_URL}/api/user/complete-info`, {
      headers: { 'X-Internal-Service-Key': SERVICE_KEY }
    });
    return { content: [{ type: 'text', text: JSON.stringify(await resp.json()) }] };
  });

  // 查询学生申请记录
  server.addTool({
    name: 'get_student_applications',
    description: '查询学生的加分申请记录',
    inputSchema: {
      type: 'object',
      properties: {
        userId: { type: 'number', description: '用户ID' }
      }
    },
  }, async ({ userId }) => {
    // 调用后端 API
    return { content: [...] };
  });
}
```

**apply.server.ts — 申请操作服务**

```typescript
// src/mcp/servers/apply.server.ts
export function createApplyServer(server: McpServer) {
  // 提交加分申请
  server.addTool({
    name: 'submit_application',
    description: '提交学生加分申请',
    inputSchema: {
      type: 'object',
      properties: {
        userId: { type: 'number' },
        templateId: { type: 'number' },
        score: { type: 'number' },
        proofFileIds: { type: 'array', items: { type: 'number' } }
      }
    },
  }, async (params) => { /* 调用后端 API */ });

  // 查询申请状态
  server.addTool({
    name: 'get_application_status',
    description: '查询加分申请的状态',
    inputSchema: {
      type: 'object',
      properties: {
        applicationId: { type: 'string' }
      }
    },
  }, async ({ applicationId }) => { /* 调用后端 API */ });
}
```

**policy.server.ts — 政策查询服务**

```typescript
// src/mcp/servers/policy.server.ts
export function createPolicyServer(server: McpServer) {
  // 搜索相关政策
  server.addTool({
    name: 'search_policy',
    description: '搜索保研加分相关政策',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '搜索关键词' },
        category: { type: 'string', description: '政策类别' }
      }
    },
  }, async ({ query, category }) => {
    // 调用 RAG 检索或数据库查询
    return { content: [...] };
  });
}
```

#### 3.1.3 MCP Client 集成

**位置**：`src/mcp/client.ts`

```typescript
// src/mcp/client.ts
import { Client } from '@modelcontextprotocol/sdk/client';
import { createStudentServer } from './servers/student.server.js';
import { createApplyServer } from './servers/apply.server.js';
import { createPolicyServer } from './servers/policy.server.js';

export class MCPClient {
  private client: Client;
  private tools: Map<string, Tool> = new Map();

  async initialize() {
    this.client = new Client({ name: 'idagent', version: '1.0.0' });
    
    // 连接 MCP Server（可配置多个）
    await this.client.connect(createStudentServer());
    await this.client.connect(createApplyServer());
    await this.client.connect(createPolicyServer());
    
    // 同步工具列表
    for (const tool of this.client.getTools()) {
      this.tools.set(tool.name, tool);
    }
  }

  async callTool(name: string, args: Record<string, any>) {
    return await this.client.callTool(name, args);
  }

  getTools() {
    return Array.from(this.tools.values());
  }
}
```

#### 3.1.4 Node 层集成

**位置**：`src/4node/mcpNodes.ts`

```typescript
// src/4node/mcpNodes.ts
import { MCPClient } from '../mcp/client.js';

let mcpClient: MCPClient | null = null;

export async function getMCPClient() {
  if (!mcpClient) {
    mcpClient = new MCPClient();
    await mcpClient.initialize();
  }
  return mcpClient;
}

// MCP 工具调用节点
export async function toolCallNode(state: MainStateType) {
  const lastMessage = state.messages.at(-1);
  if (!(lastMessage instanceof HumanMessage)) return {};

  const client = await getMCPClient();
  const tools = client.getTools();
  
  // 根据消息意图选择工具（可集成 LLM 进行路由）
  const selectedTool = selectTool(lastMessage.content, tools);
  
  if (selectedTool) {
    const result = await client.callTool(selectedTool.name, parseArgs(lastMessage.content));
    return {
      messages: [new AIMessage({ content: `[Tool: ${selectedTool.name}]\n${result}` })]
    };
  }
  
  return {};
}
```

---

### 3.2 Skill 系统方案

#### 3.2.1 架构设计

```
┌─────────────────────────────────────────────────────────────┐
│                     Skill Framework                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │  Calculator  │  │  Querier    │  │  Notifier   │     │
│  │   计算类    │  │   查询类    │  │   通知类    │     │
│  └─────────────┘  └─────────────┘  └─────────────┘     │
└────────────────────────────┬────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────┐
│                    Skill Registry                            │
│    注册 / 注销 / 查询 / 编排                                │
└────────────────────────────┬────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────┐
│                   Skill Executor                             │
│    动态执行 / 错误处理 / 结果格式化                         │
└─────────────────────────────────────────────────────────────┘
```

#### 3.2.2 Skill 接口定义

**位置**：`src/skills/types.ts`

```typescript
// src/skills/types.ts
export interface SkillContext {
  sessionId: string
  userId?: number
  messages: BaseMessage[]
  state: Record<string, any>
}

export interface SkillResult {
  success: boolean
  content: string
  data?: any
  error?: string
}

export interface Skill {
  // Skill 标识
  id: string
  name: string
  description: string
  version: string
  
  // 执行入口
  execute(ctx: SkillContext): Promise<SkillResult>
  
  // 元数据
  category: 'calculation' | 'query' | 'notification' | 'agent'
  tags: string[]
  examples: string[]
}

export interface SkillManifest {
  id: string
  name: string
  description: string
  version: string
  category: string
  tags: string[]
}
```

#### 3.2.3 内置 Skill 实现

**位置**：`src/skills/`

**calculator.skill.ts — 计算类 Skill**

```typescript
// src/skills/calculator.skill.ts
export class CalculatorSkill implements Skill {
  id = 'calculator'
  name = '计算器'
  description = '执行各种计算，包括GPA计算、加分统计等'
  version = '1.0.0'
  category = 'calculation'
  tags = ['gpa', 'score', 'calculation']
  examples = ['帮我计算一下GPA', '我的综测分是多少']

  async execute(ctx: SkillContext): Promise<SkillResult> {
    const message = ctx.messages.at(-1)?.content as string;
    
    // 提取计算意图
    if (message.includes('GPA') || message.includes('绩点')) {
      return this.calculateGPA(ctx);
    }
    
    return { success: false, content: '无法解析计算请求' };
  }

  private async calculateGPA(ctx: SkillContext): Promise<SkillResult> {
    // 调用 MCP 获取学生成绩
    // 执行 GPA 计算逻辑
    return {
      success: true,
      content: `您的 GPA 为 3.85，排名在前 20%。`,
      data: { gpa: 3.85, rank: '20%' }
    };
  }
}
```

**querier.skill.ts — 查询类 Skill**

```typescript
// src/skills/querier.skill.ts
export class QuerierSkill implements Skill {
  id = 'querier'
  name = '信息查询'
  description = '查询各类信息，包括申请状态、政策规定等'
  version = '1.0.0'
  category = 'query'
  tags = ['query', 'status', 'policy']
  examples = ['我的申请审到哪了', '挑战杯能加多少分']

  async execute(ctx: SkillContext): Promise<SkillResult> {
    const message = (ctx.messages.at(-1)?.content as string).toLowerCase();
    
    if (message.includes('申请') && (message.includes('状态') || message.includes('审'))) {
      return this.queryApplicationStatus(ctx);
    }
    
    if (message.includes('加分') || message.includes('政策')) {
      return this.queryPolicy(ctx);
    }
    
    return { success: false, content: '无法解析查询请求' };
  }

  private async queryApplicationStatus(ctx: SkillContext): Promise<SkillResult> {
    // 通过 MCP 或直接调用查询申请状态
    return {
      success: true,
      content: '您有 2 条待审核申请，1 条已通过。',
      data: { pending: 2, approved: 1 }
    };
  }

  private async queryPolicy(ctx: SkillContext): Promise<SkillResult> {
    // 通过 RAG 检索政策
    return { success: true, content: '...' };
  }
}
```

**notifier.skill.ts — 通知类 Skill**

```typescript
// src/skills/notifier.skill.ts
export class NotifierSkill implements Skill {
  id = 'notifier'
  name = '通知助手'
  description = '发送通知，包括邮件、站内信等'
  version = '1.0.0'
  category = 'notification'
  tags = ['notify', 'email', 'message']
  examples = ['给我发一封邮件', '通知老师审核']

  async execute(ctx: SkillContext): Promise<SkillResult> {
    // 解析通知意图，调用后端发送通知
    return { success: true, content: '通知已发送' };
  }
}
```

#### 3.2.4 Skill 注册与执行

**位置**：`src/skills/registry.ts`

```typescript
// src/skills/registry.ts
import { Skill, SkillContext, SkillManifest } from './types.js';
import { CalculatorSkill } from './calculator.skill.js';
import { QuerierSkill } from './querier.skill.js';
import { NotifierSkill } from './notifier.skill.js';

export class SkillRegistry {
  private skills: Map<string, Skill> = new Map();

  constructor() {
    // 注册内置 Skill
    this.register(new CalculatorSkill());
    this.register(new QuerierSkill());
    this.register(new NotifierSkill());
  }

  register(skill: Skill) {
    this.skills.set(skill.id, skill);
    console.log(`[skill] registered: ${skill.id} v${skill.version}`);
  }

  unregister(id: string) {
    this.skills.delete(id);
  }

  get(id: string): Skill | undefined {
    return this.skills.get(id);
  }

  listManifests(): SkillManifest[] {
    return Array.from(this.skills.values()).map(s => ({
      id: s.id,
      name: s.name,
      description: s.description,
      version: s.version,
      category: s.category,
      tags: s.tags,
    }));
  }

  async execute(id: string, ctx: SkillContext): Promise<SkillResult> {
    const skill = this.skills.get(id);
    if (!skill) {
      return { success: false, error: `Skill not found: ${id}` };
    }
    
    try {
      return await skill.execute(ctx);
    } catch (e) {
      return { success: false, error: String(e) };
    }
  }

  // 根据用户消息匹配 Skill
  async matchSkill(message: string): Promise<Skill | null> {
    const lowerMsg = message.toLowerCase();
    
    for (const skill of this.skills.values()) {
      for (const example of skill.examples) {
        if (lowerMsg.includes(example.toLowerCase())) {
          return skill;
        }
      }
      // 也可用 LLM 做更智能的匹配
    }
    
    return null;
  }
}

export const skillRegistry = new SkillRegistry();
```

---

### 3.3 对话存储持久化方案

#### 3.3.1 数据库设计

**位置**：`src/1config/config.ts` 或新建 `src/1config/chatDb.ts`

```sql
-- 对话会话表
CREATE TABLE IF NOT EXISTS chat_sessions (
  session_id      TEXT PRIMARY KEY,
  user_id         INTEGER,
  created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at      INTEGER NOT NULL DEFAULT (unixepoch()),
  title           TEXT,                          -- 对话标题（自动生成或用户输入）
  status          TEXT DEFAULT 'active',          -- active / archived / deleted
  is_starred      INTEGER DEFAULT 0,             -- 是否收藏
  tag             TEXT,                          -- 自定义标签
  metadata        TEXT                            -- JSON 其他元数据
);

-- 对话消息表
CREATE TABLE IF NOT EXISTS chat_messages (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id      TEXT NOT NULL,
  role            TEXT NOT NULL,                  -- user / assistant / system / tool
  content         TEXT NOT NULL,
  token_count     INTEGER,
  intent          TEXT,                            -- consult / apply / insufficient
  metadata        TEXT,                            -- JSON 额外信息
  created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (session_id) REFERENCES chat_sessions(session_id)
);

-- 向量索引表（可选，用于语义搜索）
CREATE TABLE IF NOT EXISTS message_embeddings (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id      INTEGER NOT NULL,
  embedding       BLOB NOT NULL,
  FOREIGN KEY (message_id) REFERENCES chat_messages(id)
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_messages_session ON chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON chat_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_updated ON chat_sessions(updated_at);
```

#### 3.3.2 ChatStorage 实现

**位置**：`src/1config/chatDb.ts`

```typescript
// src/1config/chatDb.ts
import { getDb } from './config.js';
import { createEmbeddings } from '../2model/model.js';

export interface SessionInfo {
  sessionId: string;
  userId?: number;
  title: string;
  status: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
}

export interface MessageRecord {
  id: number;
  sessionId: string;
  role: string;
  content: string;
  intent?: string;
  createdAt: number;
}

export class ChatStorage {
  // 创建新会话
  createSession(sessionId: string, userId?: number): SessionInfo {
    const db = getDb();
    db.prepare(`
      INSERT INTO chat_sessions (session_id, user_id, title, status)
      VALUES (?, ?, ?, 'active')
    `).run(sessionId, userId, `新对话 ${new Date().toLocaleDateString()}`);
    
    return this.getSession(sessionId)!;
  }

  // 保存消息
  saveMessage(sessionId: string, role: string, content: string, intent?: string) {
    const db = getDb();
    const result = db.prepare(`
      INSERT INTO chat_messages (session_id, role, content, intent)
      VALUES (?, ?, ?, ?)
    `).run(sessionId, role, content, intent ?? null);
    
    // 更新会话更新时间
    db.prepare(`
      UPDATE chat_sessions SET updated_at = unixepoch() WHERE session_id = ?
    `).run(sessionId);
    
    return result.lastInsertRowid;
  }

  // 获取会话消息
  getSessionMessages(sessionId: string, limit = 100): MessageRecord[] {
    const db = getDb();
    return db.prepare(`
      SELECT id, session_id as sessionId, role, content, intent, created_at as createdAt
      FROM chat_messages
      WHERE session_id = ?
      ORDER BY created_at ASC
      LIMIT ?
    `).all(sessionId, limit) as MessageRecord[];
  }

  // 获取会话列表
  getSessionList(userId?: number, options?: {
    status?: string;
    limit?: number;
    offset?: number;
    search?: string;
  }): SessionInfo[] {
    const db = getDb();
    let sql = `
      SELECT s.session_id as sessionId, s.user_id as userId, s.title,
             s.status, s.created_at as createdAt, s.updated_at as updatedAt,
             COUNT(m.id) as messageCount
      FROM chat_sessions s
      LEFT JOIN chat_messages m ON s.session_id = m.session_id
    `;
    
    const params: any[] = [];
    const conditions: string[] = [];
    
    if (userId != null) {
      conditions.push('s.user_id = ?');
      params.push(userId);
    }
    if (options?.status) {
      conditions.push('s.status = ?');
      params.push(options.status);
    }
    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }
    
    sql += ' GROUP BY s.session_id ORDER BY s.updated_at DESC';
    
    if (options?.limit) {
      sql += ' LIMIT ?';
      params.push(options.limit);
      if (options?.offset) {
        sql += ' OFFSET ?';
        params.push(options.offset);
      }
    }
    
    return db.prepare(sql).all(...params) as SessionInfo[];
  }

  // 更新会话标题
  updateSessionTitle(sessionId: string, title: string) {
    const db = getDb();
    db.prepare(`
      UPDATE chat_sessions SET title = ?, updated_at = unixepoch() WHERE session_id = ?
    `).run(title, sessionId);
  }

  // 删除/归档会话
  archiveSession(sessionId: string) {
    const db = getDb();
    db.prepare(`
      UPDATE chat_sessions SET status = 'archived', updated_at = unixepoch() WHERE session_id = ?
    `).run(sessionId);
  }

  // 收藏会话
  toggleStar(sessionId: string, starred: boolean) {
    const db = getDb();
    db.prepare(`
      UPDATE chat_sessions SET is_starred = ?, updated_at = unixepoch() WHERE session_id = ?
    `).run(starred ? 1 : 0, sessionId);
  }

  // 搜索消息（全文搜索）
  searchMessages(query: string, userId?: number, limit = 20): MessageRecord[] {
    const db = getDb();
    // 简单的 LIKE 搜索，更高级可用 SQLite FTS5
    return db.prepare(`
      SELECT m.id, m.session_id as sessionId, m.role, m.content, m.intent, m.created_at as createdAt
      FROM chat_messages m
      JOIN chat_sessions s ON m.session_id = s.session_id
      WHERE m.content LIKE ? ${userId ? 'AND s.user_id = ?' : ''}
      ORDER BY m.created_at DESC
      LIMIT ?
    `).all(`%${query}%`, ...(userId ? [userId, limit] : [limit])) as MessageRecord[];
  }
}

export const chatStorage = new ChatStorage();
```

#### 3.3.3 Service 层集成

**位置**：`src/6service/service.ts` 修改

```typescript
import { chatStorage, SessionInfo, MessageRecord } from '../1config/chatDb.js';

// 新增：保存对话到数据库
export async function saveMessageToDb(
  sessionId: string,
  role: string,
  content: string,
  intent?: string
): Promise<number> {
  // 确保会话存在
  const sessions = chatStorage.getSessionList(undefined, { search: sessionId });
  if (sessions.length === 0) {
    chatStorage.createSession(sessionId);
  }
  return chatStorage.saveMessage(sessionId, role, content, intent);
}

// 新增：查询对话历史
export function getChatHistory(sessionId: string, limit?: number): MessageRecord[] {
  return chatStorage.getSessionMessages(sessionId, limit);
}

// 新增：获取会话列表
export function getSessionList(userId?: number, options?: any): SessionInfo[] {
  return chatStorage.getSessionList(userId, options);
}

// 修改 invokeAgent
export async function invokeAgent(input: AgentInput) {
  const config = { configurable: { thread_id: input.sessionId } };
  const app = await getApp();

  // 1. 保存用户消息
  await saveMessageToDb(input.sessionId, 'user', input.userInput);

  // 2. 压缩检查
  await compressIfNeeded(app, config);

  // 3. 执行 Agent
  const result = await app.invoke({
    messages: [new HumanMessage(input.userInput)],
    documentText: input.documentText ?? '',
    templates: input.templates ?? [],
    userInfo: input.userInfo ?? null,
  }, config);

  // 4. 保存助手回复
  await saveMessageToDb(input.sessionId, 'assistant', result.reply, result.intent);

  // 5. 检查中断
  const interruptResult = await checkInterrupt(config);
  if (interruptResult) return interruptResult;
  
  return extractResult(result);
}
```

---

### 3.4 对话历史查询 API

**位置**：`src/7api/history.ts`（新建）

```typescript
// src/7api/history.ts
import { Router } from 'express';
import {
  chatStorage,
  getSessionList,
  getChatHistory,
  SessionInfo,
  MessageRecord
} from '../1config/chatDb.js';

const router = Router();

/** GET /history/sessions — 获取会话列表 */
router.get('/sessions', (req, res) => {
  const userId = req.query.userId ? Number(req.query.userId) : undefined;
  const status = req.query.status as string | undefined;
  const limit = req.query.limit ? Number(req.query.limit) : 50;
  const offset = req.query.offset ? Number(req.query.offset) : 0;
  const search = req.query.search as string | undefined;

  try {
    const sessions = chatStorage.getSessionList(userId, { status, limit, offset });
    res.json({ code: 200, msg: '成功', data: sessions });
  } catch (err) {
    res.json({ code: 500, msg: String(err), data: null });
  }
});

/** GET /history/sessions/:sessionId — 获取会话详情 */
router.get('/sessions/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const limit = req.query.limit ? Number(req.query.limit) : 100;

  try {
    const messages = chatStorage.getSessionMessages(sessionId, limit);
    res.json({ code: 200, msg: '成功', data: { sessionId, messages } });
  } catch (err) {
    res.json({ code: 500, msg: String(err), data: null });
  }
});

/** DELETE /history/sessions/:sessionId — 删除会话 */
router.delete('/sessions/:sessionId', (req, res) => {
  const { sessionId } = req.params;

  try {
    chatStorage.archiveSession(sessionId);
    res.json({ code: 200, msg: '删除成功', data: null });
  } catch (err) {
    res.json({ code: 500, msg: String(err), data: null });
  }
});

/** PUT /history/sessions/:sessionId/title — 更新会话标题 */
router.put('/sessions/:sessionId/title', (req, res) => {
  const { sessionId } = req.params;
  const { title } = req.body;

  if (!title) {
    res.json({ code: 400, msg: '标题不能为空', data: null });
    return;
  }

  try {
    chatStorage.updateSessionTitle(sessionId, title);
    res.json({ code: 200, msg: '更新成功', data: null });
  } catch (err) {
    res.json({ code: 500, msg: String(err), data: null });
  }
});

/** POST /history/sessions/:sessionId/star — 收藏/取消收藏 */
router.post('/sessions/:sessionId/star', (req, res) => {
  const { sessionId } = req.params;
  const { starred = true } = req.body;

  try {
    chatStorage.toggleStar(sessionId, starred);
    res.json({ code: 200, msg: starred ? '已收藏' : '已取消收藏', data: null });
  } catch (err) {
    res.json({ code: 500, msg: String(err), data: null });
  }
});

/** GET /history/search — 搜索消息 */
router.get('/search', (req, res) => {
  const query = req.query.q as string;
  const userId = req.query.userId ? Number(req.query.userId) : undefined;

  if (!query || query.length < 2) {
    res.json({ code: 400, msg: '搜索关键词至少2个字符', data: null });
    return;
  }

  try {
    const results = chatStorage.searchMessages(query, userId);
    res.json({ code: 200, msg: '成功', data: results });
  } catch (err) {
    res.json({ code: 500, msg: String(err), data: null });
  }
});

export default router;
```

---

### 3.5 对话压缩机制完善

#### 3.5.1 问题分析

当前 `memory.ts` 实现的压缩存在以下问题：

1. **压缩不持久化**：压缩结果只保存在 checkpoint 中，不是独立存储
2. **前端无感知**：压缩后前端不知道发生了什么
3. **无压缩历史**：无法查看压缩记录

#### 3.5.2 优化方案

**位置**：`src/1config/chatDb.ts` 扩展

```typescript
// 新增压缩记录表
export class CompressionLog {
  // 记录压缩事件
  static log(sessionId: string, before: number, after: number, reason: string) {
    const db = getDb();
    db.prepare(`
      INSERT INTO compression_log (session_id, before_count, after_count, reason, created_at)
      VALUES (?, ?, ?, ?, unixepoch())
    `).run(sessionId, before, after, reason);
  }

  // 获取压缩历史
  static getHistory(sessionId: string): any[] {
    const db = getDb();
    return db.prepare(`
      SELECT * FROM compression_log WHERE session_id = ? ORDER BY created_at DESC
    `).all(sessionId);
  }
}
```

**位置**：`src/6service/service.ts` 修改

```typescript
import { CompressionLog } from '../1config/chatDb.js';

async function compressIfNeeded(...) {
  // ... 原有压缩逻辑 ...

  if (compressed) {
    // 1. 记录压缩日志
    CompressionLog.log(
      config.configurable.thread_id,
      compressResult.previousCount,
      compressResult.newCount,
      'context_limit'
    );

    // 2. 返回压缩标记（用于 SSE 通知前端）
    return {
      compressed: true,
      previousCount: compressResult.previousCount,
      newCount: compressResult.newCount,
      message: `上下文已自动压缩（${compressResult.previousCount} → ${compressResult.newCount} 条）`
    };
  }

  return { compressed: false };
}
```

#### 3.5.3 前端通知机制

在 SSE 流中添加压缩事件：

```typescript
// src/6service/service.ts
export async function* streamAgent(input: AgentInput) {
  // ...

  // 压缩检查
  const compressResult = await compressIfNeeded(app, config);
  if (compressResult.compressed) {
    yield {
      type: 'context_compressed',
      data: {
        message: compressResult.message,
        before: compressResult.previousCount,
        after: compressResult.newCount
      }
    };
  }

  // ... 继续流式输出 ...
}
```

前端收到 `context_compressed` 事件后可以：
1. 显示提示："上下文已自动压缩"
2. 显示压缩统计
3. 提供"查看压缩历史"的入口

---

## 四、API 路由汇总

### 4.1 新增 API 路由

| 方法 | 路径 | 描述 | 认证 |
|------|------|------|------|
| GET | `/history/sessions` | 获取会话列表 | 需要 |
| GET | `/history/sessions/:sessionId` | 获取会话详情 | 需要 |
| DELETE | `/history/sessions/:sessionId` | 删除会话 | 需要 |
| PUT | `/history/sessions/:sessionId/title` | 更新会话标题 | 需要 |
| POST | `/history/sessions/:sessionId/star` | 收藏会话 | 需要 |
| GET | `/history/search` | 搜索消息 | 需要 |
| GET | `/skills` | 获取所有 Skill 列表 | 不需要 |
| POST | `/skills/execute` | 执行指定 Skill | 需要 |
| GET | `/mcp/tools` | 获取所有 MCP 工具 | 需要 |

### 4.2 路由注册

**位置**：`src/7api/index.ts`

```typescript
import historyRouter from './history.js';
import skillRouter from './skill.js';

apiRouter.use('/history', historyRouter);
apiRouter.use('/skills', skillRouter);
```

---

## 五、实施计划

### 阶段一：基础存储（优先级：高）

1. **扩展 SQLite 表结构**
   - 新增 `chat_sessions` 表
   - 新增 `chat_messages` 表
   - 新增 `compression_log` 表

2. **实现 ChatStorage 类**
   - 会话 CRUD
   - 消息存储
   - 历史查询

3. **Service 层集成**
   - 每次对话自动保存
   - 支持从数据库恢复

### 阶段二：API 开发（优先级：高）

1. **History API**
   - 会话列表
   - 会话详情
   - 搜索功能

2. **路由注册**
   - 修改 `7api/index.ts`

### 阶段三：压缩机制完善（优先级：中）

1. **压缩日志**
   - 记录每次压缩
   - 提供查询接口

2. **前端通知**
   - SSE 压缩事件
   - 前端提示

### 阶段四：MCP 集成（优先级：中）

1. **MCP Server 实现**
   - Student MCP
   - Apply MCP
   - Policy MCP

2. **MCP Client 集成**
   - 工具注册
   - 动态调用

3. **Node 层集成**
   - ToolCall Node

### 阶段五：Skill 系统（优先级：低）

1. **Skill 框架**
   - 接口定义
   - 注册机制
   - 执行器

2. **内置 Skill**
   - Calculator
   - Querier
   - Notifier

3. **API 集成**

---

## 六、文件结构规划

```
idagent/src/
├── 1config/
│   ├── config.ts          # 现有配置
│   └── chatDb.ts          # 新增：对话存储
├── 2model/
│   └── model.ts           # 现有模型
├── 3state/
│   └── state.ts           # 现有状态
├── 4node/
│   ├── classifyNodes.ts  # 现有节点
│   ├── applyNodes.ts     # 现有节点
│   ├── consultNodes.ts   # 现有节点
│   ├── memory.ts         # 现有压缩
│   ├── rag.ts           # 现有 RAG
│   ├── prompts.ts        # 现有提示词
│   └── toolNodes.ts      # 新增：MCP 工具节点
├── 5graph/
│   └── graph.ts          # 现有图
├── 6service/
│   └── service.ts        # 修改：集成存储
├── 7api/
│   ├── index.ts          # 修改：注册新路由
│   ├── agent.ts         # 现有
│   ├── analyze.ts       # 现有
│   ├── config.ts        # 现有
│   ├── knowledge.ts     # 现有
│   ├── history.ts       # 新增：历史查询
│   └── skill.ts        # 新增：Skill API
├── skills/              # 新增：Skill 系统
│   ├── types.ts
│   ├── registry.ts
│   ├── calculator.skill.ts
│   ├── querier.skill.ts
│   └── notifier.skill.ts
├── mcp/                 # 新增：MCP 集成
│   ├── client.ts
│   └── servers/
│       ├── student.server.ts
│       ├── apply.server.ts
│       └── policy.server.ts
└── main.ts             # 修改：初始化
```

---

## 七、依赖更新

**package.json 需新增依赖**：

```json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "@langchain/mcp-adapters": "^1.0.0"
  }
}
```

---

## 八、注意事项

1. **向后兼容**：新增功能不应破坏现有对话流程
2. **性能考虑**：大规模对话历史查询需添加索引
3. **数据安全**：敏感数据需加密存储
4. **容量管理**：定期清理归档会话，避免数据库膨胀
5. **错误处理**：MCP 调用失败应有降级策略

---

## 九、附录

### A. 当前 memory.ts 压缩逻辑

```typescript
// 现有压缩配置
const COMPRESS_THRESHOLD = 12;   // 触发阈值
const KEEP_RECENT = 5;          // 保留最近消息数
const SUMMARY_TEMPERATURE = 0.1; // 摘要模型温度
```

### B. 现有 SSE 事件类型

```typescript
type AgentSSEEvent =
  | { type: 'token', data: { content: string } }
  | { type: 'interrupt', data: { question: string, suggestions: any[] } }
  | { type: 'result', data: AgentResult }
  | { type: 'error', data: { message: string } }
  | { type: 'session', data: { sessionId: string } }
  | { type: 'context_limit', data: { message: string } }
```

### C. 新增 SSE 事件类型

```typescript
type AgentSSEEvent =
  // ... 现有类型 ...
  | { type: 'context_compressed', data: {
      message: string,
      before: number,
      after: number
    }}
  | { type: 'tool_call', data: {
      toolName: string,
      args: any,
      result: any
    }}
```
