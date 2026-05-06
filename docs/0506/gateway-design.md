# 网关重构方案 — Spring Cloud Gateway

> 文档版本：v1.1
> 日期：2026-05-06
> 状态：待审核
> 更新说明：v1.1 简化路由为两条，白名单精简，移除 /internal/** 设计，改为 Agent 返回数据给前端提交

---

## 一、目标

将鉴权与路由逻辑从 Java 后端（idbackend）中剥离，新建独立网关服务（idgateway），统一处理：

1. **JWT 鉴权**：验证前端请求的 Access Token
2. **路由分发**：将请求转发到对应的下游服务（两条路由，极简）
3. **用户上下文传递**：提取 userId 并注入到请求头中传递给下游
4. **SSE 流式透传**：零拷贝透传 Agent 的流式响应

---

## 二、架构设计

### 2.1 重构前架构

```
┌────────────────────────────────────────────────────────────────────┐
│                          重构前                                      │
│                                                                     │
│   前端(5173) → Java后端(8080)                                      │
│                    ├─ AuthInterceptor (JWT验证)                      │
│                    ├─ /api/authserver/** (公开,不过拦截器)           │
│                    ├─ /api/chat/**        (公开, @PublicAccess)     │
│                    ├─ /api/**             (需JWT, role校验)          │
│                    ├─ /api/ai/**          (代理转发到 idagent:3001) │
│                    └─ /internal/agent/submit (agent直调落库)         │
│                                                                     │
│   前端 → idagent(3001)                                             │
│           └─ 无鉴权, 依赖 Java后端传递 x-user-id                    │
└────────────────────────────────────────────────────────────────────┘
```

### 2.2 重构后架构

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              重构后                                           │
│                                                                              │
│  前端(5173)                                                                 │
│      │                                                                       │
│      │  所有请求走 idgateway:8080                                             │
│      ▼                                                                       │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                    idgateway (8080)  ← 唯一入口                        │ │
│  │                                                                         │ │
│  │  路由只有两条：                                                          │ │
│  │  /api/**  → Java后端(8081)                                              │ │
│  │  /ai/**   → idagent(3001)                                               │ │
│  │                                                                         │ │
│  │  鉴权规则：白名单路径无需JWT，其余全部JWT验证                            │ │
│  │  白名单：/api/authserver/**、/api/chat/**、/api/wechat/**、/public/**   │ │
│  │                                                                         │ │
│  │  JWT验证通过后：注入 x-user-id 头 → 转发下游                            │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│      │                                    │                                 │
│      ▼                                    ▼                                 │
│  Java后端(8081)                      idagent(3001)                          │
│  (纯业务逻辑)                        (纯AI推理)                               │
│  信任 x-user-id                     信任 x-user-id                          │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  申请提交流程（重要变化）：                                             │   │
│  │  用户确认 → Agent返回申请数据 → 前端调用 /api/application/submit → 落库 │   │
│  │  Agent不再直接调用/internal/**接口，消除了agent→Java后端的直接依赖        │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 2.3 端口分配

| 服务 | 当前端口 | 重构后端口 | 说明 |
|------|---------|-----------|------|
| idgateway | — | **8080** | 新增，统一入口 |
| idbackend | 8080 | **8081** | 仅处理业务逻辑 |
| idagent | 3001 | 3001 | 不变 |
| idfrontend | 5173 | 5173 | 不变 |

### 2.4 路由规则（两条，极简）

| 路径模式 | 下游服务 | JWT 验证 | 用途 |
|---------|---------|---------|------|
| `/api/**` | idbackend:8081 | 白名单免验，其余需JWT | 所有业务接口 |
| `/ai/**` | idagent:3001 | ✅ 需JWT | AI Agent 对话、RAG、配置 |

### 2.5 白名单（真正的公开路径）

| 路径 | 说明 |
|------|------|
| `/api/authserver/**` | 登录、注册、验证码、刷新令牌 |
| `/api/chat/**` | 公开 AI 对话 |
| `/api/wechat/**` | 微信登录回调 |
| `/public/**` | 静态资源 |

---

## 三、鉴权流程设计

### 3.1 JWT 验权流程

```
请求到达网关
    │
    ▼
从 Header 提取 Authorization: Bearer <token>
    │
    ├── 为空？ → 检查是否为白名单路径
    │           ├── 是 → 放行，转发
    │           └── 否 → 返回 401 { code: 401, msg: "未登录" }
    │
    ▼
解析 JWT（验签名 + 过期时间 + tokenType）
    │
    ├── 失败？ → 返回 401 { code: 401, msg: "token无效" }
    │
    ▼
检查 tokenType == "access"
    │
    ├── 否？ → 返回 401 { code: 401, msg: "token类型错误" }
    │
    ▼
提取 userId, username
    │
    ▼
注入请求头 → x-user-id: {userId}
            → x-username: {username}
    │
    ▼
转发到下游服务
```

### 3.2 下游服务信任模型

```
┌──────────────────────────────────────────────────────┐
│                    idgateway (内网)                  │
│                                                      │
│  信任模型：网关已验JWT, 下游服务无需再验              │
│                                                      │
│  idbackend 信任 x-user-id 头，不验JWT                │
│  idagent   信任 x-user-id 头，不验JWT                │
│                                                      │
│  /internal/** 接口不再需要，无 agent→后端直调        │
└──────────────────────────────────────────────────────┘
```

---

## 四、申请提交流程（关键变化）

### 4.1 重构前：Agent 直调后端

```
用户确认加分申请
    ↓
Agent 调用 /internal/agent/submit（带 service-key）
    ↓
Java后端落库
    ↓
问题：agent 和后端强耦合，任何一方挂了流程就断
```

### 4.2 重构后：前端统一提交

```
用户与Agent对话 → Agent分析材料 → 用户确认加分意向
    ↓
Agent 返回申请数据给前端（SSE流中返回）
{
  intent: "apply_confirmed",
  applicationData: {
    templateName: "计算机软件著作权",
    applyScore: 8,
    category: "学术成果",
    proofs: [{ fileId: 123, fileName: "证书.pdf" }],
    aiAnalysis: "该学生拥有2项软件著作权..."
  }
}
    ↓
前端收到后，弹出确认对话框
    ↓
用户点击"确认提交" → 前端调用 /api/application/submit
    ↓
Java后端落库，返回成功
```

### 4.3 优势

| 方面 | 重构前 | 重构后 |
|------|--------|--------|
| 服务耦合 | agent → 后端直调，强耦合 | 前端作为中介，解耦 |
| 失败处理 | agent无法感知提交失败 | 前端可控，可重试、可提示用户 |
| 安全性 | agent持有service-key | 无内部密钥，安全性更高 |
| 流程透明 | 用户感知不清晰 | 用户主动确认，体验更好 |
| 接口数量 | 需维护 /internal/** 接口 | 无需内部接口 |

### 4.4 Agent 改造点

`submit` node 改为返回数据而非调用 HTTP 接口：

```typescript
// 原来的逻辑
const result = await fetch(`${JAVA_BACKEND_URL}/internal/agent/submit`, {
  headers: { 'X-Internal-Service-Key': SERVICE_KEY, 'x-user-id': userId },
  method: 'POST',
  body: JSON.stringify(applicationData),
});

// 改为：直接返回给前端
return {
  intent: 'apply_confirmed',
  applicationData: {
    templateName,
    applyScore,
    category,
    proofs,
    aiAnalysis: "该学生拥有...",
  },
};
```

前端 SSE 消息处理：

```typescript
// 前端处理 SSE 消息
source.onmessage = (event) => {
  const data = JSON.parse(event.data);

  if (data.intent === 'apply_confirmed') {
    // 弹出确认对话框
    showApplyConfirmDialog(data.applicationData).then(async (confirmed) => {
      if (confirmed) {
        await apiApplication.submit(data.applicationData);
      }
    });
  }
};
```

---

## 五、代码工程结构

### 5.1 项目结构

```
idgateway/
├── pom.xml
├── src/main/java/com/zch/idgateway/
│   ├── IdGatewayApplication.java          # 启动类
│   ├── config/
│   │   ├── GatewayCorsConfig.java        # CORS 配置
│   │   └── JwtProperties.java            # JWT 配置属性
│   ├── filter/
│   │   └── AuthFilter.java               # JWT 鉴权过滤器（GlobalFilter）
│   └── service/
│       └── JwtService.java               # JWT 解析服务
└── src/main/resources/
    ├── application.yml                   # 主配置
    └── bootstrap.yml                     # 启动配置
```

> 注：路由直接用 application.yml 配置，不需要单独的 RouteConfig.java。内部接口过滤器不再需要。

### 5.2 核心文件说明

| 文件 | 职责 |
|------|------|
| `IdGatewayApplication.java` | 网关启动入口 |
| `AuthFilter.java` | GlobalFilter，执行 JWT 验证和 userId 注入（核心逻辑） |
| `GatewayCorsConfig.java` | CORS 配置，允许前端跨域 |
| `JwtService.java` | JWT 解析（复用 idbackend 的密钥和算法） |
| `application.yml` | 两条路由 + 白名单 + JWT 配置 |

---

## 六、路由配置设计

### 6.1 application.yml（两条路由）

```yaml
server:
  port: 8080

spring:
  application:
    name: idgateway
  cloud:
    gateway:
      routes:
        # 路由一：/api/** → Java 后端
        - id: java-backend
          uri: http://localhost:8081
          predicates:
            - Path=/api/**

        # 路由二：/ai/** → AI Agent
        - id: ai-agent
          uri: http://localhost:3001
          predicates:
            - Path=/ai/**

      globalcors:
        cors-configurations:
          '[/**]':
            allowedOrigins: "*"
            allowedMethods: "*"
            allowedHeaders: "*"
            allowCredentials: true
            maxAge: 3600

# JWT 配置（与 idbackend 共用相同密钥）
jwt:
  secret: ${JWT_SECRET}

# 日志
logging:
  level:
    com.zch.idgateway: DEBUG
    org.springframework.cloud.gateway: DEBUG
```

### 6.2 路由优先级

Spring Cloud Gateway 按路由定义的**顺序匹配**，先匹配 `/api/**` 即转发到 Java 后端，无需担心白名单路径被误匹配。

---

## 七、AuthFilter 设计

### 7.1 职责

1. 读取 `Authorization: Bearer <token>` 头
2. 白名单路径直接放行
3. 解析 JWT（验签名、过期时间、tokenType）
4. 从 JWT payload 提取 userId、username
5. 向下游请求注入 `x-user-id`、`x-username` 头

### 7.2 关键代码

```java
package com.zch.idgateway.filter;

import com.auth0.jwt.JWT;
import com.auth0.jwt.algorithms.Algorithm;
import com.auth0.jwt.exceptions.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.util.List;

@Component
public class AuthFilter implements GlobalFilter, Ordered {

    @Value("${jwt.secret}")
    private String jwtSecret;

    /** 白名单：无需 JWT 验证的路径 */
    private static final List<String> WHITE_LIST = List.of(
            "/api/authserver/",
            "/api/chat/",
            "/api/wechat/",
            "/public/"
    );

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        String path = exchange.getRequest().getURI().getPath();

        // 1. 白名单检查
        if (isWhiteListed(path)) {
            return chain.filter(exchange);
        }

        // 2. 提取 Authorization 头
        String authHeader = exchange.getRequest().getHeaders().getFirst("Authorization");
        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            return writeUnauthorized(exchange, "未登录");
        }

        String token = authHeader.substring(7);

        // 3. 解析 & 验证 JWT
        try {
            DecodedJWT jwt = JWT.decode(token);

            // 4. 验证 tokenType
            String tokenType = jwt.getClaim("tokenType").asString();
            if (!"access".equals(tokenType)) {
                return writeUnauthorized(exchange, "token类型错误");
            }

            // 5. 验证签名（含过期时间自动校验）
            JWT.require(Algorithm.HMAC256(jwtSecret)).build().verify(token);

            // 6. 提取用户信息
            int userId = jwt.getClaim("userId").asInt();
            String username = jwt.getClaim("username").asString();

            // 7. 注入 x-user-id 和 x-username 到请求头
            ServerHttpRequest mutatedRequest = exchange.getRequest().mutate()
                    .header("x-user-id", String.valueOf(userId))
                    .header("x-username", username)
                    .build();

            return chain.filter(exchange.mutate().request(mutatedRequest).build());

        } catch (JWTDecodeException | SignatureVerificationException e) {
            return writeUnauthorized(exchange, "token无效");
        } catch (TokenExpiredException e) {
            return writeUnauthorized(exchange, "token已过期");
        }
    }

    private boolean isWhiteListed(String path) {
        return WHITE_LIST.stream().anyMatch(path::startsWith);
    }

    private Mono<Void> writeUnauthorized(ServerWebExchange exchange, String msg) {
        exchange.getResponse().setStatusCode(HttpStatus.UNAUTHORIZED);
        exchange.getResponse().getHeaders().setContentType(MediaType.APPLICATION_JSON);
        String body = String.format("{\"code\":401,\"msg\":\"%s\",\"data\":null}", msg);
        return exchange.getResponse().writeWith(
                Mono.just(exchange.getResponse().bufferFactory().wrap(body.getBytes()))
        );
    }

    @Override
    public int getOrder() {
        return -100; // 优先于路由过滤器执行
    }
}
```

---

## 八、下游服务改造

### 8.1 idbackend 改造

#### 8.1.1 移除 JWT 鉴权逻辑

**需要保留的逻辑**：
- `@RequireRole` 和 `@RequirePermission` 注解（基于 userId 查询角色/权限）
- 从 request 中获取 userId：`request.getAttribute("userId")`

**需要移除的逻辑**：
- JWT 解析：`jwtUtils.parseToken(token)`
- 过期时间验证：网关已做
- tokenType 验证：网关已做

**简化后的 AuthInterceptor.java**：

```java
@Component
public class AuthInterceptor implements HandlerInterceptor {

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        // OPTIONS 直接放行
        if ("OPTIONS".equalsIgnoreCase(request.getMethod())) {
            return true;
        }

        // 从 x-user-id 头提取（网关已注入）
        String userIdStr = request.getHeader("x-user-id");
        if (userIdStr == null) {
            return true; // 兜底兼容
        }

        Integer userId = Integer.valueOf(userIdStr);
        request.setAttribute("userId", userId);

        // 注解校验（@RequireRole, @RequirePermission）保留
        if (handler instanceof HandlerMethod) {
            HandlerMethod hm = (HandlerMethod) handler;
            checkRoleAnnotations(hm, userId);
            checkPermissionAnnotations(hm, userId);
        }

        return true;
    }
}
```

#### 8.1.2 SecurityConfig 简化

```java
@Bean
public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
    http.csrf.disable().cors(c -> c.disable());
    http.authorizeHttpRequests(auth -> auth.anyRequest().permitAll());
    return http.build();
}
```

#### 8.1.3 移除 /internal/agent/submit 接口

该接口不再需要，可以删除或注释。申请提交统一由前端调用 `/api/application/submit`。

### 8.2 idagent 改造

1. **移除 `INTERNAL_SERVICE_KEY`**：不再需要调用后端内部接口
2. **修改 `submit` node**：返回申请数据给前端，而非调用 HTTP 接口
3. **SSE 返回结构**：新增 `intent: "apply_confirmed"` 消息类型

```typescript
// submit node 改造示例
async function submitNode(state: AgentState): Promise<Partial<AgentState>> {
  const { templateName, applyScore, proofs, aiAnalysis } = state;

  // 原来：调用 /internal/agent/submit
  // 现在：直接返回给前端，不做落库操作

  return {
    messages: [
      ...state.messages,
      {
        role: 'assistant',
        content: '',
        intent: 'apply_confirmed',
        applicationData: {
          templateName,
          applyScore,
          category: '学术成果',
          proofs: proofs.map(p => ({ fileId: p.fileId, fileName: p.fileName })),
          aiAnalysis,
        },
      },
    ],
  };
}
```

### 8.3 idfrontend 改造

**需要改动**：前端需要将 API base URL 从 idbackend 改为 idgateway。

```typescript
// src/common/utils/http.ts
const http = axios.create({
  baseURL: 'http://localhost:8080',  // 改为网关地址
});

// src/api/components/apiAIchat.ts
const apiBaseUrl = 'http://localhost:8080';  // SSE地址也改
```

前端 SSE 消息处理新增 `apply_confirmed` 意图处理：

```typescript
source.onmessage = async (event) => {
  const data = JSON.parse(event.data);

  if (data.intent === 'apply_confirmed') {
    const confirmed = await showConfirmDialog({
      title: '确认提交加分申请？',
      data: data.applicationData,
    });
    if (confirmed) {
      await apiApplication.submit({
        ...data.applicationData,
      });
    }
  } else {
    // 普通文本消息处理
    appendMessage(data);
  }
};
```

---

## 九、SSE 流式透传设计

Spring Cloud Gateway 基于 Netty，HTTP 响应体作为 ByteBuf 直接 pipe 透传，不需要在堆内存中 buffer，SSE 流式响应自动支持。

配置要点：不要加任何修改响应体的 filter（如 `ModifyResponseBodyGatewayFilter`），否则会触发 buffer 导致 SSE 无法透传。

```
前端 → GET /ai/agent/stream
           ↓
      AuthFilter（JWT验证，注入 x-user-id）
           ↓
      路由匹配 /ai/** → http://localhost:3001
           ↓
      Netty 直接 pipe Agent SSE 流 → 前端
```

---

## 十、迁移步骤

### 阶段一：搭建 idgateway（不修改任何现有服务）

1. 创建 `idgateway` Maven 项目，引入 Spring Cloud Gateway 依赖
2. 配置 `application.yml`（两条路由 + 白名单）
3. 实现 `AuthFilter.java`
4. idbackend 端口从 8080 改为 8081
5. idagent `JAVA_BACKEND_URL` 改为 `http://localhost:8081`
6. 启动 idgateway:8080 + idbackend:8081 + idagent:3001
7. 单独测试各路由是否正常转发

### 阶段二：前端切换

1. 前端 `VITE_BASE_API` 改为 `http://localhost:8080`
2. 修改 `apiAIchat.ts` 中的 SSE 地址
3. 验证登录、业务流程全部正常

### 阶段三：简化 idbackend

1. 移除 `AuthInterceptor` 中的 JWT 解析逻辑，信任 `x-user-id` 头
2. 简化 `SecurityConfig`，所有请求 permitAll
3. 删除或注释 `/internal/agent/submit` 接口

### 阶段四：改造 Agent 提交流程

1. Agent 的 `submit` node 改为返回 `apply_confirmed` 意图数据
2. 前端增加 SSE `apply_confirmed` 消息处理和确认对话框
3. 前端确认后调用 `/api/application/submit` 提交

---

## 十一、环境配置

```yaml
# idgateway/src/main/resources/application.yml
server:
  port: 8080

spring:
  cloud:
    gateway:
      routes:
        - id: java-backend
          uri: http://localhost:8081
          predicates:
            - Path=/api/**
        - id: ai-agent
          uri: http://localhost:3001
          predicates:
            - Path=/ai/**

jwt:
  secret: ${JWT_SECRET}   # 必须与 idbackend 使用相同的密钥

logging:
  level:
    com.zch.idgateway: DEBUG
```

**密钥同步**：idgateway 和 idbackend 必须使用相同的 `JWT_SECRET`，建议统一从环境变量读取。

---

## 十二、注意事项

### 12.1 JWT 密钥必须一致

idgateway 验证 JWT，idbackend 可能需要验证（如果保留了某些 JWT 相关逻辑）。两处使用相同的密钥和算法（HS256）。

### 12.2 内网部署

idgateway 应部署在内网，对外只暴露 8080 端口。idbackend(8081) 和 idagent(3001) 不对外暴露。

### 12.3 错误响应格式

网关返回的错误格式与后端保持一致，前端才能正确处理：

```json
{ "code": 401, "msg": "未登录", "data": null }
```

### 12.4 前端 Token 刷新

前端 `http.ts` 中的 403 刷新逻辑**无需修改**。`/api/authserver/refresh` 走白名单，不经过 JWT 验证，刷新后的 token 正常返回。

### 12.5 暂不处理的内容

以下内容不在本方案范围，后续可扩展：

- 限流（Rate Limiting）
- 熔断（Circuit Breaker）
- 统一日志（ELK / Loki）
- 链路追踪（OpenTelemetry）

---

## 十三、待确认事项

1. **JWT 密钥**：确认 idbackend 当前使用的密钥值
2. **端口确认**：idbackend 切换到 8081 是否会影响其他服务
3. **Agent 改造**：确认 `submit` node 当前调用 `/internal/agent/submit` 的完整入参格式，以便设计新的返回结构
4. **前端确认**：`VITE_BASE_API` 的当前值是什么
