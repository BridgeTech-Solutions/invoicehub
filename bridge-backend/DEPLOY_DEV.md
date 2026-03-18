# Guide de développement et test local

Mise en place de l'environnement de développement InvoiceHub v2.0 sur Windows, macOS ou Linux.

---

## Deux modes disponibles

| Mode | Description | Commande |
|---|---|---|
| **Local** | Node.js directement sur la machine, hot reload natif | `pnpm dev` |
| **Docker dev** | Tout dans Docker, hot reload via volume | `docker compose -f docker-compose.yml -f docker-compose.dev.yml up` |

---

## Prérequis

| Outil | Version | Lien |
|---|---|---|
| Node.js | 20+ | https://nodejs.org |
| pnpm | 9+ | `npm install -g pnpm` |
| Docker Desktop | 24+ | https://www.docker.com/products/docker-desktop |
| Git | 2.x | https://git-scm.com |

---

## Mode 1 — Local (recommandé pour le développement actif)

### 1.1  Cloner et installer

```bash
git clone <url_du_repo>
cd bridge-backend

# Installer toutes les dépendances
pnpm install
```

### 1.2  Démarrer PostgreSQL + Redis uniquement via Docker

```bash
# Démarrer uniquement la DB et Redis (pas l'API)
docker compose up db redis -d

# Vérifier qu'ils sont prêts
docker compose ps
```

### 1.3  Configurer l'environnement

```bash
cp .env.example .env
```

Ouvrir `.env` et s'assurer que ces valeurs sont présentes :

```env
NODE_ENV=development
PORT=3000
API_PREFIX=/api

# Base de données (DB dans Docker, accessible sur localhost:5432)
DATABASE_URL=postgresql://postgres:strongpassword@localhost:5432/invoicehub
DB_PASSWORD=strongpassword

# JWT (valeurs de dev, non sécurisées)
JWT_ACCESS_SECRET=dev_access_secret_minimum_32_characters_here
JWT_REFRESH_SECRET=dev_refresh_secret_minimum_32_characters_here
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# Redis (dans Docker, accessible sur localhost:6379)
REDIS_URL=redis://localhost:6379

# SMTP (optionnel en dev — désactivé si absent)
# SMTP_HOST=smtp.gmail.com
# SMTP_PORT=587
# SMTP_USER=
# SMTP_PASS=

APP_URL=http://localhost:3000
TOTP_ISSUER=InvoiceHub BTS

# PDF — Chrome local sur Windows
PUPPETEER_EXECUTABLE_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe

# Backups en dev (stockage local)
BACKUP_STORAGE_DISK=local
BACKUP_DIR=./uploads/backups
BACKUP_RETENTION_DAYS=7
PGDUMP_PATH=pg_dump
```

### 1.4  Initialiser la base de données

```bash
# Générer le client Prisma
pnpm prisma:generate

# Vérifier que le schéma SQL a bien été appliqué (au premier démarrage Docker)
# La DB est initialisée automatiquement depuis invoicehub_schema_v2.sql
# Si besoin de forcer :
docker compose exec db psql -U postgres -d invoicehub -f /docker-entrypoint-initdb.d/init.sql
```

### 1.5  Lancer le serveur en mode hot reload

```bash
pnpm dev
```

L'API est disponible sur **http://localhost:3000**

Tester :
```bash
curl http://localhost:3000/health
# → { "status": "ok", "db": "ok", "redis": "ok" }
```

---

## Mode 2 — Docker complet (tout dans Docker)

```bash
cd bridge-backend

# Copier l'env
cp .env.example .env
# (même contenu que le mode local, DATABASE_URL utilise le nom de service 'db')

# Lancer avec l'override dev (hot reload + ports exposés)
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build

# En arrière-plan
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build -d
```

> En mode Docker dev, le code source est monté en volume : toute modification de fichier
> déclenche automatiquement un redémarrage du serveur via `tsx watch`.

---

## Tester avec Postman

### Importer la collection

1. Ouvrir Postman
2. **Import** → sélectionner `postman/InvoiceHub_v2.postman_collection.json`
3. **Import** → sélectionner `postman/InvoiceHub_Dev.postman_environment.json`
4. Sélectionner l'environnement **InvoiceHub Dev** en haut à droite

### Variables d'environnement Postman

| Variable | Valeur par défaut | Description |
|---|---|---|
| `base_url` | `http://localhost:3000/api` | URL de base de l'API |
| `access_token` | _(auto-rempli au login)_ | JWT access token |
| `refresh_token` | _(auto-rempli au login)_ | JWT refresh token |

### Première connexion

Dans le dossier **01 — Auth**, lancer la requête **Login** :

```json
{
  "email": "admin@bts.cm",
  "password": "Admin1234!"
}
```

Le script de test Postman sauvegarde automatiquement `access_token` dans l'environnement.
Toutes les requêtes suivantes utilisent ce token automatiquement.

### Ordre de test recommandé

```
1. Auth → Login
2. Paramètres → GET Paramètres (vérifier la config entreprise)
3. Utilisateurs → Créer un utilisateur commercial
4. Clients → Créer un client
5. Produits → Créer une catégorie → Créer un produit
6. Proformas → Créer → Envoyer → Accepter → Convertir en facture
7. Factures → Émettre → Enregistrer un paiement
8. Factures → Télécharger PDF
9. Dashboard → KPIs
10. Backups → Déclencher un backup manuel
```

---

## Commandes utiles en développement

```bash
# ── Prisma ────────────────────────────────────────────────
pnpm prisma:generate          # Régénérer le client après modification du schema.prisma
pnpm prisma:push              # Appliquer le schéma Prisma directement sur la DB (dev)
pnpm prisma:studio            # Ouvrir l'interface graphique de la DB (http://localhost:5555)

# ── Compilation ───────────────────────────────────────────
pnpm build                    # Compiler TypeScript → dist/
pnpm start                    # Lancer la version compilée

# ── Docker ────────────────────────────────────────────────
docker compose up db redis -d              # Démarrer DB + Redis seulement
docker compose stop                        # Arrêter sans supprimer
docker compose down                        # Arrêter et supprimer les containers
docker compose down -v                     # ⚠ Supprimer aussi les données

# ── Base de données ───────────────────────────────────────
# Ouvrir psql dans le container
docker compose exec db psql -U postgres -d invoicehub

# Réinitialiser la DB (repart de zéro)
docker compose down -v && docker compose up db redis -d

# Snapshot rapide de la DB locale
docker compose exec db pg_dump -U postgres invoicehub > backup_dev.sql
```

---

## Prisma Studio — Interface graphique de la DB

```bash
pnpm prisma:studio
```

Ouvre **http://localhost:5555** — interface pour consulter et modifier les données directement.

Très utile pour :
- Vérifier qu'un enregistrement a bien été créé
- Corriger des données de test
- Explorer les relations entre tables

---

## Tester la génération PDF

Pour que Puppeteer fonctionne en dev sur Windows, Chrome doit être installé
et le chemin configuré dans `.env` :

```env
PUPPETEER_EXECUTABLE_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe
```

Tester via Postman :
```
GET /api/proformas/{{proforma_id}}/pdf
GET /api/invoices/{{invoice_id}}/pdf
GET /api/payments/{{payment_id}}/receipt
```

---

## Tester les emails (sans vrai SMTP)

En développement, il est recommandé d'utiliser **Mailhog** ou **Mailpit**
pour capturer les emails sans les envoyer réellement :

```bash
# Ajouter Mailpit au docker-compose.dev.yml (optionnel)
docker run -d -p 1025:1025 -p 8025:8025 axllent/mailpit
```

Puis dans `.env` :
```env
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
```

Interface web Mailpit : **http://localhost:8025**

---

## Tester les backups en local

```bash
# S'assurer que pg_dump est accessible
pg_dump --version

# Sur Windows, si pg_dump n'est pas dans le PATH :
# Ajouter C:\Program Files\PostgreSQL\15\bin au PATH système
# ou configurer dans .env :
PGDUMP_PATH=C:\Program Files\PostgreSQL\15\bin\pg_dump.exe
```

Déclencher un backup via Postman :
```
POST /api/backups
Authorization: Bearer {{access_token}}
```

Vérifier le fichier créé dans `uploads/backups/`.

---

## Structure des logs

```bash
# Logs en temps réel
pnpm dev

# Niveaux de logs (configurés dans src/core/middleware/requestLogger.ts)
# development : HTTP requests + debug
# production  : HTTP requests + error uniquement
```

---

## Résolution des problèmes courants

### `pnpm install` échoue
```bash
# Nettoyer le cache et réinstaller
pnpm store prune
rm -rf node_modules
pnpm install
```

### Erreur `Can't reach database server`
```bash
# Vérifier que le container DB tourne
docker compose ps

# Vérifier que DATABASE_URL pointe sur localhost (pas 'db') en mode local
echo $DATABASE_URL
# doit être : postgresql://postgres:...@localhost:5432/invoicehub
```

### Erreur `ECONNREFUSED redis`
```bash
# Vérifier Redis
docker compose up redis -d
redis-cli -h localhost ping    # doit répondre PONG
```

### Erreur `Prisma schema out of sync`
```bash
pnpm prisma:generate
# puis redémarrer pnpm dev
```

### Port 3000 déjà utilisé
```bash
# Trouver le processus
netstat -ano | findstr :3000       # Windows
lsof -i :3000                      # Linux/macOS

# Changer le port dans .env
PORT=3001
```

---

**Bridge Technologies Solutions (BTS)** · InvoiceHub v2.0 · Guide Développement
