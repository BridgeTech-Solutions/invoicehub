# Déploiement InvoiceHub sur Windows Server

**Stack** : NestJS API (port 3005) · Next.js Frontend (port 3001) · PostgreSQL · Redis

Deux méthodes sont décrites — **Docker** (recommandée, isolée) et **Native** (sans Docker).

---

## Table des matières

1. [Prérequis communs](#1-prérequis-communs)
2. [Méthode A — Docker (recommandée)](#2-méthode-a--docker-recommandée)
3. [Méthode B — Déploiement natif](#3-méthode-b--déploiement-natif)
4. [Configuration des variables d'environnement](#4-configuration-des-variables-denvironnement)
5. [Firewall Windows Server](#5-firewall-windows-server)
6. [Vérification du déploiement](#6-vérification-du-déploiement)
7. [Démarrage automatique au boot](#7-démarrage-automatique-au-boot)
8. [Mises à jour](#8-mises-à-jour)
9. [Dépannage](#9-dépannage)

---

## 1. Prérequis communs

### Logiciels requis

| Logiciel | Version minimale | Téléchargement |
|---|---|---|
| Git | 2.40+ | https://git-scm.com |
| Node.js | 20 LTS | https://nodejs.org |
| pnpm | 9+ | `npm install -g pnpm` |

### Récupérer le code source

```powershell
# Choisir un dossier de déploiement
cd C:\Apps

git clone <URL_DU_DEPOT> invoicehub
cd invoicehub
```

> Si le dépôt est privé, configurer un token Git ou une clé SSH avant le clone.

---

## 2. Méthode A — Docker (recommandée)

### 2.1 Installer Docker

**Sur Windows Server 2019 / 2022 :**

```powershell
# Installer Docker Engine (pas Docker Desktop)
Install-Module -Name DockerMsftProvider -Repository PSGallery -Force
Install-Package -Name docker -ProviderName DockerMsftProvider -Force
Restart-Computer -Force
```

**Sur Windows 10/11 Pro (poste de développement) :**
Installer Docker Desktop depuis https://www.docker.com/products/docker-desktop

Vérifier l'installation :
```powershell
docker --version
docker compose version
```

### 2.2 Créer le fichier `docker-compose.prod.yml`

Créer ce fichier à la racine du dépôt (`C:\Apps\invoicehub\docker-compose.prod.yml`) :

```yaml
version: '3.9'

services:

  # ── PostgreSQL ────────────────────────────────────────────────
  db:
    image: postgres:16-alpine
    container_name: invoicehub_db
    restart: unless-stopped
    environment:
      POSTGRES_DB: invoicehub
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - pgdata:/var/lib/postgresql/data
    networks:
      - invoicehub_net
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres -d invoicehub"]
      interval: 10s
      timeout: 5s
      retries: 5

  # ── Redis ─────────────────────────────────────────────────────
  redis:
    image: redis:7-alpine
    container_name: invoicehub_redis
    restart: unless-stopped
    command: redis-server --requirepass ${REDIS_PASSWORD:-}
    volumes:
      - redisdata:/data
    networks:
      - invoicehub_net
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  # ── API NestJS ────────────────────────────────────────────────
  api:
    build:
      context: ./invoicehub-api
      dockerfile: docker/Dockerfile
    container_name: invoicehub_api
    restart: unless-stopped
    ports:
      - "3005:3005"
    environment:
      NODE_ENV: production
      PORT: 3005
      DATABASE_URL: postgresql://postgres:${DB_PASSWORD}@db:5432/invoicehub
      REDIS_URL: redis://redis:6379
      JWT_ACCESS_SECRET: ${JWT_ACCESS_SECRET}
      JWT_REFRESH_SECRET: ${JWT_REFRESH_SECRET}
      JWT_ACCESS_EXPIRES_IN: 15m
      JWT_REFRESH_EXPIRES_IN: 7d
      SMTP_HOST: ${SMTP_HOST}
      SMTP_PORT: ${SMTP_PORT:-587}
      SMTP_SECURE: ${SMTP_SECURE:-false}
      SMTP_USER: ${SMTP_USER}
      SMTP_PASS: ${SMTP_PASS}
      SMTP_FROM: ${SMTP_FROM}
      APP_URL: http://${SERVER_IP}:3001
      BACKEND_URL: http://${SERVER_IP}:3005
      CORS_ORIGINS: http://${SERVER_IP}:3001
      TOTP_ISSUER: InvoiceHub BTS
      BACKUP_STORAGE_DISK: local
      BACKUP_DIR: /app/uploads/backups
      BACKUP_RETENTION_DAYS: 30
      UPLOADS_DIR: /app/uploads
      PUPPETEER_SKIP_CHROMIUM_DOWNLOAD: "true"
      PUPPETEER_EXECUTABLE_PATH: /usr/bin/chromium
    volumes:
      - api_uploads:/app/uploads
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy
    networks:
      - invoicehub_net

  # ── Frontend Next.js ──────────────────────────────────────────
  frontend:
    build:
      context: ./bridge-frontend
      dockerfile: docker/Dockerfile
      args:
        NEXT_PUBLIC_API_URL: http://${SERVER_IP}:3005/api
        NEXT_PUBLIC_SOCKET_URL: http://${SERVER_IP}:3005
        NEXT_PUBLIC_APP_NAME: InvoiceHub
    container_name: invoicehub_frontend
    restart: unless-stopped
    ports:
      - "3001:3001"
    environment:
      NODE_ENV: production
      PORT: 3001
    depends_on:
      - api
    networks:
      - invoicehub_net

volumes:
  pgdata:
  redisdata:
  api_uploads:

networks:
  invoicehub_net:
    driver: bridge
```

### 2.3 Créer le fichier `.env` de production

Créer `C:\Apps\invoicehub\.env` :

```env
# IP du serveur sur le réseau local (ipconfig → Adresse IPv4)
SERVER_IP=192.168.1.10

# Base de données
DB_PASSWORD=MotDePasseForte2024!

# JWT — générer avec : node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
JWT_ACCESS_SECRET=remplacer_par_une_chaine_aleatoire_de_64_caracteres_minimum
JWT_REFRESH_SECRET=remplacer_par_une_autre_chaine_aleatoire_differente_de_64_chars

# SMTP (Orange Business, Gmail, etc.)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=votre_email@gmail.com
SMTP_PASS=mot_de_passe_application
SMTP_FROM=noreply@bts.cm
```

> **Sécurité** : ne jamais committer ce fichier `.env` dans Git.

### 2.4 Lancer les conteneurs

```powershell
cd C:\Apps\invoicehub

# Premier démarrage (construit les images + lance tout)
docker compose -f docker-compose.prod.yml --env-file .env up -d --build

# Vérifier que tout tourne
docker compose -f docker-compose.prod.yml ps
```

Résultat attendu :
```
NAME                   STATUS          PORTS
invoicehub_db          Up (healthy)    5432/tcp
invoicehub_redis       Up (healthy)    6379/tcp
invoicehub_api         Up              0.0.0.0:3005->3005/tcp
invoicehub_frontend    Up              0.0.0.0:3001->3001/tcp
```

### 2.5 Vérifier les logs

```powershell
# Logs de l'API
docker logs invoicehub_api --tail 50

# Logs du frontend
docker logs invoicehub_frontend --tail 30

# Logs en temps réel
docker logs invoicehub_api -f
```

---

## 3. Méthode B — Déploiement natif

### 3.1 Installer PostgreSQL

1. Télécharger PostgreSQL 16 : https://www.postgresql.org/download/windows/
2. Installer avec le mot de passe superuser de votre choix
3. Créer la base de données :

```powershell
# Ouvrir psql en tant qu'administrateur
& "C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres

# Dans psql :
CREATE DATABASE invoicehub;
\q
```

### 3.2 Installer Redis sur Windows

```powershell
# Via winget
winget install Redis.Redis

# Ou via Chocolatey
choco install redis

# Démarrer Redis comme service Windows
redis-server --service-install
redis-server --service-start
```

Vérifier : `redis-cli ping` → doit répondre `PONG`

### 3.3 Déployer l'API NestJS

```powershell
cd C:\Apps\invoicehub\invoicehub-api

# Installer les dépendances
pnpm install --frozen-lockfile

# Configurer l'environnement
copy .env.example .env
# Éditer .env avec vos valeurs (voir section 4)
notepad .env

# Générer le client Prisma + appliquer les migrations
pnpm exec prisma generate
pnpm exec prisma migrate deploy
pnpm exec prisma db seed

# Build de production
pnpm build

# Démarrer
pnpm start
```

L'API tourne sur `http://localhost:3005`

### 3.4 Déployer le Frontend Next.js

> **Important** : les variables `NEXT_PUBLIC_*` sont intégrées au moment du build.
> Tout changement d'URL nécessite un rebuild complet.

```powershell
cd C:\Apps\invoicehub\bridge-frontend

# Installer les dépendances
pnpm install --frozen-lockfile

# Configurer l'environnement
copy .env.local.example .env.local
notepad .env.local
```

Contenu de `.env.local` (adapter l'IP) :
```env
NEXT_PUBLIC_API_URL=http://192.168.1.10:3005/api
NEXT_PUBLIC_SOCKET_URL=http://192.168.1.10:3005
NEXT_PUBLIC_APP_NAME=InvoiceHub
```

```powershell
# Build de production (intègre les variables d'env)
pnpm build

# Démarrer
pnpm start
```

Le frontend tourne sur `http://localhost:3001`

---

## 4. Configuration des variables d'environnement

### Variables obligatoires API (`invoicehub-api/.env`)

| Variable | Description | Exemple |
|---|---|---|
| `DATABASE_URL` | URL PostgreSQL | `postgresql://postgres:pass@localhost:5432/invoicehub` |
| `REDIS_URL` | URL Redis | `redis://localhost:6379` |
| `JWT_ACCESS_SECRET` | Secret JWT accès (≥ 64 chars) | chaîne aléatoire |
| `JWT_REFRESH_SECRET` | Secret JWT refresh (≥ 64 chars) | chaîne aléatoire différente |
| `SERVER_IP` | IP du serveur sur le réseau | `192.168.1.10` |
| `PORT` | Port de l'API | `3005` |
| `SMTP_HOST` | Serveur SMTP | `smtp.gmail.com` |
| `SMTP_USER` | Email SMTP | `votre@email.com` |
| `SMTP_PASS` | Mot de passe SMTP | mot de passe application |

### Variables obligatoires Frontend (`bridge-frontend/.env.local`)

| Variable | Description | Exemple |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | URL complète de l'API | `http://192.168.1.10:3005/api` |
| `NEXT_PUBLIC_SOCKET_URL` | URL WebSocket | `http://192.168.1.10:3005` |

### Générer des secrets JWT sécurisés

```powershell
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
# Exécuter deux fois pour avoir deux secrets différents
```

---

## 5. Firewall Windows Server

Ouvrir les ports nécessaires :

```powershell
# Frontend
New-NetFirewallRule -DisplayName "InvoiceHub Frontend" -Direction Inbound -Protocol TCP -LocalPort 3001 -Action Allow

# API
New-NetFirewallRule -DisplayName "InvoiceHub API" -Direction Inbound -Protocol TCP -LocalPort 3005 -Action Allow
```

> Les ports 5432 (PostgreSQL) et 6379 (Redis) ne doivent **pas** être ouverts vers l'extérieur — communication interne uniquement.

---

## 6. Vérification du déploiement

### Tests rapides

```powershell
# API — health check
Invoke-WebRequest -Uri "http://localhost:3005/api/health" -UseBasicParsing

# API — version
Invoke-WebRequest -Uri "http://localhost:3005/api" -UseBasicParsing

# Frontend
Invoke-WebRequest -Uri "http://localhost:3001" -UseBasicParsing
```

### Depuis un autre poste du réseau

```powershell
# Remplacer 192.168.1.10 par l'IP réelle du serveur
Invoke-WebRequest -Uri "http://192.168.1.10:3005/api/health"
Invoke-WebRequest -Uri "http://192.168.1.10:3001"
```

### Points de vérification

- [ ] `http://IP_SERVEUR:3001` — page de login s'affiche
- [ ] Login avec les identifiants admin fonctionnel
- [ ] Tableau de bord charge les données
- [ ] Création d'une facture PDF fonctionne (test Puppeteer)
- [ ] Notifications temps réel fonctionnent (WebSocket)

---

## 7. Démarrage automatique au boot

### Méthode Docker — redémarrage automatique

Les conteneurs Docker ont `restart: unless-stopped` — ils redémarrent automatiquement après un reboot serveur si Docker est configuré comme service Windows :

```powershell
# Configurer Docker Engine comme service Windows (démarrage auto)
Set-Service -Name docker -StartupType Automatic
```

### Méthode Native — PM2

```powershell
# Installer PM2 globalement
npm install -g pm2
npm install -g pm2-windows-startup

# Lancer l'API avec PM2
cd C:\Apps\invoicehub\invoicehub-api
pm2 start dist/main.js --name "invoicehub-api"

# Lancer le frontend avec PM2
cd C:\Apps\invoicehub\bridge-frontend
pm2 start node --name "invoicehub-frontend" -- .next/standalone/server.js

# Sauvegarder la configuration PM2
pm2 save

# Configurer le démarrage automatique Windows
pm2-startup install

# Vérifier l'état
pm2 status
pm2 logs invoicehub-api --lines 50
```

---

## 8. Mises à jour

### Méthode Docker

```powershell
cd C:\Apps\invoicehub

# Récupérer les dernières modifications
git pull origin main

# Rebuilder et relancer (sans interruption de la DB et Redis)
docker compose -f docker-compose.prod.yml --env-file .env up -d --build api frontend

# Vérifier
docker compose -f docker-compose.prod.yml ps
docker logs invoicehub_api --tail 30
```

### Méthode Native

```powershell
# API
cd C:\Apps\invoicehub\invoicehub-api
git pull origin main
pnpm install --frozen-lockfile
pnpm exec prisma migrate deploy
pnpm build
pm2 restart invoicehub-api

# Frontend (rebuild obligatoire si les variables d'env n'ont pas changé)
cd C:\Apps\invoicehub\bridge-frontend
git pull origin main
pnpm install --frozen-lockfile
pnpm build
pm2 restart invoicehub-frontend
```

---

## 9. Dépannage

### L'API ne démarre pas

```powershell
# Vérifier les logs
docker logs invoicehub_api --tail 100
# ou
pm2 logs invoicehub-api --lines 100

# Causes fréquentes :
# - DATABASE_URL incorrect → vérifier l'IP et le mot de passe PostgreSQL
# - REDIS_URL incorrect → vérifier que Redis tourne (redis-cli ping)
# - Port 3005 déjà utilisé → netstat -ano | findstr 3005
```

### Le frontend affiche "Erreur de connexion à l'API"

```powershell
# Vérifier que NEXT_PUBLIC_API_URL pointe vers la bonne IP
# ATTENTION : cette variable est intégrée au build — un rebuild est nécessaire si elle change

cd C:\Apps\invoicehub\bridge-frontend
# Modifier .env.local avec la bonne IP
notepad .env.local
# Puis rebuilder
pnpm build && pm2 restart invoicehub-frontend
```

### La génération de PDF échoue

Puppeteer nécessite Chromium. En Docker, c'est automatique. En natif sur Windows :

```powershell
# Installer Chromium/Chrome sur le serveur
winget install Google.Chrome

# Ajouter dans .env de l'API
# PUPPETEER_EXECUTABLE_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe
# PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
```

### Erreur "Prisma migration failed"

```powershell
# Vérifier l'état des migrations
cd C:\Apps\invoicehub\invoicehub-api
pnpm exec prisma migrate status

# Appliquer manuellement si nécessaire
pnpm exec prisma migrate deploy
```

### Vérifier les ports occupés

```powershell
netstat -ano | findstr "3001\|3005\|5432\|6379"
```

### Commandes Docker utiles

```powershell
# Arrêter tout
docker compose -f docker-compose.prod.yml down

# Arrêter et supprimer les volumes (ATTENTION : supprime les données DB)
docker compose -f docker-compose.prod.yml down -v

# Redémarrer un seul service
docker compose -f docker-compose.prod.yml restart api

# Accéder au shell d'un conteneur
docker exec -it invoicehub_api sh
docker exec -it invoicehub_db psql -U postgres -d invoicehub
```

---

## Résumé des ports

| Service | Port | Accès réseau |
|---|---|---|
| Frontend Next.js | 3001 | Public (réseau local) |
| API NestJS | 3005 | Public (réseau local) |
| PostgreSQL | 5432 | Interne uniquement |
| Redis | 6379 | Interne uniquement |

## Accès par défaut après déploiement

| URL | Description |
|---|---|
| `http://IP_SERVEUR:3001` | Interface utilisateur |
| `http://IP_SERVEUR:3005/api` | API REST |
| `http://IP_SERVEUR:3005/api/health` | Health check API |

---

*InvoiceHub v2.0 — Bridge Technologies Solutions, Douala, Cameroun*
