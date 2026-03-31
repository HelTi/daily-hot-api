# syntax=docker/dockerfile:1

FROM node:22-alpine AS builder

RUN apk upgrade --no-cache

WORKDIR /app

ENV npm_config_fund=false \
    npm_config_update_notifier=false

COPY package*.json ./

RUN --mount=type=cache,target=/root/.npm \
    sh -ec 'if [ -f package-lock.json ]; then npm ci; else npm install; fi'

COPY . .

RUN npm run build && rm -rf node_modules/.cache

# ---

FROM node:22-alpine AS production

RUN apk upgrade --no-cache \
    && addgroup -g 1001 -S nodejs \
    && adduser -S nestjs -u 1001 -G nodejs

WORKDIR /app

ENV NODE_ENV=production \
    PORT=6689 \
    npm_config_fund=false \
    npm_config_update_notifier=false

COPY package*.json ./

# 不用 cache mount，避免与清理缓存逻辑冲突；直接删 ~/.npm 减小层体积
RUN sh -ec 'if [ -f package-lock.json ]; then npm ci --omit=dev --no-audit; else npm install --omit=dev --no-audit; fi' \
    && rm -rf /root/.npm

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/healthcheck.js .
COPY --from=builder /app/views ./views

RUN find /app/dist -name '*.map' -delete \
    && chown -R nestjs:nodejs /app

USER nestjs

EXPOSE 6689

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node healthcheck.js || exit 1

CMD ["node", "dist/main.js"]
