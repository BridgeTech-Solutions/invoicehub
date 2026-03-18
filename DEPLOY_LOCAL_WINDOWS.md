# Guide de déploiement — Serveur local Windows

> **InvoiceHub v2.0 — Bridge Technologies Solutions**
> Ce guide couvre le déploiement complet du projet sur une machine Windows 10/11
> avec Docker Desktop (méthode recommandée) ou en mode natif (sans Docker).

---

## Architecture du projet

```
BRIDGE/
├── bridge-backend/      ← API Node.js/Express  → port 3000
├── bridge-frontend/     ← Interface Next.js    → port 3001
├── invoicehub_schema_v2.sql
└── docker-compose.yml   ← Orchestre tout (DB + Redis + API + Frontend)
```

Dépendances système :
| Service | Rôle | Port |
|---------|------|------|
| PostgreSQL 15 | Base de données principale | 5432 |
| Redis 7 | Cache + files d'attente BullMQ | 6379 |
| API (Node.js 20) | Backend REST + WebSocket | 3000 |
| Frontend (Next.js 15) | Interface utilisateur | 3001 |

---

## MÉTHODE A — Docker Desktop (recommandée)

> La méthode la plus simple. Docker gère PostgreSQL, Redis, l'API et le Frontend en un seul `docker compose up`.

### Étape 1 — Installer les prérequis

#### 1.1 Docker Desktop
1. Télécharger : https://www.docker.com/products/docker-desktop/
2. Lancer l'installeur et suivre les étapes
3. Redémarrer Windows si demandé
4. Ouvrir Docker Desktop et attendre que l'icône dans la barre des tâches soit **verte**

Vérifier l'installation :
```cmd
docker --version
docker compose version
```
Résultat attendu :
```
Docker version 27.x.x
Docker Compose version v2.x.x
```

#### 1.2 Git (si pas encore installé)
Télécharger : https://git-scm.com/download/win — installation par défaut

---

### Étape 2 — Récupérer le projet

```cmd
cd C:\
git clone <url-du-depot> BTS-InvoiceHub
cd BTS-InvoiceHub
```

> Si vous avez déjà le dossier sur la machine, ignorez cette étape.

---

### Étape 3 — Configurer l'environnement backend

```cmd
cd bridge-backend
copy .env.example .env
```

Ouvrir le fichier `.env` avec le Bloc-notes ou VS Code et remplir **au minimum** :

```env
# ── Obligatoire ───────────────────────────────────────────────

NODE_ENV=production
PORT=3000

# Base de données (Docker gère cela automatiquement)
DATABASE_URL=postgresql://postgres:VotreMotDePasse@db:5432/invoicehub
DB_PASSWORD=VotreMotDePasse

# Secrets JWT — CHANGER ces valeurs (minimum 32 caractères)
JWT_ACCESS_SECRET=InvoiceHub_BTS_Secret_Access_2026_ChangeMe!
JWT_REFRESH_SECRET=InvoiceHub_BTS_Secret_Refresh_2026_ChangeMe!

# Redis (Docker gère cela automatiquement)
REDIS_URL=redis://redis:6379

# URL de l'application
APP_URL=http://localhost:3001
BACKEND_URL=http://localhost:3000

# TOTP (nom affiché dans Google Authenticator)
TOTP_ISSUER=InvoiceHub BTS

# ── Email SMTP (optionnel mais recommandé) ────────────────────
# Exemple avec Gmail :
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=votre.email@gmail.com
SMTP_PASS=votre-mot-de-passe-application
SMTP_FROM=noreply@bts.cm

# ── Backups (local par défaut) ────────────────────────────────
BACKUP_STORAGE_DISK=local
BACKUP_DIR=./uploads/backups
BACKUP_RETENTION_DAYS=30
```

> **Sécurité** : Ne jamais partager le fichier `.env`. Il contient les secrets de l'application.

> **Gmail** : Pour `SMTP_PASS`, utiliser un "Mot de passe d'application" généré dans Compte Google → Sécurité → Authentification à 2 facteurs → Mots de passe des applications.

---

### Étape 4 — Lancer le projet

Depuis le dossier `bridge-backend/` :

```cmd
docker compose up --build
```

La première fois, Docker va :
1. Télécharger les images (PostgreSQL, Redis, Node.js) — peut prendre 5-10 min selon la connexion
2. Construire l'image de l'API
3. Construire l'image du Frontend
4. Démarrer les 4 services

Vous verrez dans les logs :
```
db        | database system is ready to accept connections
redis     | Ready to accept connections
api       | Server running on port 3000
api       | Database connected
frontend  | Ready on http://localhost:3001
```

**L'application est prête.** Ouvrir : http://localhost:3001

---

### Étape 5 — Créer le premier compte administrateur

```cmd
docker compose exec api node dist/server.js
```

Ou via Prisma Studio pour insérer manuellement :

```cmd
docker compose exec api npx prisma studio
```

**Méthode recommandée** — utiliser le seed :
```cmd
docker compose exec api node -e "
const {PrismaClient} = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();
async function main() {
  const hash = await bcrypt.hash('Admin@2026!', 12);
  await prisma.user.create({
    data: {
      email: 'admin@bts.cm',
      passwordHash: hash,
      firstName: 'Admin',
      lastName: 'BTS',
      role: 'admin',
      isActive: true
    }
  });
  console.log('Admin créé : admin@bts.cm / Admin@2026!');
  await prisma.\$disconnect();
}
main();
"
```

Se connecter sur http://localhost:3001 avec `admin@bts.cm` / `Admin@2026!`

---

### Étape 6 — Arrêter et redémarrer

**Arrêter** (conserve les données) :
```cmd
docker compose down
```

**Redémarrer** (après un arrêt) :
```cmd
docker compose up
```

**Redémarrer avec reconstruction** (après une mise à jour du code) :
```cmd
docker compose up --build
```

**Supprimer complètement** (supprime TOUTES les données) :
```cmd
docker compose down -v
```

---

### Étape 7 — Vérifier que tout fonctionne

```cmd
# Voir les conteneurs en cours d'exécution
docker compose ps

# Voir les logs de l'API
docker compose logs api

# Voir les logs du frontend
docker compose logs frontend

# Tester l'API
curl http://localhost:3000/api/health
```

---

## MÉTHODE B — Installation native (sans Docker)

> Recommandée si Docker n'est pas disponible ou si vous voulez plus de contrôle.

### Prérequis à installer

#### B.1 Node.js 20 LTS
1. Télécharger : https://nodejs.org/en/download/ (choisir "LTS")
2. Installer avec les options par défaut
3. Vérifier :
```cmd
node --version   # v20.x.x
npm --version    # 10.x.x
```

#### B.2 pnpm
```cmd
npm install -g pnpm
pnpm --version   # 9.x.x
```

#### B.3 PostgreSQL 15
1. Télécharger : https://www.enterprisedb.com/downloads/postgres-postgresql-downloads
2. Choisir version **15.x** pour Windows x86-64
3. Pendant l'installation :
   - Mot de passe superuser : noter soigneusement (ex: `postgres2026`)
   - Port : `5432` (par défaut)
   - Locale : French, France (ou laisser par défaut)
4. Ne pas installer Stack Builder (optionnel)

Créer la base de données :
```cmd
# Ouvrir psql (menu Démarrer → PostgreSQL 15 → SQL Shell)
# Appuyer Entrée pour tout accepter, saisir le mot de passe

CREATE DATABASE invoicehub;
\q
```

Importer le schéma :
```cmd
cd C:\BTS-InvoiceHub
psql -U postgres -d invoicehub -f invoicehub_schema_v2.sql
```

#### B.4 Redis pour Windows
Redis n'a pas de version officielle Windows. Deux options :

**Option 1 — Redis via WSL (recommandé)**
```cmd
# Activer WSL2 (PowerShell en admin)
wsl --install
wsl --install -d Ubuntu

# Dans Ubuntu WSL
sudo apt update
sudo apt install redis-server
sudo service redis-server start
redis-cli ping   # Doit répondre PONG
```

**Option 2 — Memurai (Redis compatible, version gratuite)**
Télécharger : https://www.memurai.com/get-memurai
Installer et démarrer le service.

---

### B.5 Configurer et démarrer le Backend

```cmd
cd C:\BTS-InvoiceHub\bridge-backend
copy .env.example .env
```

Modifier `.env` :
```env
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://postgres:VotreMotDePasse@localhost:5432/invoicehub
REDIS_URL=redis://localhost:6379
JWT_ACCESS_SECRET=InvoiceHub_BTS_Secret_Access_2026_ChangeMe!
JWT_REFRESH_SECRET=InvoiceHub_BTS_Secret_Refresh_2026_ChangeMe!
APP_URL=http://localhost:3001
BACKEND_URL=http://localhost:3000
TOTP_ISSUER=InvoiceHub BTS
BACKUP_STORAGE_DISK=local
BACKUP_DIR=./uploads/backups
```

Installer les dépendances et démarrer :
```cmd
pnpm install
pnpm prisma:generate
pnpm build
pnpm start
```

L'API démarre sur http://localhost:3000

---

### B.6 Configurer et démarrer le Frontend

Ouvrir un **nouveau terminal** :

```cmd
cd C:\BTS-InvoiceHub\bridge-frontend
```

Créer le fichier `.env.local` :
```cmd
echo NEXT_PUBLIC_API_URL=http://localhost:3000/api > .env.local
echo NEXT_PUBLIC_SOCKET_URL=http://localhost:3000 >> .env.local
echo NEXT_PUBLIC_APP_NAME=InvoiceHub >> .env.local
```

Installer et démarrer :
```cmd
pnpm install
pnpm build
pnpm start
```

Le frontend démarre sur http://localhost:3001

---

## Démarrage automatique au lancement de Windows

### Avec Docker (méthode A)

Docker Desktop démarre automatiquement avec Windows. Pour que les conteneurs redémarrent aussi :

Dans `docker-compose.yml`, chaque service a déjà `restart: unless-stopped` — les conteneurs redémarrent automatiquement après un reboot si Docker Desktop est en cours d'exécution.

### Sans Docker (méthode B) — via NSSM

**NSSM** permet d'enregistrer n'importe quelle commande comme service Windows.

1. Télécharger NSSM : https://nssm.cc/download
2. Extraire dans `C:\nssm\`
3. Ouvrir PowerShell en **administrateur**

Enregistrer l'API :
```cmd
C:\nssm\win64\nssm.exe install InvoiceHub-API "C:\Program Files\nodejs\node.exe"
C:\nssm\win64\nssm.exe set InvoiceHub-API AppDirectory "C:\BTS-InvoiceHub\bridge-backend"
C:\nssm\win64\nssm.exe set InvoiceHub-API AppParameters "dist/server.js"
C:\nssm\win64\nssm.exe set InvoiceHub-API AppEnvironmentExtra "NODE_ENV=production"
C:\nssm\win64\nssm.exe start InvoiceHub-API
```

Enregistrer le Frontend :
```cmd
C:\nssm\win64\nssm.exe install InvoiceHub-Frontend "C:\Program Files\nodejs\node.exe"
C:\nssm\win64\nssm.exe set InvoiceHub-Frontend AppDirectory "C:\BTS-InvoiceHub\bridge-frontend"
C:\nssm\win64\nssm.exe set InvoiceHub-Frontend AppParameters ".next\standalone\server.js"
C:\nssm\win64\nssm.exe start InvoiceHub-Frontend
```

Vérifier les services :
```cmd
sc query InvoiceHub-API
sc query InvoiceHub-Frontend
```

---

## Mettre à jour l'application

### Avec Docker
```cmd
cd C:\BTS-InvoiceHub
git pull
cd bridge-backend
docker compose up --build
```

### Sans Docker
```cmd
cd C:\BTS-InvoiceHub
git pull

# Backend
cd bridge-backend
pnpm install
pnpm prisma:generate
pnpm build
# Redémarrer le service : nssm restart InvoiceHub-API

# Frontend
cd ..\bridge-frontend
pnpm install
pnpm build
# Redémarrer le service : nssm restart InvoiceHub-Frontend
```

---

## Accès réseau local (LAN)

Pour accéder à l'application depuis d'autres machines du réseau local :

### 1. Trouver l'IP de la machine serveur
```cmd
ipconfig
```
Noter l'adresse `IPv4` (ex: `192.168.1.50`)

### 2. Ouvrir les ports dans le pare-feu Windows
```cmd
# PowerShell en administrateur
New-NetFirewallRule -DisplayName "InvoiceHub API" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow
New-NetFirewallRule -DisplayName "InvoiceHub Frontend" -Direction Inbound -Protocol TCP -LocalPort 3001 -Action Allow
```

### 3. Mettre à jour les URLs (méthode Docker)

Dans `bridge-backend/.env` :
```env
APP_URL=http://192.168.1.50:3001
BACKEND_URL=http://192.168.1.50:3000
```

Dans `bridge-frontend/.env.local` (ou reconstruire avec les bons ARGs Docker) :
```env
NEXT_PUBLIC_API_URL=http://192.168.1.50:3000/api
NEXT_PUBLIC_SOCKET_URL=http://192.168.1.50:3000
```

Reconstruire :
```cmd
docker compose up --build
```

Les autres machines du réseau accèdent via : `http://192.168.1.50:3001`

---

## Résolution des problèmes fréquents

### Docker Desktop ne démarre pas
- Vérifier que **WSL 2** est activé : `wsl --update` dans PowerShell admin
- Vérifier que la **virtualisation** est activée dans le BIOS (Intel VT-x / AMD-V)
- Redémarrer le service Docker : clic droit sur l'icône Docker → Restart

### Port déjà utilisé (erreur `EADDRINUSE`)
```cmd
# Trouver le processus qui utilise le port 3000
netstat -ano | findstr :3000
# Terminer le processus (remplacer XXXX par le PID trouvé)
taskkill /PID XXXX /F
```

### Erreur de connexion PostgreSQL
```cmd
# Vérifier que PostgreSQL tourne
sc query postgresql-x64-15

# Tester la connexion
psql -U postgres -d invoicehub -c "SELECT version();"
```

### Redis ne répond pas
```cmd
# WSL
wsl -e service redis-server status
wsl -e service redis-server start

# Tester
wsl -e redis-cli ping   # Doit répondre PONG
```

### L'API démarre mais la base est vide
Le schéma SQL est chargé automatiquement par Docker au premier démarrage.
En mode natif, importer manuellement :
```cmd
psql -U postgres -d invoicehub -f C:\BTS-InvoiceHub\invoicehub_schema_v2.sql
```

### Puppeteer / PDF ne fonctionne pas
Puppeteer (génération PDF) nécessite des dépendances système.
Avec Docker, tout est inclus dans l'image.
En mode natif sur Windows, installer Chrome ou Chromium et ajouter dans `.env` :
```env
PUPPETEER_EXECUTABLE_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe
```

### Erreur CORS depuis le frontend
Vérifier que `APP_URL` dans `.env` correspond exactement à l'adresse utilisée par le navigateur (avec le bon port).

---

## Sauvegarde des données

### Sauvegarde manuelle de la base (Docker)
```cmd
docker compose exec db pg_dump -U postgres invoicehub > backup_invoicehub_%DATE%.sql
```

### Sauvegarde manuelle de la base (native)
```cmd
pg_dump -U postgres -d invoicehub -f C:\Backups\invoicehub_%DATE%.sql
```

### Restaurer une sauvegarde
```cmd
# Docker
docker compose exec -T db psql -U postgres invoicehub < backup_invoicehub.sql

# Native
psql -U postgres -d invoicehub -f C:\Backups\backup_invoicehub.sql
```

### Sauvegarde des fichiers uploadés (Docker)
```cmd
docker cp bridge-backend-api-1:/app/uploads C:\Backups\uploads
```

---

## Récapitulatif des URLs

| Service | URL locale | URL réseau LAN (exemple) |
|---------|-----------|--------------------------|
| Application | http://localhost:3001 | http://192.168.1.50:3001 |
| API | http://localhost:3000/api | http://192.168.1.50:3000/api |
| Prisma Studio (debug) | http://localhost:5555 | — |

---

## Checklist de déploiement

- [ ] Docker Desktop installé et démarré (méthode A)
- [ ] Fichier `bridge-backend/.env` créé depuis `.env.example`
- [ ] `DB_PASSWORD` changé (valeur forte)
- [ ] `JWT_ACCESS_SECRET` changé (32+ caractères)
- [ ] `JWT_REFRESH_SECRET` changé (32+ caractères, différent du précédent)
- [ ] SMTP configuré (optionnel mais recommandé)
- [ ] `docker compose up --build` exécuté avec succès
- [ ] Compte administrateur créé
- [ ] Connexion testée sur http://localhost:3001
- [ ] Pare-feu configuré si accès LAN nécessaire
- [ ] Démarrage automatique configuré
