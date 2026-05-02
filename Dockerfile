# 第一阶段：编译环境，使用完整的 node 镜像
FROM node:22 AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --legacy-peer-deps
# 复制源代码等
COPY .env .env
COPY src ./src
RUN npm run build

# 第二阶段：生产运行环境
# 为了镜像大小，运行阶段可以保持使用 alpine，或者使用 node:22-slim
FROM node:22-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./
COPY .env .env

ENV NODE_ENV=production

EXPOSE 3001

CMD ["node", "dist/main.js"]