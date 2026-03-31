# syntax=docker/dockerfile:1

# ---- builder ----
FROM node:22-alpine AS builder

# 同步 Alpine 安全更新（基础镜像里的 zlib 等 CVE 需从仓库升级）
RUN apk upgrade --no-cache

WORKDIR /app

ENV npm_config_fund=false \
    npm_config_update_notifier=false

COPY package.json package-lock.json ./

RUN --mount=type=cache,target=/root/.npm \
    npm ci

COPY . .

RUN npm run build \
    && rm -rf node_modules/.cache

# ---- production ----
FROM node:22-alpine AS production

RUN apk upgrade --no-cache \
    && addgroup -g 1001 -S nodejs \
    && adduser -S nestjs -u 1001 -G nodejs

WORKDIR /app

ENV NODE_ENV=production \
    PORT=6689 \
    npm_config_fund=false \
    npm_config_update_notifier=false

COPY package.json package-lock.json ./

RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev --no-audit \
    && npm cache clean --force

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
