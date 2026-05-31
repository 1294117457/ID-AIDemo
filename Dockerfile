FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --legacy-peer-deps

COPY tsconfig.json ./
COPY .env ./
COPY src ./src
RUN npm run build

ENV NODE_ENV=production
EXPOSE 3001

CMD ["node", "dist/main.js"]