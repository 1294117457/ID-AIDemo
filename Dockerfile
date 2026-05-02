FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./

ENV NODE_ENV=production
ENV PORT=3001
ENV QWEN_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
ENV QWEN_CHAT_MODEL=qwen3-max
ENV QWEN_EMBEDDING_MODEL=text-embedding-v3

EXPOSE 3001

CMD ["node", "dist/main.js"]
