FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN apk add --no-cache python3 make g++ git
RUN npm ci --legacy-peer-deps
COPY .env .env
COPY src ./src
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./
COPY .env .env

ENV NODE_ENV=production

EXPOSE 3001

CMD ["node", "dist/main.js"]