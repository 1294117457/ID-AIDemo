# 1. 使用 Node 20 LTS 避免 faiss 源码编译
FROM node:20 AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
# 此时应该能快发拉取好预编译版本
RUN npm ci --legacy-peer-deps

# 2. 必须拷入 tsconfig.json
COPY tsconfig.json ./
COPY .env .env
COPY src ./src

# 执行构建
RUN npm run build

# 3. 运行环境同样使用 20 版本的轻量镜像保持一致
FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./
COPY .env .env

ENV NODE_ENV=production

EXPOSE 3001

CMD ["node", "dist/main.js"]