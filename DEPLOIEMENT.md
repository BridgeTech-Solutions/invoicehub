# Guide de déploiement — InvoiceHub v2.0

Bridge Technologies Solutions — Douala, Cameroun

---

## Prérequis

| Outil | Version minimale | Vérification |
|---|---|---|
| Docker Desktop | 24+ | `docker --version` |
| Docker Compose | v2 (CLI intégrée) | `docker compose version` |
| Node.js | 20+ | `node --version` |
| pnpm | 9+ | `pnpm --version` |
| Git | — | `git --version` |

> **Windows** : Docker Desktop doit tourner avant toute commande `docker`.

---

## Gestion des variables d'environnement

Un seul fichier `.env` à la **racine du projet** alimente tous les services :

- **docker-compose** lit `DB_PASSWORD` pour créer le conteneur PostgreSQL
- **Le service `api`** reçoit toutes les variables via `env_file: .env`
- **Le service `frontend`** reçoit `NEXT_PUBLIC_*` comme ARG au moment du build Docker
- **En dev local**, l'API lit un `.env` dans `invoicehub-api/` et le frontend lit `bridge-frontend/.env.local`

```
.env (racine)
    ├─→ PostgreSQL container : DB_PASSWORD
    ├─→ API container       : toutes les variables
    └─→ Frontend build      : NEXT_PUBLIC_API_URL, NEXT_PUBLIC_SOCKET_URL
```

---

## Mode développement

En développement, les services d'infrastructure (DB + Redis) tournent dans Docker,
l'API et le frontend tournent localement avec hot-reload.

### Étape 1 — Configurer l'environnement

```bash
# À la racine du projet
cp .env.example .env
```

Ouvrir `.env` et remplir au minimum :

```env
DB_PASSWORD=mot_de_passe_local

JWT_ACCESS_SECRET=une_cle_secrete_dau_moins_32_caracteres_ici
JWT_REFRESH_SECRET=une_autre_cle_secrete_dau_moins_32_caracteres

# URLs pour le dev local
APP_URL=http://localhost:3001
BACKEND_URL=http://localhost:3005
CORS_ORIGINS=http://localhost:3001,http://localhost:3005

# DATABASE_URL et REDIS_URL pour connexion locale (hors Docker)
DATABASE_URL=postgresql://postgres:mot_de_passe_local@localhost:5432/invoicehub
REDIS_URL=redis://localhost:6379
```

### Étape 2 — Démarrer PostgreSQL et Redis

```bash
# À la racine du projet
docker compose -f docker-compose.yml -f docker-compose.dev.yml up db redis -d
```

Vérifier que les conteneurs sont sains :

```bash
docker compose ps
# db    → healthy
# redis → healthy
```

### Étape 3 — Préparer l'API (première fois uniquement)

```bash
cd invoicehub-api

pnpm install

# Générer le client Prisma
pnpm exec prisma generate

# Appliquer le schéma initial (crée toutes les tables)
pnpm exec prisma migrate deploy

# Charger les données initiales (rôles, paramètres, taux TVA...)
pnpm exec prisma db seed
```

### Étape 4 — Démarrer l'API

```bash
cd invoicehub-api
pnpm start:dev
# → http://localhost:3005
# → http://localhost:3005/api   (préfixe API)
# → http://localhost:3005/api/docs  (Swagger)
```

L'API redémarre automatiquement à chaque modification de fichier (NestJS watch mode).

### Étape 5 — Configurer le frontend

Créer `bridge-frontend/.env.local` :

```env
NEXT_PUBLIC_API_URL=http://localhost:3005/api
NEXT_PUBLIC_SOCKET_URL=http://localhost:3005
NEXT_PUBLIC_APP_NAME=InvoiceHub
```

### Étape 6 — Démarrer le frontend

```bash
cd bridge-frontend
pnpm install   # première fois uniquement
pnpm dev
# → http://localhost:3001
```

### Résumé des URLs en développement

| Service | URL |
|---|---|
| Frontend | http://localhost:3001 |
| API | http://localhost:3005/api |
| Swagger | http://localhost:3005/api/docs |
| PostgreSQL | localhost:5432 (depuis l'hôte) |
| Redis | localhost:6379 (depuis l'hôte) |

### Arrêter l'environnement de dev

```bash
# Arrêter l'API et le frontend : Ctrl+C dans chaque terminal

# Arrêter DB et Redis
docker compose down
```

---

## Mode production

En production, tous les services tournent dans Docker. Nginx assure le reverse proxy.

### Étape 1 — Configurer l'environnement

```bash
cp .env.example .env
```

Remplir **toutes** les variables dans `.env` :

```env
# ── Base de données ──────────────────────────────────────────
DB_PASSWORD=mot_de_passe_fort_et_unique

# ── JWT — générer avec : openssl rand -hex 32 ────────────────
JWT_ACCESS_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
JWT_REFRESH_SECRET=yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy

# ── SMTP ─────────────────────────────────────────────────────
SMTP_HOST=smtp.votreserveur.cm
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=noreply@bts.cm
SMTP_PASS=mot_de_passe_smtp

# ── URLs publiques ────────────────────────────────────────────
APP_URL=http://invoicehub.bridgetech-solutions
BACKEND_URL=http://api.invoicehub.bridgetech-solutions
CORS_ORIGINS=http://invoicehub.bridgetech-solutions

# ── Frontend (baked au build) ─────────────────────────────────
NEXT_PUBLIC_API_URL=http://api.invoicehub.bridgetech-solutions/api
NEXT_PUBLIC_SOCKET_URL=http://api.invoicehub.bridgetech-solutions
```

> Si vous utilisez des IPs locales (réseau LAN sans DNS), remplacer les domaines
> par l'IP du serveur : `http://192.168.1.10:3005` etc.

### Étape 2 — Déployer (script automatisé)

```bash
# Windows — depuis la racine du projet
deploy.bat

# Options disponibles :
deploy.bat --skip-tests     # Ignorer la vérification TypeScript
deploy.bat --with-ollama    # Inclure le BTS Assistant (IA, ~3.7 GiB)
```

Le script effectue dans l'ordre :
1. Vérifie Docker, Git, pnpm, `.env`
2. `git pull origin main`
3. `pnpm install` + `prisma generate` (API et frontend)
4. Vérification TypeScript (API + frontend)
5. `docker compose down` + `docker compose build --no-cache` + `docker compose up -d`
6. Attente du healthcheck API (`/api/health`)
7. Téléchargement du modèle Ollama si `--with-ollama` (avec confirmation)
8. Démarrage de Nginx (`cd nginx && docker compose up -d`)

### Étape 2 bis — Déployer manuellement

Si vous préférez contrôler chaque étape :

```bash
# Depuis la racine du projet

# 1. Construire et démarrer les services principaux
docker compose build --no-cache
docker compose up -d

# Avec Ollama (BTS Assistant)
docker compose --profile ai build --no-cache
docker compose --profile ai up -d

# 2. Vérifier que l'API est saine
docker compose ps
docker compose logs api --tail=50

# 3. Démarrer Nginx
cd nginx
docker compose up -d
cd ..
```

### Étape 3 — Vérifier le déploiement

```bash
# Statut de tous les conteneurs
docker compose ps

# Logs en temps réel
docker compose logs -f api
docker compose logs -f frontend

# Test santé API
curl http://localhost:3005/api/health
```

### Résumé des URLs en production

| Service | Accès |
|---|---|
| Frontend | `APP_URL` (ex: http://invoicehub.bridgetech-solutions) |
| API | `BACKEND_URL/api` (ex: http://api.invoicehub.bridgetech-solutions/api) |
| PostgreSQL | Interne Docker uniquement |
| Redis | Interne Docker uniquement |
| Ollama | Interne Docker uniquement |

---

## Mise à jour (production existante)

```bash
# Depuis la racine du projet
deploy.bat

# Ou manuellement :
git pull origin main
docker compose build --no-cache api frontend
docker compose up -d --no-deps api frontend
```

Les migrations Prisma sont appliquées automatiquement au démarrage du conteneur `api`.

---

## Commandes utiles

### Logs

```bash
docker compose logs -f api        # Logs API en temps réel
docker compose logs -f frontend   # Logs frontend
docker compose logs --tail=100 db # Dernières lignes PostgreSQL
```

### Base de données

```bash
# Ouvrir Prisma Studio (dev uniquement — DB exposée)
cd invoicehub-api && pnpm exec prisma studio

# Accès psql direct dans le conteneur
docker compose exec db psql -U postgres -d invoicehub

# Backup manuel
docker compose exec db pg_dump -U postgres invoicehub > backup_$(date +%Y%m%d).sql
```

### Redémarrer un service

```bash
docker compose restart api
docker compose restart frontend
```

### Arrêter complètement

```bash
# Arrêter les services principaux (conserve les volumes)
docker compose down

# Arrêter Nginx
cd nginx && docker compose down

# Arrêter ET supprimer les volumes (DANGER : perte des données)
docker compose down -v
```

---

## Structure des volumes Docker

| Volume | Contenu |
|---|---|
| `invoicehub_postgres` | Données PostgreSQL |
| `invoicehub_redis` | Données Redis (queues persistées) |
| `invoicehub_uploads` | Fichiers uploadés (avatars, PDFs, logos) |
| `invoicehub_ollama` | Modèles Ollama téléchargés |

Les volumes sont conservés lors d'un `docker compose down`.
Ils ne sont supprimés qu'avec `docker compose down -v`.

---

## Résolution de problèmes

**L'API ne démarre pas**
```bash
docker compose logs api
# Vérifier : variables d'environnement manquantes, DB non disponible
```

**La DB refuse les connexions**
```bash
docker compose logs db
docker compose exec db pg_isready -U postgres
```

**Le frontend affiche "Cannot connect to API"**
- Vérifier que `NEXT_PUBLIC_API_URL` dans `.env` correspond à l'URL réelle de l'API
- En production Docker, l'URL doit être accessible depuis le navigateur du client (pas `localhost`)

**Prisma : erreur de migration**
```bash
docker compose exec api pnpm exec prisma migrate status
docker compose exec api pnpm exec prisma migrate deploy
```

**Réinitialiser complètement (dev uniquement)**
```bash
docker compose down -v
docker compose -f docker-compose.yml -f docker-compose.dev.yml up db redis -d
cd invoicehub-api
pnpm exec prisma migrate deploy
pnpm exec prisma db seed
```
