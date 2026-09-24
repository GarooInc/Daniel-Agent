FROM node:24-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
# kb/ son los .md fuente que migrate-client-wiki.ts lee en runtime al sembrar client_wiki (ver
# ese script) — sin esto, `docker exec ... node dist/migrate-client-wiki.js` falla con ENOENT.
COPY kb ./kb
EXPOSE 3300
CMD ["npm", "start"]
