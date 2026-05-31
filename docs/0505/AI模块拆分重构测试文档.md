# AI 模块拆分重构测试文档

> 日期：2026-05-05
> 涉及工程：idagent、idbackend、idfrontend、idfrontend-admin

---

## 一、测试前准备

### 1.1 确保服务启动

请确保以下服务已启动：

```bash
# 1. idbackend（Spring Boot，端口 8080）
cd idbackend
mvn spring-boot:run

# 2. idagent（Node.js，端口 3001）
cd idagent
npm run dev

# 3. idfrontend（Vite dev server，端口 5173）
cd idfrontend
npm run dev

# 4. idfrontend-admin（Vite dev server）
cd idfrontend-admin
npm run dev
```

### 1.2 测试账号

准备至少两个账号：
- **学生账号**：用于测试 AI 聊天和 AI 申请
- **管理员账号**：用于测试后台 AI 管理

---

## 二、后端接口测试

### 2.1 AI 聊天助手（/api/aichat）

> 新路径，前端已切换；旧路径（/api/ai/agent/*）保持兼容

| 序号 | 接口 | 方法 | 新路径 | 旧路径（兼容） | 测试要点 |
|------|------|------|--------|----------------|----------|
| T-01 | 聊天流式对话 | POST | `/api/aichat/stream` | `/api/ai/agent/stream` | 发送消息，验证 SSE token 正常返回 |
| T-02 | 聊天恢复 | POST | `/api/aichat/resume-stream` | `/api/ai/agent/resume-stream` | 发送补充信息，验证流程继续 |
| T-03 | 会话列表 | GET | `/api/aichat/conversation/list` | `/api/ai/conversation/list` | 验证返回历史会话列表 |
| T-04 | 搜索会话 | GET | `/api/aichat/conversation/search?keyword=xxx` | `/api/ai/conversation/search` | 验证关键词搜索正常 |
| T-05 | 创建会话 | POST | `/api/aichat/conversation/create` | `/api/ai/conversation/create` | 验证返回 sessionId |
| T-06 | 获取会话消息 | GET | `/api/aichat/conversation/{sessionId}/messages` | `/api/ai/conversation/.../messages` | 验证历史消息正常返回 |
| T-07 | 删除会话 | DELETE | `/api/aichat/conversation/{sessionId}` | `/api/ai/conversation/...` | 验证删除后列表更新 |
| T-08 | 知识库列表 | GET | `/api/aichat/knowledge/list` | `/api/ai/knowledge/list` | 验证返回文件列表 |
| T-09 | 知识库统计 | GET | `/api/aichat/knowledge/stats` | `/api/ai/knowledge/stats` | 验证返回分块统计 |
| T-10 | 知识库上传 | POST | `/api/aichat/knowledge/upload` | `/api/ai/knowledge/upload` | 上传 PDF，验证成功返回 |
| T-11 | 知识库删除 | DELETE | `/api/aichat/knowledge/{sourceFile}` | `/api/ai/knowledge/...` | 删除文件，验证列表更新 |
| T-12 | AI 配置查询 | GET | `/api/aichat/config` | `/api/ai/config` | 验证返回配置（含 apiKey 掩码） |
| T-13 | AI 配置更新 | PUT | `/api/aichat/config` | `/api/ai/config` | 更新配置，验证生效 |

**T-01 详细测试步骤**：

```bash
# 使用 curl 测试流式接口
curl -X POST http://localhost:8080/api/aichat/stream \
  -H "Authorization: Bearer <token>" \
  -F "message=你好" \
  -F "sessionId=chat_test_123"
# 预期：返回 SSE 流，包含 sessionId token 和 AI 回复
```

### 2.2 AI 申请助手（/api/aiapply）

> 新路径，前端通过 `intent=apply` 参数使用；旧路径（/api/ai/analyze/*）保持兼容

| 序号 | 接口 | 方法 | 新路径 | 旧路径（兼容） | 测试要点 |
|------|------|------|--------|----------------|----------|
| T-20 | 申请流式对话 | POST | `/api/aiapply/stream` | — | intent=apply，进入申请流程 |
| T-21 | 申请恢复 | POST | `/api/aiapply/resume-stream` | — | 上传材料后继续提交流程 |
| T-22 | 证书分析 | POST | `/api/aiapply/certificate` | `/api/ai/analyze/certificate` | 上传 PDF，返回加分推荐 |
| T-23 | 生成申请 | POST | `/api/aiapply/generate` | `/api/ai/analyze/generate` | 生成预填数据 |

**T-20 详细测试步骤**：

```bash
# 测试申请入口（intent=apply）
curl -X POST http://localhost:8080/api/aiapply/stream \
  -H "Authorization: Bearer <token>" \
  -F "message=我想申请数学竞赛加分" \
  -F "sessionId=apply_test_456" \
  -F "intent=apply"
# 预期：直接进入申请流程，返回推荐加分项
```

### 2.3 旧路径兼容性测试

确保以下旧路径仍然可用（向后兼容）：

| 序号 | 旧路径 | 对应新路径 | 验证方法 |
|------|--------|------------|----------|
| T-30 | `/api/ai/agent/stream` | `/api/aichat/stream` | 发送请求，验证返回 200 和 SSE 流 |
| T-31 | `/api/ai/conversation/list` | `/api/aichat/conversation/list` | 发送请求，验证返回会话列表 |
| T-32 | `/api/ai/analyze/certificate` | `/api/aiapply/certificate` | 上传 PDF，验证返回加分推荐 |

---

## 三、前端功能测试（idfrontend）

### 3.1 AI 聊天助手（/home/ai-chat）

| 序号 | 功能点 | 测试步骤 | 预期结果 |
|------|--------|----------|----------|
| F-01 | 悬浮按钮显示 | 登录后查看页面右下角 | 显示 AI 助手悬浮按钮 |
| F-02 | 悬浮按钮拖拽 | 按住按钮拖动 | 按钮位置变化，且关闭页面后重开仍保持位置 |
| F-03 | 打开对话框 | 点击悬浮按钮 | 弹出 AI 助手对话框 |
| F-04 | 发送消息 | 输入"你好"并发送 | AI 返回回复消息气泡 |
| F-05 | 流式响应 | 发送一条消息 | 消息逐字显示（流式效果） |
| F-06 | 历史会话列表 | 点击菜单按钮打开历史列表 | 显示历史会话卡片列表 |
| F-07 | 选择历史会话 | 点击某条历史会话 | 加载该会话的所有历史消息 |
| F-08 | 删除会话 | 点击历史会话的删除按钮 | 会话从列表消失 |
| F-09 | 新建对话 | 点击"新对话"按钮 | 清空当前消息，开启新会话 |
| F-10 | 新路径验证 | 发送消息并观察 Network | 请求发往 `/api/aichat/stream` |

### 3.2 AI 申请（/home/score/index）

> 申请加分功能已集成在 score/index.vue，ai-apply 模块已移除

| 序号 | 功能点 | 测试步骤 | 预期结果 |
|------|--------|----------|----------|
| F-20 | AI 智能申请入口 | 进入加分申请页面 | 显示"AI 智能申请"入口卡片 |
| F-21 | 打开 AI 申请对话框 | 点击"AI 智能申请"按钮 | 弹出 AI 申请对话框 |
| F-22 | 发送申请消息 | 在对话框输入"我想申请数学竞赛加分" | AI 返回推荐加分项列表 |
| F-23 | 选择加分项 | 在匹配结果中点击某项 | 高亮选中该项 |
| F-24 | 上传证明材料 | 在 FileTable 上传 PDF | 文件显示在证明材料列表 |
| F-25 | 确认提交 | 点击"确认提交"按钮 | 发起 `/api/aichat/stream`（intent=apply），申请提交成功 |
| F-26 | 手动申请流程 | 选择一个加分模板 | 原有 CONDITION/TRANSFORM 申请流程正常 |
| F-27 | 申请记录 | 进入"申请记录"页面 | 能看到刚才提交或 AI 提交的申请 |

### 3.3 路由验证

| 序号 | 验证点 | 操作 | 预期 |
|------|--------|------|------|
| F-30 | ai-apply 路由移除 | 访问 `/home/ai-apply` | 页面 Not Found 或重定向 |
| F-31 | ai-chat 路由生效 | 访问 `/home/ai-chat` | 显示 AI 助手页面 |
| F-32 | 导航菜单 | 查看侧边栏 | 显示"AI助手"菜单项（不再是"AIagent"） |

---

## 四、后台管理测试（idfrontend-admin）

### 4.1 AI 聊天助手（/home/ai-chat）

| 序号 | 功能点 | 测试步骤 | 预期结果 |
|------|--------|----------|----------|
| A-01 | 悬浮按钮显示 | 管理员登录后查看右下角 | 显示 AI 助手悬浮按钮 |
| A-02 | 管理员对话 | 输入"如何添加新模板" | AI 返回系统操作指导 |
| A-03 | 路由名称 | 查看左侧菜单 | 显示"AI助手"（不再是"AIagent"） |

### 4.2 AI 管理（/home/ai-manage）

| 序号 | 功能点 | 测试步骤 | 预期结果 |
|------|--------|----------|----------|
| A-10 | AI 配置查看 | 进入 AI 管理 → AI 配置 | 显示当前 AI 配置（apiKey 掩码） |
| A-11 | AI 配置更新 | 修改模型参数并保存 | 提示"配置已更新" |
| A-12 | 知识库文件列表 | 进入 AI 管理 → AI 知识库 | 显示已上传的文档列表 |
| A-13 | 上传知识库文档 | 上传一个新的 PDF 文档 | 文档出现在列表中，分块数增加 |
| A-14 | 删除知识库文档 | 删除某个文档 | 文档从列表消失 |

---

## 五、边界与异常测试

### 5.1 网络异常

| 序号 | 场景 | 测试步骤 | 预期结果 |
|------|------|----------|----------|
| E-01 | idagent 宕机 | 停止 idagent 服务后发送消息 | 前端显示"Agent 不可达"或类似错误提示 |
| E-02 | 网络超时 | 模拟慢速响应 | 前端显示超时错误，不卡死 |

### 5.2 参数异常

| 序号 | 场景 | 测试步骤 | 预期结果 |
|------|------|----------|----------|
| E-10 | 空消息 | 发送空字符串 | 后端返回"消息不能为空"，前端提示 |
| E-11 | 超长消息 | 发送超长文本（如 10000 字） | 正常处理或提示超出限制 |
| E-12 | 无效 sessionId | 使用不存在的 sessionId | 后端正常处理（新建会话或报错） |
| E-13 | 未登录访问 | 清除 token 后访问 | 后端返回 401，前端跳转登录页 |

---

## 六、回归测试清单

确保以下原有功能**未受影响**：

### 6.1 申请流程（手动）

- [ ] 选择 CONDITION 模板 → 属性选择 → 证明材料上传 → 提交申请
- [ ] 选择 TRANSFORM 模板 → 输入数值 → 换算分数 → 证明材料上传 → 提交申请
- [ ] 申请记录查看
- [ ] 驳回后重新提交

### 6.2 审核流程（管理员）

- [ ] 待审核列表分页加载
- [ ] 审核通过（所有证明材料均审核后）
- [ ] 驳回申请
- [ ] 审核历史查看

### 6.3 其他功能

- [ ] 文件上传下载
- [ ] 用户登录登出
- [ ] 模板管理
- [ ] 字段配置管理

---

## 七、测试结果记录

| 测试编号 | 测试结果 | 问题描述 | 修复状态 |
|----------|----------|----------|----------|
| T-01 | ⬜ 未测 / ✅ 通过 / ❌ 失败 |  |  |
| T-02 | ⬜ 未测 / ✅ 通过 / ❌ 失败 |  |  |
| T-03 | ⬜ 未测 / ✅ 通过 / ❌ 失败 |  |  |
| T-04 | ⬜ 未测 / ✅ 通过 / ❌ 失败 |  |  |
| T-05 | ⬜ 未测 / ✅ 通过 / ❌ 失败 |  |  |
| T-06 | ⬜ 未测 / ✅ 通过 / ❌ 失败 |  |  |
| T-07 | ⬜ 未测 / ✅ 通过 / ❌ 失败 |  |  |
| T-08 | ⬜ 未测 / ✅ 通过 / ❌ 失败 |  |  |
| T-09 | ⬜ 未测 / ✅ 通过 / ❌ 失败 |  |  |
| T-10 | ⬜ 未测 / ✅ 通过 / ❌ 失败 |  |  |
| T-11 | ⬜ 未测 / ✅ 通过 / ❌ 失败 |  |  |
| T-12 | ⬜ 未测 / ✅ 通过 / ❌ 失败 |  |  |
| T-13 | ⬜ 未测 / ✅ 通过 / ❌ 失败 |  |  |
| T-20 | ⬜ 未测 / ✅ 通过 / ❌ 失败 |  |  |
| T-21 | ⬜ 未测 / ✅ 通过 / ❌ 失败 |  |  |
| T-22 | ⬜ 未测 / ✅ 通过 / ❌ 失败 |  |  |
| T-23 | ⬜ 未测 / ✅ 通过 / ❌ 失败 |  |  |
| T-30 | ⬜ 未测 / ✅ 通过 / ❌ 失败 |  |  |
| T-31 | ⬜ 未测 / ✅ 通过 / ❌ 失败 |  |  |
| T-32 | ⬜ 未测 / ✅ 通过 / ❌ 失败 |  |  |
| F-01 | ⬜ 未测 / ✅ 通过 / ❌ 失败 |  |  |
| F-02 | ⬜ 未测 / ✅ 通过 / ❌ 失败 |  |  |
| F-03 | ⬜ 未测 / ✅ 通过 / ❌ 失败 |  |  |
| F-04 | ⬜ 未测 / ✅ 通过 / ❌ 失败 |  |  |
| F-05 | ⬜ 未测 / ✅ 通过 / ❌ 失败 |  |  |
| F-06 | ⬜ 未测 / ✅ 通过 / ❌ 失败 |  |  |
| F-07 | ⬜ 未测 / ✅ 通过 / ❌ 失败 |  |  |
| F-08 | ⬜ 未测 / ✅ 通过 / ❌ 失败 |  |  |
| F-09 | ⬜ 未测 / ✅ 通过 / ❌ 失败 |  |  |
| F-10 | ⬜ 未测 / ✅ 通过 / ❌ 失败 |  |  |
| F-20 | ⬜ 未测 / ✅ 通过 / ❌ 失败 |  |  |
| F-21 | ⬜ 未测 / ✅ 通过 / ❌ 失败 |  |  |
| F-22 | ⬜ 未测 / ✅ 通过 / ❌ 失败 |  |  |
| F-23 | ⬜ 未测 / ✅ 通过 / ❌ 失败 |  |  |
| F-24 | ⬜ 未测 / ✅ 通过 / ❌ 失败 |  |  |
| F-25 | ⬜ 未测 / ✅ 通过 / ❌ 失败 |  |  |
| F-26 | ⬜ 未测 / ✅ 通过 / ❌ 失败 |  |  |
| F-27 | ⬜ 未测 / ✅ 通过 / ❌ 失败 |  |  |
| A-01 | ⬜ 未测 / ✅ 通过 / ❌ 失败 |  |  |
| A-10 | ⬜ 未测 / ✅ 通过 / ❌ 失败 |  |  |
| A-11 | ⬜ 未测 / ✅ 通过 / ❌ 失败 |  |  |
| A-12 | ⬜ 未测 / ✅ 通过 / ❌ 失败 |  |  |
| A-13 | ⬜ 未测 / ✅ 通过 / ❌ 失败 |  |  |
| A-14 | ⬜ 未测 / ✅ 通过 / ❌ 失败 |  |  |

---

## 八、测试通过标准

- [ ] 所有后端接口（T-01 ~ T-32）返回正确状态码和数据
- [ ] 所有前端功能（F-01 ~ F-27）按预期运行
- [ ] 所有后台管理功能（A-01 ~ A-14）按预期运行
- [ ] 所有边界异常（E-01 ~ E-13）有合理的错误提示，不崩溃
- [ ] 所有回归测试（6.1 ~ 6.3）原有功能未受影响
- [ ] 旧路径（/api/ai/agent/*、/api/ai/conversation/*、/api/ai/analyze/*）完全向后兼容
