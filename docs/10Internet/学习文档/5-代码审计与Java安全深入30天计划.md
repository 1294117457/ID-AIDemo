# 代码审计与 Java 安全深入 30 天计划（Day 121-150）

> 对应《04_白帽学习路线与技术栈规划》第六阶段前半。
> 前提：已具备实战渗透能力，有 SRC 和 CTF 经验，准备向代码审计方向深入。

---

## 总体目标

| 周 | 主题 | 达成标准 |
|----|------|---------|
| 第 17 周 | 代码审计方法论 + PHP 审计入门 | 能对 PHP 项目做基础安全审计 |
| 第 18 周 | Java 代码审计 | 能审计 Spring Boot 项目的常见安全问题 |
| 第 19 周 | Java 高级安全：Gadget 链 + 内存马 | 理解 Java 反序列化链的构造原理 |
| 第 20 周 | 实战审计 + 漏洞挖掘 | 对开源项目做完整安全审计并产出报告 |

---

## 本月新增长期核心技能

| 技能 | 为什么重要 | 熟练标准 |
|------|-----------|---------|
| ⭐ **代码审计思维** | 从源码层面发现漏洞，比黑盒渗透更深入 | 看到代码能快速定位危险函数和数据流 |
| ⭐ **Java 安全知识** | Java 是企业级应用的主流语言 | 理解 Spring 安全机制、反序列化链、JNDI |
| ⭐ **静态分析工具** | 辅助快速定位代码中的安全问题 | 能使用 Semgrep / CodeQL 编写规则 |

---

# 第十七周：代码审计方法论 + PHP 审计

## Day 121 — 代码审计方法论

### 今日任务
- [ ] 学习代码审计的两种基本方法：
  - **正向追踪（数据流跟踪）**：从用户输入（Source）出发，追踪数据如何流向危险函数（Sink）
  - **逆向追踪**：从危险函数出发，反向追踪哪些用户输入可以到达这里
- [ ] 理解 Source 和 Sink 的概念：
  - Source：用户可控的输入点（请求参数、Header、Cookie、文件上传、数据库读取）
  - Sink：危险函数（SQL 查询、命令执行、文件操作、反序列化、模板渲染）
- [ ] 学习审计的基本流程：搭建环境 → 理解架构 → 找入口点 → 追踪数据流 → 验证漏洞

### 今日积累
- ⭐ 代码审计 = 找到从 Source 到 Sink 的可控路径
- 开发者的优势：你能读懂代码结构、理解框架的路由和中间件机制
- 审计效率：优先审计认证/权限/文件/数据库/命令执行相关的代码

---

## Day 122 — PHP 审计入门：危险函数

### 今日任务
- [ ] 学习 PHP 中的危险函数分类：
  - 命令执行：`system()`, `exec()`, `passthru()`, `shell_exec()`, 反引号
  - 代码执行：`eval()`, `assert()`, `preg_replace(/e)`
  - 文件操作：`include()`, `require()`, `file_get_contents()`, `fopen()`, `unlink()`
  - SQL 查询：直接拼接 `$_GET` / `$_POST` 到 SQL 语句
  - 反序列化：`unserialize()`
- [ ] 用 `grep` 在 PHP 项目中搜索这些危险函数
- [ ] 下载一个有已知漏洞的 PHP CMS（如 DedeCMS、ThinkPHP 旧版本）

### 今日积累
- PHP 审计的核心：搜索危险函数 → 反向追踪参数来源 → 判断是否可控
- PHP 超全局变量（Source）：`$_GET`, `$_POST`, `$_COOKIE`, `$_REQUEST`, `$_SERVER`, `$_FILES`

### 今日练习
在下载的 PHP CMS 中搜索所有 `eval()` 和 `system()` 调用，追踪其参数来源。

---

## Day 123 — PHP 实战审计：ThinkPHP / Laravel

### 今日任务
- [ ] 选择一个 ThinkPHP 或 Laravel 项目，分析其路由机制
- [ ] 审计认证和权限控制：是否有未登录即可访问的敏感接口
- [ ] 审计 SQL 查询：是否有 ORM 绕过或原始查询拼接的地方
- [ ] 复现一个已知的 ThinkPHP 历史漏洞（如 5.x RCE）

### 今日积累
- 框架审计的关键：理解路由 → 找到控制器 → 追踪参数到模型层
- ThinkPHP 历史上有多个 RCE 漏洞，是学习 PHP 审计的好案例
- 即使用了 ORM，`whereRaw()`、`DB::raw()` 等方法仍可能导致注入

---

## Day 124 — 静态分析工具：Semgrep

### 今日任务
- [ ] 安装 Semgrep：`pip install semgrep`
- [ ] 学习 Semgrep 基本用法：用预定义规则扫描项目
- [ ] 学习编写自定义 Semgrep 规则（YAML 格式）
- [ ] 对 PHP 项目和 Java 项目分别运行 Semgrep 扫描

### 今日积累
- Semgrep 比 `grep` 更智能 — 它理解代码语法结构，减少误报
- 自定义规则示例：匹配所有直接拼接 SQL 的代码模式
- Semgrep 支持 Java、Python、JavaScript、PHP 等多种语言

### 今日练习
编写一条 Semgrep 规则，检测 Java 项目中直接拼接 SQL 字符串的代码。

---

## Day 125 — 代码审计：认证与权限

### 今日任务
- [ ] 系统学习认证相关的审计要点：
  - 密码存储：是否用了安全的哈希（bcrypt/scrypt），是否加盐
  - 密码重置：重置 token 是否可预测、是否有过期时间
  - Session 管理：Session ID 是否足够随机、是否有固定会话攻击
  - JWT 实现：密钥管理、算法验证、过期时间
- [ ] 权限相关审计要点：
  - 接口是否有权限注解/中间件保护
  - 数据查询是否绑定了当前用户 ID（防越权）
  - 管理接口是否仅限管理员访问

### 今日积累
- ⭐ 认证和权限问题是代码审计中最高价值的发现
- 审计技巧：搜索所有不需要登录就能访问的路由（查找缺少权限注解的 Controller 方法）

### 今日练习
审计你自己的 Spring Boot 项目的认证和权限实现。

---

## Day 126 — PHP 审计综合练习

### 今日任务
- [ ] 从 GitHub 选择一个小型 PHP 项目（如开源 Blog / CMS）
- [ ] 做完整的安全审计：认证、注入、文件操作、反序列化
- [ ] 输出审计报告
- [ ] 如果发现漏洞，在本地环境验证

---

## Day 127 — 第十七周复习

### 今日任务
- [ ] 回顾代码审计方法论
- [ ] **第十七周复习**

### 第十七周检查清单
- [ ] 理解 Source-Sink 模型
- [ ] 能识别 PHP 中的危险函数
- [ ] 能使用 Semgrep 做自动化扫描
- [ ] 能对 PHP 项目做基础安全审计
- [ ] 完成了至少一个项目的审计报告

---

# 第十八周：Java 代码审计

## Day 128 — Java Web 项目结构分析

### 今日任务
- [ ] 复习 Spring Boot 项目结构：Controller → Service → Mapper/Repository
- [ ] 理解 Spring 的请求处理流程：DispatcherServlet → HandlerMapping → Controller → ViewResolver
- [ ] 学习 Spring Security 的认证和授权机制
- [ ] 分析 Maven/Gradle 依赖，识别可能有漏洞的依赖版本

### 今日积累
- Java 审计的入口点：`@Controller`、`@RestController` 中的 `@RequestMapping` 方法
- 参数绑定：`@RequestParam`、`@PathVariable`、`@RequestBody` — 这些就是 Source
- 依赖检查工具：`mvn dependency:tree`、OWASP Dependency-Check

---

## Day 129 — Java SQL 注入审计

### 今日任务
- [ ] 学习 Java 中 SQL 注入的审计要点：
  - MyBatis 中的 `${}` vs `#{}`：`${}` 直接拼接，`#{}` 参数化
  - JPA 的 `@Query` 中使用原生 SQL
  - `JdbcTemplate` 的字符串拼接
  - `String.format()` 拼接 SQL
- [ ] 在你自己的项目中搜索所有 `${}` 和原生 SQL 查询
- [ ] 验证是否存在注入风险

### 今日积累
- ⭐ MyBatis `${}` 是 Java 项目中 SQL 注入最常见的来源
- 审计命令：`grep -rn "\${" src/main/resources/mapper/`
- 需要用 `${}` 的场景（如 ORDER BY 动态排序）应该用白名单过滤

### 今日练习
审计你项目中所有 Mapper XML 文件的 SQL 语句。

---

## Day 130 — Java 反序列化审计

### 今日任务
- [ ] 学习 Java 反序列化审计要点：
  - 搜索 `ObjectInputStream.readObject()` 调用
  - 检查 classpath 中是否存在已知的 Gadget 链依赖（Commons Collections、Commons Beanutils 等）
  - 检查 Fastjson/Jackson 的版本和 AutoType 配置
  - 检查自定义的 `readObject()` 方法
- [ ] 学习 Java 反序列化防御：`ObjectInputFilter`、移除不必要的 Gadget 依赖

### 今日积累
- 反序列化审计三步走：找反序列化入口 → 检查 Gadget 依赖 → 验证利用
- Fastjson 审计：搜索 `JSON.parseObject()` 和 `JSON.parse()`，检查版本和 AutoType 配置
- Jackson 审计：检查 `enableDefaultTyping()` 配置

---

## Day 131 — Spring 框架特有漏洞审计

### 今日任务
- [ ] 审计 SpEL 注入：搜索 `SpelExpressionParser` 和 `#{...}` 表达式中使用用户输入的地方
- [ ] 审计 Spring Boot Actuator 配置：是否暴露了敏感端点
- [ ] 审计 CORS 配置：是否允许了过于宽泛的来源
- [ ] 审计 Spring Security 配置：是否有路由绕过（如 `/admin` 受保护但 `/admin/` 或 `/admin;` 不受保护）

### 今日积累
- Spring Security 路径匹配问题：`AntPathMatcher` vs `PathPatternParser` 在尾部斜杠和分号处理上有差异
- CORS 配置 `allowedOrigins("*")` + `allowCredentials(true)` 是危险组合
- SpEL 注入可以导致 RCE

### 今日练习
审计你项目中的 `SecurityConfig` 和 `WebConfig` 配置。

---

## Day 132 — Java 文件操作 + SSRF 审计

### 今日任务
- [ ] 审计文件上传：检查后缀白名单、文件类型验证、存储路径
- [ ] 审计文件下载：检查路径拼接是否可以路径穿越（`../../../etc/passwd`）
- [ ] 审计 SSRF：搜索 `URL`、`HttpClient`、`RestTemplate`、`OkHttpClient` 等网络请求，检查 URL 是否用户可控
- [ ] 审计模板注入：Thymeleaf、Freemarker 中使用用户输入的场景

### 今日积累
- 文件下载路径穿越审计：搜索 `new File(base + userInput)` 模式
- SSRF 审计：搜索所有发起 HTTP 请求的代码，追踪 URL 参数来源
- Thymeleaf SSTI：`__${...}__` 预处理表达式可能导致 RCE

---

## Day 133 — OWASP Dependency-Check + 依赖安全

### 今日任务
- [ ] 安装并运行 OWASP Dependency-Check 扫描你的 Java 项目
- [ ] 分析报告中的已知漏洞（CVE）
- [ ] 判断哪些漏洞是真正可利用的，哪些是误报
- [ ] 学习 `mvn versions:display-dependency-updates` 检查依赖更新

### 今日积累
- 供应链安全是现代应用安全的重要组成部分
- 不是所有 CVE 都可利用 — 需要判断是否触及了有漏洞的功能
- 定期更新依赖是最基本的安全实践

---

## Day 134 — 第十八周复习

### 今日任务
- [ ] 回顾 Java 审计全流程
- [ ] **第十八周复习**

### 第十八周检查清单
- [ ] 能识别 MyBatis `${}` 注入
- [ ] 能审计 Java 反序列化入口
- [ ] 能审计 Spring Security 配置
- [ ] 能审计文件操作和 SSRF
- [ ] 能使用 Dependency-Check 做依赖扫描

---

# 第十九周：Java 高级安全

## Day 135 — Java Gadget 链分析原理

### 今日任务
- [ ] 深入理解 Gadget 链的构造原理：通过链式调用多个类的方法，最终触发危险操作
- [ ] 分析 CommonsCollections1 链的完整调用过程
- [ ] 理解 `Transformer`、`InvokerTransformer`、`ChainedTransformer` 的作用
- [ ] 学习用 `SerializationDumper` 解析序列化数据结构

### 今日积累
- Gadget 链的本质：利用 Java 多态和反射机制，在反序列化时自动触发的方法链
- CC1 链简化流程：`BadAttributeValueExpException.readObject()` → `TiedMapEntry.toString()` → `LazyMap.get()` → `ChainedTransformer.transform()` → `Runtime.exec()`

---

## Day 136 — 更多 Gadget 链 + 链构造思路

### 今日任务
- [ ] 分析 CommonsCollections6（不依赖 JDK 版本限制的通用链）
- [ ] 分析 CommonsBeanutils 链
- [ ] 了解 Gadget 链挖掘工具：`GadgetInspector`
- [ ] 理解链构造的通用思路：找 kick-off gadget → 中间连接 → 最终触发 sink

### 今日积累
- 不同链适用于不同 JDK 版本和依赖组合
- 链构造的本质是在 classpath 中寻找可以串联的方法调用
- 这是安全研究的高级领域，深入理解后可以挖掘新的反序列化漏洞

---

## Day 137 — Java 内存马

### 今日任务
- [ ] 理解内存马的概念：不落地到文件，直接注入到 JVM 运行时的 WebShell
- [ ] 学习常见内存马类型：Filter 型、Servlet 型、Listener 型、Agent 型
- [ ] 理解内存马的注入方式：通过反序列化/JNDI 注入将 WebShell 注册到 Web 容器
- [ ] 了解内存马的检测和防御

### 今日积累
- 内存马比传统文件 WebShell 更隐蔽（文件系统上没有痕迹）
- Filter 型内存马：动态注册一个恶意 Filter，拦截所有请求
- 检测思路：对比运行时的 Filter/Servlet 列表和 web.xml 中的配置

---

## Day 138 — JNDI 注入深入 + 高版本 JDK 绕过

### 今日任务
- [ ] 复习 JNDI 注入原理
- [ ] 学习高版本 JDK（8u191+）对 JNDI 远程类加载的限制
- [ ] 学习绕过方式：本地 Gadget + LDAP 返回序列化数据、EL 表达式、BeanFactory
- [ ] 了解 JNDI 注入的最新研究进展

### 今日积累
- JDK 8u191+ 默认禁止了 RMI/LDAP 远程类加载
- 绕过思路：让 LDAP 返回序列化数据，利用目标 classpath 中已有的 Gadget 链触发
- 这解释了为什么 classpath 中的 Gadget 依赖如此重要

---

## Day 139 — Java Agent 技术与安全应用

### 今日任务
- [ ] 理解 Java Agent 机制：通过 `Instrumentation API` 在运行时修改字节码
- [ ] 理解 Java Agent 的安全应用：RASP（运行时应用自保护）
- [ ] 理解 Java Agent 的攻击应用：Agent 型内存马
- [ ] 了解 RASP 产品：OpenRASP

### 今日积累
- Java Agent 可以在运行时 hook 任何 Java 方法
- 防御方面：RASP 在危险函数调用时做安全检查（比 WAF 更精确）
- 攻击方面：通过 Agent 注入内存马，连 Filter 注册都不需要

---

## Day 140 — CodeQL 入门

### 今日任务
- [ ] 安装 CodeQL CLI 和 VS Code 插件
- [ ] 学习 CodeQL 的基本概念：数据库、查询、Source、Sink、数据流分析
- [ ] 运行预定义的 Java 安全查询
- [ ] 编写一个简单的自定义查询（如查找 SQL 拼接）

### 今日积累
- CodeQL 是 GitHub 开源的语义代码分析引擎，做代码审计的利器
- CodeQL 可以做 Source-Sink 的数据流追踪，自动找到漏洞路径
- 学会 CodeQL 是代码审计方向的核心竞争力之一

---

## Day 141 — 第十九周复习

### 今日任务
- [ ] 回顾 Java 高级安全主题
- [ ] **第十九周复习**

### 第十九周检查清单
- [ ] 能解释 CommonsCollections 链的调用过程
- [ ] 理解内存马的概念和类型
- [ ] 理解高版本 JDK 对 JNDI 的限制和绕过
- [ ] 能使用 CodeQL 做基础代码分析

---

# 第二十周：实战审计 + 总结

## Day 142 — 开源项目审计（上）

### 今日任务
- [ ] 从 GitHub 选择一个中型 Java 开源项目（如 Ruoyi、Jeecg-Boot、Halo 等）
- [ ] 搭建运行环境
- [ ] 分析项目架构：框架版本、依赖列表、认证机制、数据库访问层

---

## Day 143 — 开源项目审计（中）

### 今日任务
- [ ] 运行 Semgrep 和 Dependency-Check 做自动化扫描
- [ ] 手工审计重点模块：登录认证、文件上传、用户管理、权限控制
- [ ] 追踪可疑的 Source-Sink 路径

---

## Day 144 — 开源项目审计（下）

### 今日任务
- [ ] 验证发现的潜在漏洞
- [ ] 在本地环境复现
- [ ] 编写完整审计报告

---

## Day 145 — 审计报告撰写

### 今日任务
- [ ] 按专业格式撰写完整的代码审计报告：
  - 项目概述
  - 审计范围和方法
  - 发现的漏洞列表（按风险等级排序）
  - 每个漏洞的详细分析（代码位置、利用方式、影响、修复建议）
  - 总结和建议

### 今日积累
- 代码审计报告要指出具体的代码文件和行号
- 修复建议要具体可操作，而不是笼统的"加强输入校验"

---

## Day 146-148 — 持续 SRC 挖洞 + CTF

### 任务
- [ ] 继续挖 SRC 漏洞，重点用代码审计的思维分析目标
- [ ] 如果目标有开源组件，做白盒审计
- [ ] 刷 CTF 代码审计类题目

---

## Day 149 — 五个月总复习

### 今日任务
- [ ] 回顾代码审计全部知识
- [ ] 更新个人安全知识图谱

### 代码审计能力检查清单
- [ ] 掌握 Source-Sink 审计方法论
- [ ] 能审计 PHP 和 Java 项目
- [ ] 能使用 Semgrep / CodeQL / Dependency-Check
- [ ] 完成了至少一个完整的开源项目审计
- [ ] 理解 Java 反序列化链的构造原理
- [ ] 理解内存马概念

---

## Day 150 — 下阶段规划

### 下月方向
- AI 安全：Prompt Injection、Agent 安全、LLM 应用渗透
- Web3 安全：智能合约审计、DeFi 安全
- 利用你的 AI Agent 和 Web3 开发经验，进入这些新兴安全方向
