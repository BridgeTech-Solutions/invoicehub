FROM node:20-slim AS builder

RUN npm install -g pnpm

WORKDIR /app

COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm prisma:generate
RUN pnpm build

# ─── Production ───────────────────────────────────────────────
FROM node:20-slim AS production

# Chromium (PDF Puppeteer) + pg_dump (backups)
RUN apt-get update && \
    apt-get install -o Acquire::http::Timeout=300 \
                    -o Acquire::https::Timeout=300 \
                    -o APT::Acquire::Retries=3 \
                    -y chromium \
    fonts-liberation \
    libatk-bridge2.0-0 \
    libgtk-3-0 \
    libnss3 \
    postgresql-client \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Puppeteer utilise Chromium système
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Création utilisateur en début de stage
RUN groupadd --gid 1001 nodejs && useradd --uid 1001 --gid nodejs --shell /bin/bash --create-home nodeapp

WORKDIR /app

RUN npm install -g pnpm

COPY --chown=nodeapp:nodejs package.json pnpm-lock.yaml* ./
RUN pnpm install --prod --frozen-lockfile

# Prisma : schema + migrations
COPY --chown=nodeapp:nodejs --from=builder /app/prisma ./prisma

# Regénère le client Prisma
RUN pnpm prisma generate

# Artefacts de build
COPY --chown=nodeapp:nodejs --from=builder /app/dist ./dist

# Assets société
COPY --chown=nodeapp:nodejs --from=builder /app/assets ./assets

# Créer les dossiers uploads avec les bonnes permissions directement
RUN mkdir -p /app/uploads/avatars /app/uploads/assets /app/uploads/backups /app/uploads/attachments && \
    chown -R nodeapp:nodejs /app/uploads

USER nodeapp

EXPOSE 3000

# Lance les migrations, le seed (idempotent), puis démarre le serveur
CMD ["sh", "-c", "mkdir -p uploads/avatars uploads/assets uploads/backups uploads/attachments && pnpm prisma migrate resolve --applied 0_init 2>/dev/null || true && pnpm prisma migrate deploy && pnpm prisma db seed && node dist/server.js"]
