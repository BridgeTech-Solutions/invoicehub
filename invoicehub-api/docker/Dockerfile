# ─────────────────────────────────────────────────────────────────────────────
#  InvoiceHub API — Dockerfile PRODUCTION (NestJS)
#  Multi-stage : builder → production
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1 : Build ──────────────────────────────────────────────────────────
FROM node:20-slim AS builder

RUN npm install -g pnpm

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

# Génère le client Prisma avant le build TypeScript
RUN pnpm exec prisma generate
RUN pnpm build

# ── Stage 2 : Production ──────────────────────────────────────────────────────
FROM node:20-slim AS production

# Chromium (PDF Puppeteer) + polices + pg_dump (backups)
RUN apt-get update && \
    apt-get install -o Acquire::http::Timeout=300 \
                    -o Acquire::https::Timeout=300 \
                    -o APT::Acquire::Retries=3 \
                    -y --no-install-recommends \
      chromium \
      fonts-liberation \
      fonts-noto \
      fonts-noto-cjk \
      libatk-bridge2.0-0 \
      libatk1.0-0 \
      libcups2 \
      libdbus-1-3 \
      libdrm2 \
      libgbm1 \
      libgtk-3-0 \
      libnss3 \
      libx11-xcb1 \
      libxcomposite1 \
      libxdamage1 \
      libxrandr2 \
      libxss1 \
      postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# Puppeteer utilise Chromium système (pas de téléchargement au pnpm install)
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

RUN groupadd --gid 1001 nodejs && \
    useradd --uid 1001 --gid nodejs --shell /bin/bash --create-home nodeapp

WORKDIR /app

RUN npm install -g pnpm

COPY --chown=nodeapp:nodejs package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile

# Schéma Prisma + migrations + seed
COPY --chown=nodeapp:nodejs --from=builder /app/prisma ./prisma
RUN pnpm exec prisma generate

# Artefacts de build NestJS
COPY --chown=nodeapp:nodejs --from=builder /app/dist ./dist

# Dossiers uploads
RUN mkdir -p /app/uploads/avatars /app/uploads/assets /app/uploads/backups /app/uploads/attachments && \
    chown -R nodeapp:nodejs /app/uploads

USER nodeapp

EXPOSE 3005

# Applique les migrations, seed idempotent, puis démarre
CMD ["sh", "-c", "pnpm exec prisma migrate resolve --applied 0_init 2>/dev/null || true && pnpm exec prisma migrate deploy && pnpm exec prisma db seed && node dist/main"]
