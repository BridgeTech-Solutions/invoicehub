# Module Backups — Guide complet

Sauvegarde automatique de la base de données PostgreSQL (et optionnellement des fichiers uploadés) avec stockage **local**, **Amazon S3 / Cloudflare R2 / MinIO**, **Google Cloud Storage**, **Microsoft Azure Blob Storage** ou **Microsoft OneDrive** (Microsoft 365).

---

## Sommaire

1. [Fonctionnement général](#fonctionnement-général)
2. [Types de backup](#types-de-backup)
3. [Configuration](#configuration)
   - [Stockage local](#stockage-local)
   - [Amazon S3 / Cloudflare R2 / MinIO](#amazon-s3--cloudflare-r2--minio)
   - [Google Cloud Storage](#google-cloud-storage)
   - [Microsoft Azure Blob Storage](#microsoft-azure-blob-storage)
   - [Microsoft OneDrive (Microsoft 365)](#microsoft-onedrive-microsoft-365)
4. [Endpoints API](#endpoints-api)
5. [Backup automatique (cron)](#backup-automatique-cron)
6. [Flux d'exécution](#flux-dexécution)
7. [Docker / Production](#docker--production)
8. [Sécurité](#sécurité)
9. [Dépannage](#dépannage)

---

## Fonctionnement général

Le module génère un backup de la base PostgreSQL via `pg_dump`, le compresse, le stocke (localement ou cloud) et enregistre les métadonnées dans la table `backups`.

```
POST /api/backups
  → Enqueue job BullMQ (async)
  → Répond immédiatement 202 { backupId }

Worker (fond):
  → status: pending → running
  → pg_dump → invoicehub_db_20260422_153000.sql.gz       (BD uniquement)
              ou invoicehub_full_20260422_153000.tar.gz   (BD + uploads)
  → Upload sur le disque configuré
  → status: running → success (ou failed)
```

Les backups sont exécutés en arrière-plan dans une queue BullMQ dédiée pour ne pas bloquer l'API.

---

## Types de backup

Deux modes contrôlés par `BACKUP_INCLUDE_FILES` :

| Mode | Valeur | Fichier produit | Contenu |
|---|---|---|---|
| BD uniquement | `false` (défaut) | `invoicehub_db_YYYYMMDD_HHmmss.sql.gz` | Export PostgreSQL compressé |
| Complet | `true` | `invoicehub_full_YYYYMMDD_HHmmss.tar.gz` | BD + logos + avatars + PDFs |

Structure du backup complet :
```
invoicehub_full_20260422_153000.tar.gz
├── database.sql     ← export complet de la base de données
└── uploads/
    ├── logos/       ← logo, tampon, signature entreprise
    ├── avatars/     ← photos de profil utilisateurs
    └── invoices/    ← PDFs générés (factures, proformas)
```

---

## Configuration

### Variables d'environnement

Ajouter dans `.env` :

```env
# ── Backup ───────────────────────────────────────────────────────────────────
BACKUP_STORAGE_DISK=local         # local | s3 | google | azure | onedrive
BACKUP_DIR=./uploads/backups      # Dossier local (utilisé si DISK=local)
PGDUMP_PATH=pg_dump               # Chemin vers pg_dump (ou absolu si besoin)
BACKUP_RETENTION_DAYS=30          # Suppression auto après N jours
BACKUP_CRON=30 15 * * *           # Heure de backup (UTC). 15h30 UTC = 16h30 WAT Cameroun
BACKUP_INCLUDE_FILES=false        # true = BD + uploads/ (tar.gz) | false = BD seule (sql.gz)
UPLOADS_DIR=./uploads             # Dossier uploads à inclure si BACKUP_INCLUDE_FILES=true

# ── Amazon S3 / Cloudflare R2 / MinIO ────────────────────────────────────────
S3_BUCKET=invoicehub-backups
S3_REGION=eu-west-1
S3_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
S3_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
S3_ENDPOINT=                      # Laisser vide pour AWS. Remplir pour R2/MinIO
                                  # Ex R2 : https://ACCOUNT_ID.r2.cloudflarestorage.com
                                  # Ex MinIO : http://localhost:9000

# ── Google Cloud Storage ──────────────────────────────────────────────────────
GCS_BUCKET=invoicehub-backups
GCS_KEY_FILE=./gcs-service-account.json   # Chemin vers le fichier JSON de compte de service
```

---

### Stockage local

```env
BACKUP_STORAGE_DISK=local
BACKUP_DIR=./uploads/backups
```

Les fichiers sont stockés dans `uploads/backups/` à la racine du projet.
Le dossier est créé automatiquement au démarrage.

`GET /api/backups/:id/download` renvoie le fichier en streaming direct.

---

### Amazon S3 / Cloudflare R2 / MinIO

#### Amazon S3

```env
BACKUP_STORAGE_DISK=s3
S3_BUCKET=invoicehub-backups
S3_REGION=eu-west-1
S3_ACCESS_KEY_ID=AKIA...
S3_SECRET_ACCESS_KEY=...
```

Créer le bucket S3 avec les permissions IAM minimales :

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject", "s3:ListBucket"],
      "Resource": [
        "arn:aws:s3:::invoicehub-backups",
        "arn:aws:s3:::invoicehub-backups/*"
      ]
    }
  ]
}
```

#### Cloudflare R2

```env
BACKUP_STORAGE_DISK=s3
S3_BUCKET=invoicehub-backups
S3_REGION=auto
S3_ACCESS_KEY_ID=<R2_ACCESS_KEY_ID>
S3_SECRET_ACCESS_KEY=<R2_SECRET_ACCESS_KEY>
S3_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
```

R2 est compatible S3. Avantage : **pas de frais d'egress** (téléchargement gratuit).



```

Idéal pour un environnement de staging ou de test on-premise.

`GET /api/backups/:id/download` génère une **presigned URL** (valide 5 minutes) et redirige (302).

---

### Google Cloud Storage

```env
BACKUP_STORAGE_DISK=google
GCS_BUCKET=invoicehub-backups
GCS_KEY_FILE=./gcs-service-account.json
```

**Créer un compte de service GCP :**

1. GCP Console → IAM → Comptes de service → Créer
2. Rôle : `Storage Object Admin` sur le bucket
3. Créer une clé JSON → télécharger → placer dans le projet
4. **Ne pas committer ce fichier** (ajouter à `.gitignore`)

`GET /api/backups/:id/download` génère une **signed URL** (valide 5 minutes) et redirige (302).

---

### Microsoft Azure Blob Storage

```env
BACKUP_STORAGE_DISK=azure
AZURE_STORAGE_CONNECTION_STRING=DefaultEndpointsProtocol=https;AccountName=...;AccountKey=...;EndpointSuffix=core.windows.net
AZURE_STORAGE_CONTAINER=invoicehub-backups
```

**Récupérer la chaîne de connexion :**

1. Portail Azure → Comptes de stockage → Créer (ou utiliser un existant)
2. Sélectionner le compte → **Sécurité + réseau** → **Clés d'accès**
3. Copier la **Chaîne de connexion** (Connection string) de key1 ou key2
4. Créer le conteneur : **Stockage de données** → **Conteneurs** → `+ Conteneur` → nom : `invoicehub-backups`, accès : **Privé**

**Avantages pour Microsoft 365 :**
- Intégration native avec l'écosystème Microsoft (Azure AD, Teams, SharePoint)
- Facturé sur le même abonnement Azure que Microsoft 365
- Géo-redondance configurable (LRS, ZRS, GRS)
- Conformité RGPD avec centres de données en Europe

`GET /api/backups/:id/download` génère une **URL SAS** (valide 5 minutes) et redirige (302).

---

### Microsoft OneDrive (Microsoft 365)

```env
BACKUP_STORAGE_DISK=onedrive
ONEDRIVE_TENANT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
ONEDRIVE_CLIENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
ONEDRIVE_CLIENT_SECRET=VotreSecretClient~xxxxxxxxxxxx
ONEDRIVE_DRIVE_ID=               # Optionnel — vide = OneDrive de l'application
ONEDRIVE_FOLDER_PATH=InvoiceHub/Backups
```

**Prérequis :** App Registration Azure AD avec permission `Files.ReadWrite.All` (Application).  
**Configuration complète :** voir `GUIDE_ONEDRIVE_BACKUP.md` à la racine du projet.

**Avantages :**
- Inclus gratuitement dans tout abonnement Microsoft 365 (aucun coût Azure supplémentaire)
- Fichiers accessibles depuis l'interface OneDrive de l'entreprise
- Upload par chunks (résistant aux coupures réseau)
- Dossier `InvoiceHub/Backups` créé automatiquement

`GET /api/backups/:id/download` génère un **lien de partage OneDrive** (valide 1 heure, portée organisation) et redirige (302).

---

## Endpoints API

Tous réservés au rôle **`admin`**.

| Méthode | Route | Description |
|---|---|---|
| `POST` | `/api/backups` | Déclencher un backup manuel |
| `GET` | `/api/backups` | Liste des backups (paginée) |
| `GET` | `/api/backups/:id` | Détail d'un backup |
| `GET` | `/api/backups/:id/download` | Télécharger le fichier |
| `DELETE` | `/api/backups/:id` | Supprimer (fichier + enregistrement) |

### POST /api/backups

Déclenche un backup en arrière-plan. Réponse immédiate.

```http
POST /api/backups
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "note": "Backup avant migration v2.1"   // optionnel
}
```

**Réponse 202 :**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "filename": "invoicehub_20260310_143022.sql.gz",
    "status": "pending",
    "createdAt": "2026-03-10T14:30:22Z"
  },
  "message": "Backup en cours de création..."
}
```

**Rate limit :** 3 backups par heure par utilisateur.

---

### GET /api/backups

```http
GET /api/backups?page=1&limit=20&status=success
Authorization: Bearer <admin_token>
```

**Filtres :** `status` (pending / running / success / failed), `page`, `limit`

**Réponse 200 :**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "filename": "invoicehub_20260310_000000.sql.gz",
      "sizeBytes": 2457600,
      "sizeMb": "2.34",
      "status": "success",
      "storageDisk": "s3",
      "storagePath": "backups/invoicehub_20260310_000000.sql.gz",
      "createdAt": "2026-03-10T00:00:00Z",
      "completedAt": "2026-03-10T00:00:47Z",
      "durationSeconds": 47
    }
  ],
  "total": 15,
  "page": 1,
  "limit": 20,
  "totalPages": 1
}
```

---

### GET /api/backups/:id/download

- **Disk local** → stream du fichier `.sql.gz` directement
- **S3 / R2 / MinIO** → redirection 302 vers une presigned URL (expire 5 min)
- **GCS** → redirection 302 vers une signed URL (expire 5 min)

```http
GET /api/backups/uuid/download
Authorization: Bearer <admin_token>
```

**Headers réponse (disk local) :**
```
Content-Type: application/gzip
Content-Disposition: attachment; filename="invoicehub_20260310_143022.sql.gz"
Content-Length: 2457600
```

---

### DELETE /api/backups/:id

Supprime le fichier du stockage ET l'enregistrement en base.

```http
DELETE /api/backups/uuid
Authorization: Bearer <admin_token>
```

**Réponse 200 :**
```json
{ "success": true, "message": "Backup supprimé" }
```

---

## Backup automatique (cron)

Un cron BullMQ déclenche automatiquement un backup **chaque jour à 15h30 UTC (16h30 WAT — Cameroun)**.

```
Cron 15h30 UTC → backupQueue.add() → Worker → pg_dump → compression → stockage
```

Le cron est configurable via la variable `BACKUP_CRON` :

```env
BACKUP_CRON=30 15 * * *   # Défaut : 15h30 UTC = 16h30 WAT (Cameroun)
                           # Exemples :
                           # 0 0 * * *   → minuit UTC
                           # 0 */6 * * * → toutes les 6h
                           # 0 2 * * 0   → dimanche à 02:00 UTC
```

**Rétention automatique** : les backups de plus de `BACKUP_RETENTION_DAYS` jours sont supprimés automatiquement du stockage ET de la base de données.

```env
BACKUP_RETENTION_DAYS=30   # Défaut : 30 jours
```

---

## Flux d'exécution

```
┌─────────────────────────────────────────────────────────────┐
│  API POST /api/backups  (ou cron automatique)               │
│                                                             │
│  1. Crée Backup { status: 'pending' } en DB                 │
│  2. Enqueue job backupQueue                                  │
│  3. Retourne 202 { backupId }                               │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  Worker BullMQ (backup.processor.ts)                        │
│                                                             │
│  1. Update status: 'running'                                │
│  2. spawn pg_dump avec PGPASSWORD depuis DATABASE_URL       │
│  3. Pipe vers gzip → fichier temporaire                     │
│  4. Selon BACKUP_STORAGE_DISK :                             │
│       local  → déplace dans BACKUP_DIR                     │
│       s3     → PutObjectCommand → S3/R2/MinIO               │
│       google → storage.bucket().upload()                    │
│  5. Supprime le fichier temporaire (si cloud)               │
│  6. Update status: 'success', sizeBytes, completedAt        │
│                                                             │
│  En cas d'erreur :                                          │
│  → Update status: 'failed', errorMessage                    │
│  → Pas de retry (données critiques, éviter les doublons)    │
└─────────────────────────────────────────────────────────────┘
```

---

## Docker / Production

Le Dockerfile installe `postgresql-client` pour avoir `pg_dump` disponible.

```dockerfile
RUN apt-get update && apt-get install -y \
    postgresql-client \
    --no-install-recommends
```

**Variables d'env à configurer dans `docker-compose.yml` :**

```yaml
environment:
  BACKUP_STORAGE_DISK: s3           # Recommandé en prod : s3 ou google
  S3_BUCKET: invoicehub-backups
  S3_REGION: eu-west-1
  S3_ACCESS_KEY_ID: ${S3_ACCESS_KEY_ID}
  S3_SECRET_ACCESS_KEY: ${S3_SECRET_ACCESS_KEY}
  BACKUP_RETENTION_DAYS: 30
  PGDUMP_PATH: pg_dump
```

**Recommandation production :**
- Utiliser **S3 / R2 / GCS** pour le stockage cloud — jamais de stockage local en production (perte des backups si le conteneur est recréé)
- Cloudflare R2 est recommandé pour les coûts (0 frais d'egress)
- Activer le **versioning S3** sur le bucket pour une protection supplémentaire

---

## Sécurité

| Point | Détail |
|---|---|
| Accès | Réservé au rôle `admin` uniquement |
| Rate limit | 3 backups manuels/heure/utilisateur |
| Audit | Chaque backup déclenché est enregistré dans `audit_logs` |
| PGPASSWORD | Transmis uniquement via variable d'env du processus enfant, jamais en clair dans les logs |
| Presigned URL | Valide 5 minutes uniquement (S3/GCS) |
| Fichiers locaux | Stockés hors de la racine web (non accessibles directement via HTTP) |
| `.gitignore` | `gcs-service-account.json` et `uploads/backups/` doivent être ignorés |

---

## Dépannage

### `pg_dump: command not found`

```bash
# Debian/Ubuntu (Docker)
apt-get install -y postgresql-client

# Windows — ajouter le chemin dans .env
PGDUMP_PATH=C:\Program Files\PostgreSQL\15\bin\pg_dump.exe
```

### `Access Denied` sur S3

Vérifier que la politique IAM inclut `s3:PutObject` et `s3:GetObject` sur le bucket.

### Backup en statut `running` bloqué

Le worker a planté pendant l'exécution. Supprimer l'enregistrement et relancer.

### `invalid signature` sur GCS

Le fichier `GCS_KEY_FILE` est incorrect ou expiré. Regénérer la clé dans GCP Console.

### Presigned URL expirée

L'URL S3/GCS est valide 5 minutes. Rappeler `GET /api/backups/:id/download` pour en obtenir une nouvelle.

---

**Bridge Technologies Solutions (BTS)** · Module Backups v1.0
