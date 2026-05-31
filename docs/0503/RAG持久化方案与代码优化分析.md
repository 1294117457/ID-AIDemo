# RAG 持久化方案 + 代码优化分析文档

> 生成日期：2026-05-03
> 项目：`idagent` - 厦门大学保研加分 Agent

---

## 目录

- [一、当前 RAG 架构问题总结](#一当前-rag-架构问题总结)
- [二、RAG 持久化方案对比](#二rag-持久化方案对比)
- [三、推荐方案：向量存储换用 SQLite + 自建索引](#三推荐方案向量存储换用-sqlite--自建索引)
- [四、路径修正：将数据移至 `src/rag/data/`](#四路径修正将数据移至-srcragdata)
- [五、store.ts 问题分析与优化](#五storts-问题分析与优化)
- [六、loader.ts 问题分析与优化](#六loaderts-问题分析与优化)
- [七、rag.ts 问题分析与优化](#七ragts-问题分析与优化)
- [八、upload.ts 问题分析与优化](#八uploadts-问题分析与优化)
- [九、整体架构优化建议](#九整体架构优化建议)
- [十、完整修改计划总结](#十完整修改计划总结)

---

## 一、当前 RAG 架构问题总结

### 1.1 路径问题（最核心）

当前 `store.ts` 定义的数据路径基于 `PROJECT_ROOT`（即 `src/`）：

```3:19:idagent/src/rag/src/store.ts
export const UPLOAD_DIR      = path.resolve(PROJECT_ROOT, 'data/uploads')
export const VEC_STORE_PATH  = path.resolve(PROJECT_ROOT, 'data/vec_store.json')
export const META_PATH       = path.resolve(PROJECT_ROOT, 'data/rag_meta.json')
```

而 `rag.ts` 定义的知识库目录又是另一个路径：

```14:15:idagent/src/rag/src/rag.ts
export const KNOWLEDGE_DIR = path.resolve(__dirname, '../../../data/init_docs')
```

**问题：**
- `UPLOAD_DIR`、`VEC_STORE_PATH`、`META_PATH` 指向 `src/data/`
- `KNOWLEDGE_DIR` 指向 `data/init_docs/`（在 `src/` 外）
- 上传文件存 `src/data/uploads/` 但实际生成的 `vec_store.json` 和 `rag_meta.json` 在 `src/data/`
- 实际产物已确认：`src/data/rag_meta.json` 和 `src/data/vec_store.json` 存在
- `src/rag/data/init_docs/` 是初始化知识库文件目录

**用户期望：所有 RAG 数据放在 `src/rag/data/` 下**

### 1.2 持久化方案现状

当前实现是 **JSON 文件存储 + 纯内存余弦相似度检索**：

```76:85:idagent/src/rag/src/store.ts
function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) + 1e-10)
}
```

**问题：**
- 每次 `similaritySearch` 都要加载整个 `vec_store.json` 到内存
- 数据量大时性能急剧下降
- `resetStore` 删除文件、`removeSource` 全量重写入，新文档入库效率低
- `sqlite-vss` 已在 `package.json` 中但未实际使用
- `chromadb` 和 `faiss-node` 也已安装，同样未实际使用

### 1.3 代码重复和冗余

**store.ts 顶部重复 import：**

```1:12:idagent/src/rag/src/store.ts
import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import 'dotenv/config'

import 'dotenv/config'
import { fileURLToPath } from 'url'
import path from 'path'
```

`dotenv/config`、`fs`、`path`、`fileURLToPath` 各写了两次。

**__dirname 计算重复：**

`rag.ts` 和 `store.ts` 都独立计算 `__dirname` 和 `PROJECT_ROOT`，导致路径基准不统一。

**rag.ts 中 import store.ts 的路径问题：**

```6:12:idagent/src/rag/src/rag.ts
import { UPLOAD_DIR } from './store.js'
// ...
export const KNOWLEDGE_DIR = path.resolve(__dirname, '../../../data/init_docs')
```

`KNOWLEDGE_DIR` 基于 `rag.ts` 的 `__dirname`（即 `src/rag/src/`），向上三级到 `src/` 外部的 `data/init_docs/`。这个目录实际上不存在（知识库文件在 `src/rag/data/init_docs/`）。

### 1.4 initKnowledge 无法正常工作

由于上述路径错误，`KNOWLEDGE_DIR` 指向了错误位置：

```20:23:idagent/src/rag/src/rag.ts
export async function initKnowledge(): Promise<void> {
  if (!fs.existsSync(KNOWLEDGE_DIR)) {
    console.warn('[rag] 目录不存在:', KNOWLEDGE_DIR)
    return
  }
```

实际知识库文件在 `src/rag/data/init_docs/`，但 `KNOWLEDGE_DIR` 指向的是 `src/` 同级目录下的 `data/init_docs/`（不存在），所以 `initKnowledge()` 启动时永远只会打印警告而不会加载任何文档。

---

## 二、RAG 持久化方案对比

| 方案 | 嵌入方式 | 部署需求 | Windows 兼容 | 推荐度 | 备注 |
|------|----------|----------|-------------|--------|------|
| **当前 JSON 文件** | 内存全量加载 | 无 | ✅ | ⚠️ 勉强可用 | 简单但性能差 |
| **sqlite-vss** | SQLite 扩展 | Native 编译 | ❌ | ❌ | Windows 不支持 |
| **Chroma（Embedded）** | 单进程内嵌 | 无 | ✅ | ⭐⭐⭐⭐ | `chromadb` 已装，内嵌模式无需单独服务 |
| **faiss-node** | Node.js addon | Native 编译 | ⚠️ | ⭐⭐⭐ | `faiss-node` 已装，有预编译但 Windows 支持不稳定 |
| **better-sqlite3 + 自建 HNSW** | SQLite + JS 实现 | 无 | ✅ | ⭐⭐⭐⭐⭐ | 最轻量，零额外服务，跨平台 |

### 关键约束

1. **Windows 本地开发 + Linux 部署**：方案必须同时支持两个平台
2. **不单独部署数据库服务**：必须嵌入进程，不依赖外部进程
3. **sqlite-vss 不可用**：Windows 上 native 扩展编译失败

---

## 三、推荐方案：向量存储换用 SQLite + 自建 HNSW 索引

### 3.1 方案选型理由

- `sqlite-vss` 不可用（Windows native 问题）
- `chromadb` 内嵌模式可用，但依赖较重（已在 `package.json`）
- `better-sqlite3` 已在 `package.json`，Windows 有预编译二进制，跨平台最稳定
- **纯 JS 实现的 HNSW 向量索引**：无需 native 依赖，完全跨平台

### 3.2 架构设计

```
src/rag/
├── src/
│   ├── store.ts          # 重写：SQLite + HNSW 持久化
│   ├── loader.ts         # 保持不变（文件加载逻辑清晰）
│   ├── rag.ts           # 修正路径 + 简化逻辑
│   ├── upload.ts        # 修正 UPLOAD_DIR 路径
│   └── tools.ts         # 保持不变
├── data/                 # ✅ 所有数据放这里
│   ├── vec_store.db      # SQLite 数据库（含向量表）
│   ├── rag_meta.json     # 文件元数据（JSON，文件小）
│   ├── uploads/          # 临时上传文件
│   └── init_docs/        # 初始化知识库文件
└── index.ts
```

### 3.3 SQLite 数据库表设计

```sql
CREATE TABLE IF NOT EXISTS vec_entries (
  id         TEXT PRIMARY KEY,
  content    TEXT NOT NULL,
  source     TEXT NOT NULL,
  metadata   TEXT NOT NULL DEFAULT '{}',
  vector     BLOB NOT NULL  -- 存储 float32 序列化后的二进制
);

-- HNSW 索引表（近似最近邻索引）
CREATE VIRTUAL TABLE IF NOT EXISTS vec_ivfflat USING ivfflat (vector, 'id', 100);
```

> 注：如果使用纯 JS HNSW 实现（如 `hnswlib-node`），则无需 SQLite 扩展，直接在内存/文件层操作。

### 3.4 推荐 HNSW 实现方案

**方案 A：`hnswlib-node`（预编译二进制，跨平台）**

```bash
npm install hnswlib-node
```

```typescript
import { HierarchicalNSW } from 'hnswlib-node'

let _index: HierarchicalNSW | null = null

export async function similaritySearch(query: string, topK: number): Promise<Document[]> {
  const index = await getIndex()
  const queryVec = await embeddings.embedQuery(query)
  const results = index.search(queryVec, topK)
  // 从 SQLite 按 id 查询 content 和 metadata
}
```

**方案 B：继续 JSON + SQLite 混合（最小改动）**

如果不想引入新依赖，可以：
1. 向量仍存 SQLite BLOB 列
2. 检索时从 SQLite 加载全量向量做内存余弦相似度
3. 配合 SQLite 的 `LIMIT` 和索引加速过滤

**推荐：方案 A（hnswlib-node）**，理由：
- 已有 `chromadb` 在 `package.json`，可以替换为 `hnswlib-node`（更轻）
- 预编译二进制，Windows/Linux 兼容
- 检索性能远超全量内存扫描（O(log N) vs O(N)）

### 3.5 迁移策略

**不破坏现有数据：** 修改后首次启动时，检测 `vec_store.json` 是否存在，如果存在则迁移到 SQLite，如果已存在 SQLite 则直接使用。

---

## 四、路径修正：将数据移至 `src/rag/data/`

### 4.1 修正后的路径定义

所有 RAG 数据路径统一基于 `src/rag/` 目录：

```typescript
// src/rag/src/store.ts
const __dirname = fileURLToPath(import.meta.url)
const RAG_ROOT = path.resolve(__dirname, '../..')  // = src/rag/

export const UPLOAD_DIR     = path.resolve(RAG_ROOT, 'data/uploads')
export const VEC_STORE_PATH = path.resolve(RAG_ROOT, 'data/vec_store.db')   // SQLite
export const META_PATH      = path.resolve(RAG_ROOT, 'data/rag_meta.json')
export const KNOWLEDGE_DIR  = path.resolve(RAG_ROOT, 'data/init_docs')
```

### 4.2 文件移动操作

```bash
# 移动现有数据文件到 rag/data/
mv src/data/rag_meta.json  src/rag/data/rag_meta.json
mv src/data/vec_store.json src/rag/data/vec_store.json   # 如果要迁移
mv src/data/uploads/       src/rag/data/uploads/

# 移动初始化知识库文件
mv src/data/init_docs/     src/rag/data/init_docs/
```

### 4.3 .gitignore 修正

```:.gitignore
# rag data（修正路径）
/src/rag/data/*.db
/src/rag/data/*.json
/src/rag/data/uploads/
```

---

## 五、store.ts 问题分析与优化

### 5.1 问题列表

| # | 问题 | 严重程度 | 说明 |
|---|------|----------|------|
| P1 | `import 'dotenv/config'` 重复 3 次 | 低 | 代码整洁问题 |
| P2 | `import fs from 'fs'` 和 `import path from 'path'` 各写两次 | 低 | 代码整洁问题 |
| P3 | `__dirname` 重复计算，路径基准与 rag.ts 不一致 | **高** | 导致 KNOWLEDGE_DIR 错误 |
| P4 | `similaritySearch` 每次加载全量 store | **中** | 性能问题，数据量大时严重 |
| P5 | `removeSource` 全量重写入所有文档 | **中** | O(N) 删除操作 |
| P6 | `addDocuments` 对已存在 id 的处理是 findIndex 遍历 | **中** | O(N) 查找 |
| P7 | `_embedDimensions` 缓存为 module 级变量 | 低 | 合理，但线程不安全（Node.js 单线程无影响） |
| P8 | `cosineSimilarity` 对维度不匹配向量无校验 | **中** | 可能产生 NaN |

### 5.2 优化建议

**P3 修正：统一路径计算**

将 `RAG_ROOT` 提取为共享常量，或者在 `store.ts` 中导出 `RAG_ROOT` 供 `rag.ts` 使用：

```typescript
// store.ts
export const RAG_ROOT = path.resolve(__dirname, '../..')
export const KNOWLEDGE_DIR = path.resolve(RAG_ROOT, 'data/init_docs')

// rag.ts — 删除重复的 __dirname 和 KNOWLEDGE_DIR 定义
import { KNOWLEDGE_DIR, UPLOAD_DIR } from './store.js'
```

**P4/P5 优化：引入索引机制**

- 添加 `sourceFile` 索引（Map），快速定位属于某文件的所有 chunk
- 删除文件时直接按索引删除，避免全量重写

```typescript
// 内存索引加速
const _sourceIndex = new Map<string, Set<string>>()  // sourceFile -> set of ids

function indexBySource(entry: VecEntry) {
  if (!_sourceIndex.has(entry.source)) _sourceIndex.set(entry.source, new Set())
  _sourceIndex.get(entry.source)!.add(entry.id)
}
```

**P8 修正：维度校验**

```typescript
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`维度不匹配: ${a.length} vs ${b.length}`)
  }
  // ...
}
```

---

## 六、loader.ts 问题分析与优化

### 6.1 问题列表

| # | 问题 | 严重程度 | 说明 |
|---|------|----------|------|
| L1 | `splitter` 是 module 级实例，`chunkSize: 500` 硬编码 | 低 | 可配置化 |
| L2 | `.doc` 格式只打印警告返回空数组 | 低 | 可提示用户转换格式 |
| L3 | `parseXlsx` 中 `header: 1` 读取方式较底层 | 低 | 可读性稍差 |
| L4 | `loadFile` 返回空数组时无明确错误信息 | 低 | 调试困难 |

### 6.2 优化建议

**L1 优化：splitter 配置可注入**

```typescript
export interface SplitterConfig {
  chunkSize: number
  chunkOverlap: number
}

export function createSplitter(config: SplitterConfig) {
  return new RecursiveCharacterTextSplitter(config)
}

export const defaultSplitter = createSplitter({ chunkSize: 500, chunkOverlap: 100 })
```

**L4 优化：添加文件加载诊断信息**

```typescript
export async function loadFile(filePath: string, hintExt?: string): Promise<Document[]> {
  const ext = (hintExt ?? path.extname(filePath)).toLowerCase()
  if (!SUPPORTED_EXTS.has(ext)) {
    console.warn(`[rag/loader] 不支持格式: ${ext} (${filePath})`)
    return []
  }
  try {
    // ... 加载逻辑
  } catch (err) {
    console.error(`[rag/loader] 加载失败: ${filePath}`, err)
    return []
  }
}
```

---

## 七、rag.ts 问题分析与优化

### 7.1 问题列表

| # | 问题 | 严重程度 | 说明 |
|---|------|----------|------|
| R1 | `KNOWLEDGE_DIR` 独立定义，路径错误 | **高** | 导致 initKnowledge 失效 |
| R2 | `__dirname` 重复计算 | 低 | 与 store.ts 重复 |
| R3 | `ingestFile` 先写文件再删除，如果文件特别大浪费 IO | **中** | 可用 Buffer 直接处理 |
| R4 | `removeSource` 存在竞态：resetStore 后 addDocuments 之间崩溃会导致数据丢失 | **中** | 事务性问题 |

### 7.2 优化建议

**R1 修正：统一使用 store.ts 导出的路径**

```typescript
// rag.ts
import { KNOWLEDGE_DIR, UPLOAD_DIR, addDocuments } from './store.js'

// 删除以下行：
// const __dirname = fileURLToPath(import.meta.url)
// export const KNOWLEDGE_DIR = path.resolve(__dirname, '../../../data/init_docs')
```

**R3 优化：ingestFile 不落盘**

当前 `ingestFile` 将 Buffer 写入临时文件再加载，应该直接传 Buffer 给 loader：

```typescript
export async function ingestFile(
  buffer: Buffer, fileName: string, mimeType?: string
): Promise<{ chunkCount: number; textLength: number }> {
  await removeSource(fileName)
  
  // 直接从 Buffer 创建临时文件（或者修改 loadFile 支持 Buffer）
  fs.mkdirSync(UPLOAD_DIR, { recursive: true })
  const tmpPath = path.join(UPLOAD_DIR, fileName)
  try {
    fs.writeFileSync(tmpPath, buffer)
    // ... 其余逻辑
  } finally {
    fs.unlinkSync(tmpPath)
  }
}
```

> 注：LangChain 的 PDFLoader、DocxLoader 等需要文件路径，不支持直接读 Buffer，所以当前落盘方案是合理的。可以改为使用流式临时文件（Stream）减少大文件内存压力。

**R4 修正：添加事务保护**

```typescript
export async function removeSource(sourceFile: string): Promise<void> {
  const allDocs = await getAllDocuments()
  const keepDocs = allDocs.filter(d => d.metadata?.sourceFile !== sourceFile)
  
  // 原子操作：先备份，失败时恢复
  const backup = loadStore()
  resetStore()
  try {
    if (keepDocs.length > 0) await addDocuments(keepDocs)
    removeFileMeta(sourceFile)
  } catch (err) {
    // 恢复备份
    saveStore(backup)
    throw err
  }
}
```

---

## 八、upload.ts 问题分析与优化

### 8.1 问题列表

| # | 问题 | 严重程度 | 说明 |
|---|------|----------|------|
| U1 | `UPLOAD_DIR` 从 `./store.js` 导入，但路径指向 `src/data/uploads/` | **高** | 与用户期望 `src/rag/data/uploads/` 不一致 |
| U2 | `fs.mkdirSync(UPLOAD_DIR, { recursive: true })` 在模块顶层执行 | **中** | 启动时可能报目录已存在错误（Node.js 14+ 无问题，但不够优雅） |

### 8.2 优化建议

**U1 修正：upload.ts 使用统一的路径**

upload.ts 已经正确地从 `store.ts` 导入 `UPLOAD_DIR`，只需修正 `store.ts` 中的路径定义即可连带修正。

**U2 优化：懒加载目录创建**

```typescript
// 不在模块顶层创建目录，改为在需要时创建
export function ensureUploadDir() {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true })
}
```

---

## 九、整体架构优化建议

### 9.1 目录结构优化

当前：
```
src/
├── data/           # ❌ RAG 数据混在 src 根目录
│   ├── rag_meta.json
│   ├── vec_store.json
│   └── uploads/
├── rag/
│   ├── src/
│   │   ├── store.ts    # 路径定义指向 src/data/
│   │   └── rag.ts      # 路径定义指向 src/ 外
│   └── data/
│       └── init_docs/  # ✅ 初始化知识库在这里
```

建议：
```
src/
├── rag/
│   ├── src/
│   │   ├── store.ts    # ✅ 路径定义指向 src/rag/data/
│   │   ├── rag.ts      # ✅ 复用 store.ts 导出的路径
│   │   ├── loader.ts
│   │   ├── tools.ts
│   │   └── upload.ts
│   └── data/           # ✅ 所有 RAG 数据集中管理
│       ├── vec_store.db      # SQLite 向量库
│       ├── rag_meta.json     # 文件元数据
│       ├── uploads/          # 临时上传
│       └── init_docs/        # 初始化知识库
```

### 9.2 类型定义集中管理

建议在 `src/rag/src/` 下增加 `types.ts`，统一导出所有 RAG 相关类型：

```typescript
// src/rag/src/types.ts
export interface FileMeta { chunkCount: number; textLength: number }

export interface VecEntry {
  id: string
  content: string
  source: string
  metadata: string
  vector: number[]
}

export interface RagStats {
  totalFiles: number
  totalChunks: number
  files: { sourceFile: string; chunkCount: number }[]
}
```

### 9.3 错误处理统一化

当前各模块的错误处理不一致，建议：

```typescript
// src/rag/src/errors.ts
export class RagError extends Error {
  constructor(message: string, public code: string) { super(message) }
}

export class DocumentParseError extends RagError {
  constructor(fileName: string, cause: unknown) {
    super(`文档解析失败: ${fileName}`, 'PARSE_ERROR')
  }
}

export class VectorStoreError extends RagError {
  constructor(message: string, cause?: unknown) {
    super(message, 'VECTOR_STORE_ERROR')
  }
}
```

### 9.4 持久化层抽象

将持久化后端抽象为接口，便于未来切换：

```typescript
// src/rag/src/persistence.ts
export interface VectorStoreBackend {
  add(entries: VecEntry[]): Promise<void>
  search(queryVector: number[], topK: number): Promise<VecEntry[]>
  deleteBySource(sourceFile: string): Promise<void>
  getAll(): Promise<VecEntry[]>
  reset(): Promise<void>
}

// 实现1: JSON 文件（当前）
export class JsonFileBackend implements VectorStoreBackend { ... }

// 实现2: SQLite（推荐）
export class SqliteBackend implements VectorStoreBackend { ... }

// 实现3: HNSW
export class HnswBackend implements VectorStoreBackend { ... }
```

---

## 十、完整修改计划总结

### 阶段一：路径修正 + 数据迁移（低风险）

| 步骤 | 操作 | 变更文件 | 风险 |
|------|------|----------|------|
| 1.1 | 修正 `store.ts` 中路径定义 | `store.ts` | 低 |
| 1.2 | `rag.ts` 改用 `store.ts` 导出的路径 | `rag.ts` | 低 |
| 1.3 | 移动数据文件到 `src/rag/data/` | 文件系统 | 低 |
| 1.4 | 更新 `.gitignore` | `.gitignore` | 低 |

### 阶段二：持久化层升级（中风险）

| 步骤 | 操作 | 变更文件 | 风险 |
|------|------|----------|------|
| 2.1 | 安装 `hnswlib-node` | `package.json` | 低 |
| 2.2 | 创建 `persistence.ts` 抽象接口 | `persistence.ts` | 中 |
| 2.3 | 实现 `SqliteHnswBackend` | `sqlite-hnsw.ts` | 中 |
| 2.4 | 集成到 `store.ts` | `store.ts` | 中 |
| 2.5 | 数据迁移脚本（JSON → SQLite） | `migrate.ts` | 低 |

### 阶段三：代码清理（中风险）

| 步骤 | 操作 | 变更文件 | 风险 |
|------|------|----------|------|
| 3.1 | 删除 `store.ts` 重复 import | `store.ts` | 低 |
| 3.2 | 添加类型定义文件 `types.ts` | `types.ts` | 低 |
| 3.3 | 添加错误类 `errors.ts` | `errors.ts` | 低 |
| 3.4 | 简化 `rag.ts` 逻辑 | `rag.ts` | 低 |
| 3.5 | `ingestFile` 优化（事务保护） | `rag.ts` | 中 |

### 阶段四：验证测试（低风险）

| 步骤 | 操作 |
|------|------|
| 4.1 | `npm run dev` 启动无报错 |
| 4.2 | `initKnowledge()` 正常加载 `init_docs/` 中的文件 |
| 4.3 | 上传新文件，入库后 `vec_store.db` 正确更新 |
| 4.4 | 重启服务，向量数据不丢失 |
| 4.5 | 删除文件，向量数据正确移除 |
| 4.6 | `similaritySearch` 检索结果正确 |

---

*文档结束*
