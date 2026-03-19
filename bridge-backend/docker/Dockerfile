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
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    libatk-bridge2.0-0 \
    libgtk-3-0 \
    libnss3 \
    postgresql-client \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Puppeteer utilise Chromium système — pas de téléchargement auto
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

RUN npm install -g pnpm

WORKDIR /app

COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --prod --frozen-lockfile

# Prisma : schema + migrations (requis pour generate + migrate deploy)
COPY --from=builder /app/prisma ./prisma

# Regénère le client Prisma dans l'image de production
# (évite les problèmes de symlinks du store pnpm entre les stages)
RUN node_modules/.bin/prisma generate

# Artefacts de build
COPY --from=builder /app/dist ./dist

# Assets société (logos, header, footer, cachet pour les PDFs)
COPY --from=builder /app/assets ./assets

# Créer les dossiers uploads avec les bonnes permissions avant de changer d'utilisateur
RUN mkdir -p /app/uploads/avatars /app/uploads/assets /app/uploads/backups /app/uploads/attachments

# Utilisateur non-root pour limiter la surface d'attaque
RUN groupadd --gid 1001 nodejs && useradd --uid 1001 --gid nodejs --shell /bin/bash --create-home nodeapp
RUN chown -R nodeapp:nodejs /app
USER nodeapp

EXPOSE 3000

# Lance les migrations, le seed (idempotent), puis démarre le serveur
CMD ["sh", "-c", "node_modules/.bin/prisma migrate resolve --applied 0_init 2>/dev/null || true && node_modules/.bin/prisma migrate deploy && node_modules/.bin/prisma db seed && node dist/server.js"]
