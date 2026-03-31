# ---- Builder ----
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY . .

RUN npm run build

# ---- Production ----
FROM node:22-alpine AS production

ENV NODE_ENV=production

RUN addgroup -g 1001 -S nodejs && \
    adduser -S nestjs -u 1001 -G nodejs

WORKDIR /app

COPY --chown=nestjs:nodejs package*.json ./

RUN npm ci --omit=dev --no-audit && npm cache clean --force

COPY --chown=nestjs:nodejs --from=builder /app/dist ./dist
COPY --chown=nestjs:nodejs --from=builder /app/healthcheck.js .
COPY --chown=nestjs:nodejs --from=builder /app/views ./views

USER nestjs

EXPOSE 6689

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node healthcheck.js || exit 1

CMD ["node", "dist/main.js"]
