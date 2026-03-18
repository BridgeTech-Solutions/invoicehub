# Guide de déploiement — Production

Déploiement complet de InvoiceHub v2.0 sur un serveur Linux (Ubuntu 22.04 recommandé).

---

## Prérequis serveur

| Outil | Version minimale | Vérification |
|---|---|---|
| Docker | 24+ | `docker --version` |
| Docker Compose | 2.20+ | `docker compose version` |
| Git | 2.x | `git --version` |
| RAM | 2 Go minimum | — |
| Disque | 20 Go minimum | — |

```bash
# Installation Docker sur Ubuntu (si absent)
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker
```

---

## Étape 1 — Récupérer le code

```bash
git clone <url_du_repo> /opt/invoicehub
cd /opt/invoicehub/bridge-backend
```

---

## Étape 2 — Configurer les variables d'environnement

```bash
cp .env.example .env
nano .env
```

Remplir **obligatoirement** toutes ces variables :

```env
# ── Environnement ──────────────────────────────────────────
NODE_ENV=production
PORT=3000
API_PREFIX=/api

# ── Base de données ────────────────────────────────────────
# (DATABASE_URL est auto-construit par docker-compose depuis DB_PASSWORD)
DATABASE_URL=postgresql://postgres:CHANGER_CE_MOT_DE_PASSE@db:5432/invoicehub
DB_PASSWORD=CHANGER_CE_MOT_DE_PASSE          # ← mot de passe fort requis

# ── JWT ────────────────────────────────────────────────────
JWT_ACCESS_SECRET=GENERER_CLE_32_CHARS_MINIMUM_ICI_ACCESS
JWT_REFRESH_SECRET=GENERER_CLE_32_CHARS_MINIMUM_ICI_REFRESH
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# ── Redis ──────────────────────────────────────────────────
REDIS_URL=redis://redis:6379

# ── SMTP (email) ───────────────────────────────────────────
SMTP_HOST=smtp.gmail.com                     # ou smtp.office365.com pour M365
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=votre@email.com
SMTP_PASS=votre_mot_de_passe_applicatif
SMTP_FROM=facturation@bts.cm

# ── Application ────────────────────────────────────────────
APP_URL=https://api.bts.cm                   # URL publique du serveur
TOTP_ISSUER=InvoiceHub BTS

# ── Backups (Azure recommandé en prod) ─────────────────────
BACKUP_STORAGE_DISK=azure
AZURE_STORAGE_CONNECTION_STRING=DefaultEndpointsProtocol=https;AccountName=...
AZURE_STORAGE_CONTAINER=invoicehub-backups
BACKUP_RETENTION_DAYS=30
BACKUP_CRON=0 0 * * *
PGDUMP_PATH=pg_dump

# ── Puppeteer (PDF) ────────────────────────────────────────
PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
```

> **Générer des secrets JWT solides :**
> ```bash
> openssl rand -base64 48   # exécuter deux fois, une pour chaque secret
> ```

---

## Étape 3 — Premier lancement (initialisation DB)

```bash
cd /opt/invoicehub/bridge-backend

# Construire et démarrer tous les services
docker compose up -d --build

# Vérifier que tout est démarré
docker compose ps
```

Résultat attendu :
```
NAME                    STATUS          PORTS
bridge-backend-api-1    Up (healthy)    0.0.0.0:3000->3000/tcp
bridge-backend-db-1     Up (healthy)    5432/tcp
bridge-backend-redis-1  Up (healthy)    6379/tcp
```

> **À la première exécution**, PostgreSQL initialise automatiquement la base depuis
> `invoicehub_schema_v2.sql`. Attendre ~30 secondes avant de tester.

---

## Étape 4 — Vérifier que l'API répond

```bash
curl http://localhost:3000/health
```

Réponse attendue :
```json
{
  "status": "ok",
  "db": "ok",
  "redis": "ok",
  "uptime": 42,
  "env": "production"
}
```

---

## Étape 5 — Configurer NGINX (reverse proxy + HTTPS)

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
```

Créer le fichier de configuration :
```bash
sudo nano /etc/nginx/sites-available/invoicehub
```

```nginx
server {
    listen 80;
    server_name api.bts.cm;

    location / {
        proxy_pass         http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        client_max_body_size 10M;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/invoicehub /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# Activer HTTPS avec Let's Encrypt (certificat gratuit)
sudo certbot --nginx -d api.bts.cm
```

---

## Étape 6 — Créer le premier utilisateur admin

```bash
# Se connecter au container API
docker compose exec api sh

# Créer un utilisateur admin via psql
docker compose exec db psql -U postgres -d invoicehub -c "
INSERT INTO users (first_name, last_name, email, password_hash, role, status)
VALUES (
  'Admin', 'BTS',
  'admin@bts.cm',
  '\$2b\$12\$HASH_GENERE_PAR_BCRYPT',   -- remplacer par un vrai hash
  'admin',
  'active'
);
"
```

> **Alternative plus simple** : utiliser l'API directement après avoir temporairement
> exposé un endpoint de seed, ou insérer via Prisma Studio.

---

## Commandes du quotidien

```bash
# Voir les logs en temps réel
docker compose logs -f api

# Voir les logs d'un service spécifique
docker compose logs -f db
docker compose logs -f redis

# Redémarrer uniquement l'API (après mise à jour du code)
docker compose up -d --build api

# Arrêter tous les services (sans supprimer les données)
docker compose stop

# Arrêter ET supprimer les containers (données préservées dans les volumes)
docker compose down

# ⚠ Arrêter ET supprimer TOUT (données effacées)
docker compose down -v
```

---

## Mise à jour du code en production

```bash
cd /opt/invoicehub

# Récupérer les nouvelles versions
git pull origin main

cd bridge-backend

# Reconstruire et redémarrer l'API uniquement (zéro downtime DB/Redis)
docker compose up -d --build api

# Vérifier que la nouvelle version tourne
docker compose ps
curl http://localhost:3000/health
```

---

## Sauvegarde manuelle

```bash
# Déclencher un backup via l'API (token admin requis)
curl -X POST http://localhost:3000/api/backups \
  -H "Authorization: Bearer <ACCESS_TOKEN>"

# Vérifier le statut
curl http://localhost:3000/api/backups \
  -H "Authorization: Bearer <ACCESS_TOKEN>"
```

---

## Surveillance et logs

```bash
# Consommation ressources en temps réel
docker stats

# Espace disque utilisé par les volumes
docker system df -v

# Logs système (erreurs critiques)
docker compose logs api --since 1h | grep -i error
```

---

## Checklist sécurité avant mise en production

- [ ] `DB_PASSWORD` changé (pas `strongpassword`)
- [ ] `JWT_ACCESS_SECRET` et `JWT_REFRESH_SECRET` générés avec `openssl rand -base64 48`
- [ ] `APP_URL` pointe vers le vrai domaine HTTPS
- [ ] `NODE_ENV=production`
- [ ] HTTPS activé via Certbot
- [ ] Port 5432 (PostgreSQL) et 6379 (Redis) **non exposés** publiquement
- [ ] Backups cloud configurés (Azure / S3)
- [ ] `SMTP_PASS` configuré pour les emails transactionnels
- [ ] Firewall configuré (UFW) : seuls ports 80, 443, 22 ouverts

```bash
# Configuration firewall UFW
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
sudo ufw status
```

---

## Dépannage

### L'API ne démarre pas
```bash
docker compose logs api --tail 50
```

### La DB refuse les connexions
```bash
docker compose exec db pg_isready -U postgres -d invoicehub
docker compose logs db --tail 20
```

### Erreur `prisma` ou `schema`
```bash
# Régénérer le client Prisma dans le container
docker compose exec api sh -c "pnpm prisma:generate"
docker compose restart api
```

### Réinitialiser complètement la base (⚠ perte de données)
```bash
docker compose down -v
docker compose up -d
```

---

**Bridge Technologies Solutions (BTS)** · InvoiceHub v2.0 · Guide Production
