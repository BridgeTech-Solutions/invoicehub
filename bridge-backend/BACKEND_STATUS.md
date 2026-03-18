# InvoiceHub v2.0 — État du Backend & Feuille de Route

**Projet** : InvoiceHub v2.0 — Bridge Technologies Solutions (BTS), Douala, Cameroun
**Stack** : Node.js · Express · TypeScript · Prisma · PostgreSQL 15+ · Redis · BullMQ
**Conformité** : SYSCOHADA — numérotation `BTS/{BUREAU}/{AAAA}/{MM}/{type}{XXX}`
**Dernière mise à jour** : 2026-03-06

---

## Table des matières

1. [Architecture générale](#1-architecture-générale)
2. [État actuel — Fonctionnalités implémentées](#2-état-actuel--fonctionnalités-implémentées)
3. [Améliorations recommandées](#3-améliorations-recommandées)
4. [Détail des recommandations](#4-détail-des-recommandations)
   - R01 — Documentation Swagger/OpenAPI
   - R02 — Health check enrichi
   - R03 — Upload logo / cachet / signature
   - R04 — Gestion des sessions actives
   - R05 — Rapport de vieillissement des créances
   - R06 — Export CSV des listes
   - R07 — Duplication de document
   - R08 — Cache Redis pour le dashboard
   - R09 — Email templates depuis la base de données
   - R10 — Recherche globale multi-entité
   - R11 — Rate limiting par utilisateur
   - R12 — Module Rapports avancés + export Excel
   - R13 — Notifications temps réel (Socket.io)
   - R14 — Journal d'audit complet (enrichissement)
   - R15 — Tests automatisés (Jest + Playwright)
   - R16 — CI/CD GitHub Actions
5. [Déploiement — Prérequis restants](#5-déploiement--prérequis-restants)

---

## 1. Architecture générale

```
bridge-backend/
├── src/
│   ├── app.ts                        # Express app (middlewares + routes)
│   ├── server.ts                     # Écoute HTTP + graceful shutdown
│   │
│   ├── config/
│   │   ├── env.ts                    # Variables d'env validées (Zod)
│   │   ├── database.ts               # Prisma Client singleton
│   │   ├── redis.ts                  # IORedis singleton (BullMQ)
│   │   └── constants.ts             # Constantes métier
│   │
│   ├── core/
│   │   ├── errors/AppError.ts        # Classe d'erreur HTTP centralisée
│   │   └── middleware/
│   │       ├── auth.ts               # Vérification JWT → req.user
│   │       ├── rbac.ts               # authorize('admin', 'commercial', ...)
│   │       ├── audit.ts              # Auto-log mutations → audit_logs
│   │       ├── errorHandler.ts       # Gestionnaire global d'erreurs
│   │       └── requestLogger.ts      # Logs HTTP (morgan + winston)
│   │
│   ├── lib/
│   │   ├── jwt.ts                    # sign/verify access + refresh tokens
│   │   ├── bcrypt.ts                 # hash/compare passwords
│   │   ├── totp.ts                   # TOTP 2FA (otplib)
│   │   ├── mailer.ts                 # Envoi SMTP (nodemailer)
│   │   ├── pdf.ts                    # Génération PDF (puppeteer + HTML)
│   │   └── documentNumber.ts         # Appel fn_next_document_number() PostgreSQL
│   │
│   ├── jobs/                         # Files d'attente BullMQ
│   │   ├── queues.ts                 # Instances queues + types de jobs
│   │   ├── workers.ts                # Démarrage/arrêt des workers
│   │   ├── scheduler.ts              # Crons répétables (upsertJobScheduler)
│   │   └── processors/
│   │       ├── email.processor.ts    # Envoi SMTP avec retry
│   │       ├── notification.processor.ts  # In-app + email conditionnel
│   │       ├── overdue.processor.ts  # Cron : retards + expirations
│   │       ├── recurring.processor.ts     # Cron : factures récurrentes
│   │       └── reminder.processor.ts      # Cron : rappels de paiement
│   │
│   └── modules/
│       ├── auth/                     # Authentification & sécurité
│       ├── users/                    # Gestion des utilisateurs
│       ├── clients/                  # Gestion des clients
│       ├── products/                 # Catalogue produits & catégories
│       ├── proformas/                # Devis & proformas
│       ├── invoices/                 # Factures (standard, acompte, solde, avoir)
│       ├── payments/                 # Paiements
│       ├── recurring/                # Gabarits de facturation récurrente
│       ├── notifications/            # Notifications in-app + préférences
│       ├── dashboard/                # KPIs & tableaux de bord
│       ├── settings/                 # Paramètres de l'entreprise
│       └── audit/                    # Journal d'audit (lecture admin)
│
├── prisma/schema.prisma              # Modèles Prisma (18 tables, 12 enums)
├── assets/company/                   # Header, footer, cachet PDF
├── docker-compose.yml                # PostgreSQL 15 + Redis 7 + API
└── .env.example                      # Variables d'environnement requises
```

---

## 2. État actuel — Fonctionnalités implémentées

### 2.1 Modules API

#### Authentification — `POST /api/auth/*`

| Méthode | Route | Accès | Description |
|---|---|---|---|
| POST | `/login` | Public | Email + mot de passe, retourne access + refresh tokens |
| POST | `/logout` | Public | Révoque le refresh token |
| POST | `/refresh` | Public | Rotation du refresh token |
| POST | `/forgot-password` | Public | Envoi lien de réinitialisation par email |
| POST | `/reset-password` | Public | Réinitialise le mot de passe avec le token |
| POST | `/2fa/enable` | Authentifié | Génère secret TOTP + QR code |
| POST | `/2fa/verify` | Authentifié | Active le 2FA + retourne 8 codes de secours (SHA-256) |
| POST | `/2fa/disable` | Authentifié | Désactive le 2FA |
| POST | `/2fa/backup-codes` | Authentifié | Régénère les codes de secours (nécessite TOTP) |
| GET | `/sessions` | Authentifié | Liste les sessions actives (device, IP, date) |
| DELETE | `/sessions/:id` | Authentifié | Révoque une session spécifique |
| DELETE | `/sessions` | Authentifié | Révoque toutes les autres sessions |

**Sécurité** : anti-brute-force (verrouillage compte), SHA-256 refresh tokens, `login_history`, codes de secours 2FA consommables, délai exponentiel par queue.

#### Utilisateurs — `GET/POST/PUT/DELETE /api/users/*`

| Méthode | Route | Accès | Description |
|---|---|---|---|
| GET | `/me` | Tous | Profil de l'utilisateur connecté |
| PUT | `/me` | Tous | Mise à jour du profil (nom, téléphone, langue, thème...) |
| PUT | `/me/password` | Tous | Changement de mot de passe (révoque les autres sessions) |
| GET | `/` | Admin | Liste paginée avec filtres (rôle, statut, recherche) |
| POST | `/` | Admin | Créer un utilisateur |
| GET | `/:id` | Admin | Détail d'un utilisateur |
| PUT | `/:id` | Admin | Modifier (rôle inclus) |
| DELETE | `/:id` | Admin | Archiver (soft-delete) |

#### Clients — `GET/POST/PUT/DELETE /api/clients/*`

| Méthode | Route | Accès | Description |
|---|---|---|---|
| GET | `/` | Tous | Liste paginée avec recherche |
| POST | `/` | Tous | Créer un client |
| GET | `/:id` | Tous | Détail |
| PUT | `/:id` | Tous | Modifier |
| DELETE | `/:id` | Tous | Archiver (soft-delete) |
| GET | `/:id/summary` | Tous | Résumé financier (total facturé, payé, en attente) |
| GET | `/:id/quick-fill` | Tous | Pré-remplissage formulaire : conditions, top produits, comportement paiement |

#### Catalogue — `GET/POST/PUT/DELETE /api/products/*` & `/api/product-categories/*`

- CRUD complet produits et catégories
- Création/modification restreinte aux rôles `admin` et `commercial`
- Suppression restreinte à `admin`
- `GET /:id/line-defaults?clientId=` — défauts de ligne : prix catalogue, dernier prix client, dernière quantité, indicateur de changement de prix
- `GET /?clientId=` — liste annotée avec `usageCount` et `lastPriceForClient`, triée par fréquence d'utilisation

#### Proformas — `GET/POST/PUT/DELETE /api/proformas/*`

| Méthode | Route | Accès | Description |
|---|---|---|---|
| GET | `/` | Tous | Liste avec filtres (client, statut, dates, recherche) |
| POST | `/` | Tous | Créer (numérotation atomique PostgreSQL) |
| GET | `/:id` | Tous | Détail complet (lignes + historique statut) |
| PUT | `/:id` | Tous | Modifier (draft uniquement) |
| DELETE | `/:id` | Tous | Supprimer (soft-delete) |
| POST | `/:id/send` | Tous | Envoyer au client (email + notification) |
| POST | `/:id/accept` | Tous | Marquer comme acceptée |
| POST | `/:id/reject` | Tous | Marquer comme rejetée (avec motif) |
| POST | `/:id/convert` | Tous | Convertir en facture (standard ou acompte %) |
| POST | `/:id/duplicate` | Tous | Dupliquer en nouveau draft |
| GET | `/:id/pdf` | Tous | Télécharger le PDF |

**Cycles de statut** : `draft → sent → accepted/rejected/expired`

#### Factures — `GET/POST/PUT/DELETE /api/invoices/*`

| Méthode | Route | Accès | Description |
|---|---|---|---|
| GET | `/` | Tous | Liste avec filtres (type, statut, retard...) |
| GET | `/?export=csv` | Tous | Export CSV complet (BOM UTF-8) |
| POST | `/` | Tous | Créer (standard, acompte, solde, avoir) |
| POST | `/compute` | Tous | Calcul à sec (dry-run) : totaux + avertissements (UNPAID_BALANCE, UNUSUAL_AMOUNT, DUPLICATE_RISK) |
| GET | `/:id` | Tous | Détail complet (lignes + paiements + historique) |
| PUT | `/:id` | Tous | Modifier (draft uniquement) |
| POST | `/:id/issue` | Tous | Émettre (draft → issued + email client) |
| POST | `/:id/cancel` | Admin/Commercial | Annuler + avoir automatique |
| POST | `/:id/duplicate` | Tous | Dupliquer en nouveau draft |
| POST | `/:id/payment` | Tous | Enregistrer un paiement |
| GET | `/:id/pdf` | Tous | Télécharger le PDF (rate-limit 10/min) |

**Types de factures** : `standard`, `acompte` (% du total), `solde` (déduit les acomptes), `avoir` (généré automatiquement à l'annulation), `recurring`

**Cycles de statut** : `draft → issued → partially_paid → paid` (+ `overdue`, `cancelled`)

#### Paiements — `/api/payments/*`

| Méthode | Route | Accès | Description |
|---|---|---|---|
| GET | `/` | Tous | Liste avec filtres (facture, méthode, dates) |
| DELETE | `/:id` | Admin | Supprimer (soft-delete + recalcul solde facture) |

**Mise à jour automatique** : à chaque paiement, le solde et le statut de la facture sont recalculés en transaction atomique.

#### Facturation récurrente — `/api/recurring/*`

| Méthode | Route | Accès | Description |
|---|---|---|---|
| GET | `/` | Tous | Liste des gabarits |
| POST | `/` | Admin/Commercial | Créer un gabarit |
| GET | `/:id` | Tous | Détail |
| PUT | `/:id` | Admin/Commercial | Modifier |
| DELETE | `/:id` | Admin | Supprimer |
| POST | `/:id/activate` | Admin/Commercial | Activer |
| POST | `/:id/deactivate` | Admin/Commercial | Désactiver |
| POST | `/:id/generate` | Admin/Commercial | Générer manuellement une facture |

**Intervalles** : mensuel, trimestriel, semestriel, annuel

#### Notifications — `/api/notifications/*`

| Méthode | Route | Accès | Description |
|---|---|---|---|
| GET | `/` | Tous | Liste (avec filtre non-lues, pagination) |
| PUT | `/read-all` | Tous | Marquer tout comme lu |
| GET | `/settings` | Tous | Préférences par type de notification |
| PUT | `/settings` | Tous | Configurer canal (in_app / email / both) + activer/désactiver |
| PUT | `/:id/read` | Tous | Marquer une notification comme lue |

**Types** : 11 types d'événements (proforma envoyée/acceptée/rejetée/expirée, facture émise/payée/partiellement payée/en retard, paiement enregistré, rappel, système)

#### Dashboard — `/api/dashboard/*`

| Méthode | Route | Accès | Description |
|---|---|---|---|
| GET | `/kpis` | Tous | KPIs globaux : CA, retards, encaissements, top clients, CA mensuel sur 12 mois |

**Cache Redis** : TTL 5 minutes. Invalidé automatiquement après chaque paiement, émission ou annulation de facture.

#### Recherche — `/api/search`

| Méthode | Route | Accès | Description |
|---|---|---|---|
| GET | `/?q=<requête>` | Tous | Recherche multi-entité avec langage naturel |

**Capacités du parser** :
- Navigation directe par numéro de document (`FAC-031`, `BTS/DC/2026/01/FAC001`)
- Filtres de montant (`>500K`, `>=1M`, `<200000`)
- Filtres de période (mois français + année)
- Mots-clés de statut (`impayé`, `brouillon`, `envoyé`, `payé`, `annulé`)
- Recherche textuelle sur clients, produits, utilisateurs (admin)

#### Paramètres — `/api/settings`

| Méthode | Route | Accès | Description |
|---|---|---|---|
| GET | `/` | Tous | Lire les paramètres de l'entreprise |
| PUT | `/` | Admin | Modifier (identité légale, coordonnées, devises, délais, sécurité, rappels) |

#### Journal d'audit — `/api/audit-logs`

| Méthode | Route | Accès | Description |
|---|---|---|---|
| GET | `/` | Admin | Historique immuable avec filtres (table, action, utilisateur, dates) |

---

### 2.2 Files d'attente (BullMQ + Redis)

| Queue | Type | Description |
|---|---|---|
| `email` | Event | Envoi SMTP, 3 tentatives avec backoff exponentiel (5s → 10s → 20s) |
| `notification` | Event | Notification in-app + email conditionnel selon `notification_settings` + émission Socket.io temps réel |
| `overdue` | Cron 00:05 UTC | Marque les factures en retard (`overdue`), expire les proformas dépassées |
| `recurring` | Cron 00:10 UTC | Génère les factures récurrentes dont `next_invoice_date <= aujourd'hui` |
| `reminder` | Cron 00:15 UTC | **Relances d'escalade** (J+0 Douce / J+7 Ferme / J+15 Urgente / J+30 Critique) vers l'équipe BTS |

**Relances d'escalade** : 4 niveaux configurables dans `company_settings.reminderEscalation`. Les relances sont envoyées à l'équipe interne (créateur + managers), jamais aux clients. Le niveau atteint est stocké sur la facture (`reminderEscalationLevel`) — robuste aux crons manqués. Remis à 0 automatiquement au paiement.

**Déclenchement événementiel** : les queues email et notification sont alimentées par :
- Auth : envoi du lien de réinitialisation de mot de passe
- Proformas : envoi, acceptation, rejet
- Factures : émission, annulation
- Paiements : enregistrement d'un paiement

---

### 2.3 Sécurité

| Mécanisme | Détail |
|---|---|
| JWT | Access token 15min + refresh token 7j, rotation à chaque usage |
| Stockage tokens | Refresh tokens stockés en SHA-256 (jamais en clair) |
| 2FA | TOTP via otplib, QR code scannable, **8 codes de secours SHA-256 consommables** |
| Sessions | Liste des sessions actives, révocation ciblée ou globale |
| Brute-force | Verrouillage compte après N tentatives (configurable dans settings) |
| Mots de passe | Bcrypt + règles de complexité (majuscule, chiffre, 8 chars min) |
| RBAC | Middleware `authorize()` à 3 niveaux : admin > commercial > employee |
| Audit | Logs immuables (règle PostgreSQL interdisant UPDATE/DELETE sur audit_logs) |
| Rate limiting | Global : 300 req/15min · Auth login : 10/15min · PDF : 10/min par utilisateur |
| Helmet | Headers HTTP sécurisés |
| CORS | Origine restreinte à `APP_URL` |

---

### 2.4 Génération PDF

- Moteur : Puppeteer (Chromium headless)
- 4 layouts distincts : Proforma, Facture standard, Facture Acompte, Facture Solde/Avoir
- Assets embarqués en base64 (header, footer, cachet BTS)
- Couleurs BTS : bleu `#2196F3`, doré `#C8B87A`
- Cachet présent sur les proformas uniquement

---

### 2.5 Règles métier SYSCOHADA respectées

| Règle | Implémentation |
|---|---|
| Numérotation sans trou | `fn_next_document_number()` PostgreSQL avec `SELECT ... FOR UPDATE` |
| Snapshots prix | Lignes copiées du catalogue à la création, indépendantes des modifications ultérieures |
| Avoir automatique | Généré dans la même transaction que l'annulation d'une facture émise |
| Soft-delete | `deleted_at` timestamp, jamais de DELETE physique |
| Audit immuable | Règle PG niveau base empêchant UPDATE/DELETE sur `audit_logs` |
| Cycle acompte/solde | `totalHt` = projet complet, `totalTtc` = montant de l'acompte ; le solde est calculé par différence |

---

## 3. Améliorations recommandées

### Légende

| Priorité | Signification |
|---|---|
| P1 — Critique | Bloquant pour la mise en production |
| P2 — Important | Valeur métier élevée, effort faible |
| P3 — Confort | Améliore l'expérience sans être bloquant |

---

### Tableau de synthèse

| # | Fonctionnalité | Priorité | Statut |
|---|---|---|---|
| R01 | Documentation Swagger/OpenAPI | P1 | A faire |
| R02 | Health check enrichi (DB + Redis) | P1 | A faire |
| R03 | Upload logo / cachet / signature | P1 | A faire |
| R04 | Gestion des sessions actives | P1 | **FAIT** |
| R05 | Rapport de vieillissement des créances | P2 | A faire |
| R06 | Export CSV des listes | P2 | **FAIT** |
| R07 | Duplication de document | P2 | **FAIT** |
| R08 | Cache Redis pour le dashboard | P2 | **FAIT** |
| R09 | Email templates depuis la base de données | P3 | A faire |
| R10 | Recherche globale multi-entité | P3 | **FAIT** — avec parser langage naturel |
| R11 | Rate limiting par utilisateur | P3 | **FAIT** |
| R12 | Module Rapports avancés + export Excel | P2 | A faire |
| R13 | Notifications temps réel (Socket.io) | P2 | **FAIT** |
| R14 | Journal d'audit complet (enrichissement) | P2 | A faire |
| R15 | Tests automatisés (Jest + Playwright) | P1 | A faire |
| R16 | CI/CD GitHub Actions | P1 | A faire |
| — | 2FA codes de secours (backup codes) | P1 | **FAIT** |
| — | Relances d'escalade internes (J+0/7/15/30) | P2 | **FAIT** |
| — | Quick-fill client (pre-remplissage formulaire) | P2 | **FAIT** |
| — | Line-defaults produit par client | P2 | **FAIT** |
| — | Calcul à sec facture (dry-run + warnings) | P2 | **FAIT** |

---

## 4. Détail des recommandations

---

### R01 — Documentation Swagger/OpenAPI `[P1]`

**Pourquoi** : sans documentation, le frontend doit deviner les contrats d'API. C'est le frein n°1 au travail en parallèle entre les équipes.

**Ce qu'il faut faire** :
- Installer `swagger-ui-express` + `swagger-jsdoc`
- Annoter les routes avec des commentaires JSDoc OpenAPI
- Exposer `/api/docs` (UI interactive) et `/api/docs.json` (spec JSON)

**Exemple de route documentée** :
```typescript
/**
 * @openapi
 * /api/invoices:
 *   get:
 *     summary: Liste les factures
 *     tags: [Invoices]
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [draft, issued, partially_paid, paid, overdue, cancelled]
 *     responses:
 *       200:
 *         description: Liste paginée de factures
 */
```

**Fichiers à créer/modifier** :
- `src/config/swagger.ts` — configuration Swagger
- `src/app.ts` — monter `/api/docs`
- Annotations JSDoc dans tous les fichiers `*.routes.ts`

---

### R02 — Health check enrichi `[P1]`

**Pourquoi** : le health check actuel retourne toujours `{ status: "ok" }` même si PostgreSQL ou Redis sont down. Les load balancers et outils de monitoring (Docker, Kubernetes, Uptime Robot) utilisent ce endpoint pour décider si l'instance est prête à recevoir du trafic.

**Comportement attendu** :

```json
// 200 OK — tout opérationnel
{
  "status": "ok",
  "db": "ok",
  "redis": "ok",
  "uptime": 3600,
  "timestamp": "2026-03-05T10:00:00.000Z"
}

// 503 Service Unavailable — DB inaccessible
{
  "status": "degraded",
  "db": "error",
  "redis": "ok",
  "error": "Connection timeout"
}
```

**Fichier à modifier** : `src/app.ts` — route `/health`

---

### R03 — Upload logo / cachet / signature `[P1]`

**Pourquoi** : les PDFs utilisent des fichiers hardcodés dans `assets/company/`. L'admin ne peut pas changer le logo sans accès SSH au serveur. Les champs `logo_path`, `stamp_path`, `signature_path` existent déjà dans `company_settings`.

**Endpoints à créer** :
```
PUT /api/settings/assets/logo       — multipart/form-data, remplace le logo
PUT /api/settings/assets/stamp      — remplace le cachet
PUT /api/settings/assets/signature  — remplace la signature
```

**Comportement** :
1. Valider le type MIME (image/png, image/jpeg, image/webp) et la taille (max 2 Mo)
2. Sauvegarder dans `uploads/company/` avec un nom unique (UUID)
3. Mettre à jour `company_settings.logo_path` (ou `stamp_path`, `signature_path`)
4. `pdf.ts` lit désormais depuis la DB le chemin du fichier courant

**Dépendances** : `multer` (upload multipart), déjà prévu par le volume `uploads` dans `docker-compose.yml`

---

### R04 — Gestion des sessions actives `[P1]`

**Pourquoi** : un utilisateur dont le laptop est volé doit pouvoir révoquer la session à distance. La table `refresh_tokens` stocke déjà `device_name`, `ip_address`, `created_at` — seuls les endpoints manquent.

**Endpoints à créer** :
```
GET    /api/auth/sessions        — liste les sessions actives de l'utilisateur connecté
DELETE /api/auth/sessions/:id    — révoque une session spécifique
DELETE /api/auth/sessions        — révoque toutes les sessions sauf la courante
```

**Réponse GET** :
```json
[
  {
    "id": "uuid",
    "deviceName": "Chrome / Windows 10",
    "ipAddress": "41.202.xxx.xxx",
    "createdAt": "2026-03-01T08:00:00Z",
    "current": true
  }
]
```

**Fichiers à créer/modifier** :
- `src/modules/auth/auth.service.ts` — méthodes `listSessions()`, `revokeSession()`, `revokeAllSessions()`
- `src/modules/auth/auth.routes.ts` — 3 nouvelles routes
- `src/modules/auth/auth.controller.ts` — 3 nouveaux handlers

---

### R05 — Rapport de vieillissement des créances `[P2]`

**Pourquoi** : standard comptable SYSCOHADA. Classe les impayés par ancienneté pour évaluer le risque de non-recouvrement. Indispensable pour les clôtures comptables et les décisions de relance.

**Endpoint à créer** :
```
GET /api/dashboard/aging
```

**Réponse** :
```json
{
  "current": { "amount": 500000, "count": 3 },
  "1_30":   { "amount": 320000, "count": 5 },
  "31_60":  { "amount": 150000, "count": 2 },
  "61_90":  { "amount": 80000,  "count": 1 },
  "over90": { "amount": 40000,  "count": 1 },
  "total":  { "amount": 1090000, "count": 12 }
}
```

**Logique** : grouper les factures `issued`/`partially_paid`/`overdue` par `DATEDIFF(today, dueDate)`.

**Fichiers à modifier** :
- `src/modules/dashboard/dashboard.service.ts` — méthode `getAging()`
- `src/modules/dashboard/dashboard.routes.ts` — route `GET /aging`

---

### R06 — Export CSV des listes `[P2]`

**Pourquoi** : les comptables et dirigeants travaillent sous Excel/Google Sheets. Sans export, ils recopient manuellement les données. Cas d'usage quotidien.

**Endpoints à étendre** (paramètre `?export=csv`) :
```
GET /api/invoices?export=csv      — toutes les factures filtrées
GET /api/payments?export=csv      — tous les paiements
GET /api/clients?export=csv       — tous les clients
GET /api/proformas?export=csv     — toutes les proformas
```

**Comportement** :
- Même logique de filtre que les listes paginnées, mais sans pagination (export complet)
- Headers de réponse : `Content-Type: text/csv; charset=utf-8` + `Content-Disposition: attachment; filename=factures_2026-03.csv`
- BOM UTF-8 pour compatibilité Excel

**Dépendances** : `csv-stringify` (légère, aucun overhead)

---

### R07 — Duplication de document `[P2]`

**Pourquoi** : cas d'usage très fréquent pour les clients récurrents avec des prestations similaires. Évite la resaisie complète d'un document.

**Endpoints à créer** :
```
POST /api/proformas/:id/duplicate   — crée une copie en draft avec nouveau numéro
POST /api/invoices/:id/duplicate    — idem pour les factures
```

**Comportement** :
- Copie toutes les lignes, le client, les conditions de paiement, les remises
- Génère un nouveau numéro via `fn_next_document_number()`
- Statut = `draft`, dates = aujourd'hui
- Retourne le nouveau document (redirect vers `/api/proformas/:newId`)

---

### R08 — Cache Redis pour le dashboard `[P2]`

**Pourquoi** : le dashboard exécute 10 requêtes d'agrégation simultanées sur l'ensemble de l'historique. Avec des milliers de factures, la latence augmente. Le dashboard est consulté souvent mais les données changent peu (au mieux toutes les quelques minutes).

**Implémentation** :
```typescript
// Dans dashboard.service.ts
async getKpis() {
  const CACHE_KEY = 'dashboard:kpis';
  const TTL = 300; // 5 minutes

  const cached = await redis.get(CACHE_KEY);
  if (cached) return JSON.parse(cached);

  const result = await this.computeKpis(); // logique actuelle
  await redis.setex(CACHE_KEY, TTL, JSON.stringify(result));
  return result;
}
```

**Invalidation** : le cache doit être vidé après chaque paiement enregistré, facture émise ou annulée (via les queues de notification).

**Fichiers à modifier** :
- `src/modules/dashboard/dashboard.service.ts`
- `src/jobs/processors/notification.processor.ts` — invalider le cache sur certains événements

---

### R09 — Email templates depuis la base de données `[P3]`

**Pourquoi** : les emails sont actuellement en HTML hardcodé dans le code source. L'admin ne peut pas personnaliser l'objet ou le corps des emails sans déployer une nouvelle version. La table `email_templates` existe déjà dans le schéma.

**Endpoints à créer** :
```
GET    /api/email-templates       — liste tous les templates
GET    /api/email-templates/:code — détail d'un template
PUT    /api/email-templates/:code — modifier sujet + corps HTML (admin)
POST   /api/email-templates/:code/preview — prévisualiser avec des données de test
```

**Variables interpolables** : `{{clientName}}`, `{{invoiceNumber}}`, `{{amount}}`, `{{dueDate}}`, `{{resetUrl}}`, etc.

**Logique d'interpolation dans `mailer.ts`** :
```typescript
async function renderTemplate(code: string, vars: Record<string, string>) {
  const tpl = await prisma.emailTemplate.findUnique({ where: { code } });
  if (!tpl || !tpl.isActive) return null;
  return {
    subject: interpolate(tpl.subject, vars),
    html: interpolate(tpl.bodyHtml, vars),
  };
}
```

---

### R10 — Recherche globale multi-entité `[P3]`

**Pourquoi** : l'utilisateur cherche "CAMTEL" et veut voir simultanément le client, ses factures et ses proformas. Actuellement il doit chercher dans 3 interfaces séparées.

**Endpoint à créer** :
```
GET /api/search?q=camtel&types=clients,invoices,proformas
```

**Réponse** :
```json
{
  "clients":   [{ "id": "...", "name": "CAMTEL", "type": "client" }],
  "invoices":  [{ "id": "...", "number": "BTS/DC/2026/01/FAC001", "type": "invoice" }],
  "proformas": [{ "id": "...", "number": "BTS/DC/2026/01/PFM003", "type": "proforma" }]
}
```

**Implémentation** : requêtes parallèles `ILIKE` sur les champs pertinents de chaque entité, limitées à 5 résultats par type.

---

### R11 — Rate limiting par utilisateur `[P3]`

**Pourquoi** : la limitation actuelle (300 req/15min) est globale par IP. Un utilisateur authentifié abusif pénalise tous les autres partageant la même IP (bureau, NAT). Les routes de génération PDF et d'export sont particulièrement coûteuses.

**Stratégie recommandée** :
```typescript
// Rate limit par userId JWT sur les routes coûteuses
app.use(`${prefix}/invoices/:id/pdf`, rateLimitByUser({ max: 10, windowMs: 60_000 }));
app.use(`${prefix}/proformas/:id/pdf`, rateLimitByUser({ max: 10, windowMs: 60_000 }));
app.use(`${prefix}/invoices?export=csv`, rateLimitByUser({ max: 5, windowMs: 60_000 }));
```

**Implémentation** : middleware custom utilisant Redis comme store (clé `ratelimit:{userId}:{route}`).

---

### R12 — Module Rapports avancés + export Excel `[P2]`

**Pourquoi** : un module de rapports dédié va au-delà du simple export CSV. Il produit des synthèses financières structurées, exportables en Excel natif (`.xlsx`) avec mise en forme, onglets multiples et formules — le format attendu par les experts-comptables et les dirigeants.

**Endpoints à créer** :
```
GET /api/reports/revenue?period=monthly&year=2026          — CA mensuel par période
GET /api/reports/revenue-by-client?dateFrom=…&dateTo=…     — CA par client classé
GET /api/reports/revenue-by-category?year=2026             — CA par catégorie de produit
GET /api/reports/unpaid?asOf=2026-03-01                    — Situation des impayés à une date
GET /api/reports/aging                                     — Vieillissement des créances
GET /api/reports/payments?dateFrom=…&dateTo=…              — Journal des encaissements
GET /api/reports/tax-summary?year=2026&quarter=1           — Récap TVA par trimestre (déclaration)
```

**Format de réponse** :
- `?format=json` (défaut) — données JSON pour affichage frontend
- `?format=xlsx` — fichier Excel téléchargeable (`Content-Disposition: attachment`)
- `?format=csv` — fichier CSV avec BOM UTF-8

**Structure du fichier Excel (exemple rapport CA mensuel)** :
```
Onglet 1 : Résumé (CA HT, TVA, CA TTC, nb factures, taux recouvrement)
Onglet 2 : Détail par facture (numéro, client, date, HT, TVA, TTC, statut)
Onglet 3 : Graphique CA (données pour graphique en barres)
```

**Dépendances** :
- `exceljs` — génération `.xlsx` native avec styles, formules, onglets multiples

**Fichiers à créer** :
- `src/modules/reports/reports.service.ts` — logique de calcul par rapport
- `src/modules/reports/reports.controller.ts` — dispatching format JSON/XLSX/CSV
- `src/modules/reports/reports.routes.ts` — routes `GET /api/reports/*`
- `src/lib/excel.ts` — helper de génération Excel réutilisable

---

### R13 — Notifications temps réel (Socket.io) `[P2]`

**Pourquoi** : le système de notifications actuel est en mode "polling" — le frontend doit appeler `GET /api/notifications` toutes les X secondes pour savoir s'il y a du nouveau. Avec Socket.io, les notifications sont poussées instantanément au navigateur dès qu'elles sont créées, sans requête répétée. Indispensable pour une expérience utilisateur professionnelle.

**Événements à émettre en temps réel** :

| Événement Socket | Déclencheur |
|---|---|
| `notification:new` | Toute nouvelle notification créée pour l'utilisateur |
| `invoice:status_changed` | Émission, paiement, annulation d'une facture |
| `proforma:status_changed` | Envoi, acceptation, rejet d'une proforma |
| `payment:received` | Enregistrement d'un paiement |

**Architecture** :
```
Client (navigateur)
    ↕ WebSocket (Socket.io)
Serveur Express
    ↕ Redis Pub/Sub (adapter Socket.io)
Workers BullMQ → publient dans Redis après traitement
```

L'adapter Redis est nécessaire si plusieurs instances du serveur tournent (horizontal scaling) pour que les messages soient diffusés sur toutes les instances.

**Implémentation** :
```typescript
// src/lib/socket.ts
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';

export function initSocket(httpServer: HttpServer) {
  const io = new Server(httpServer, { cors: { origin: env.APP_URL } });
  io.adapter(createAdapter(pubClient, subClient));

  io.use(socketAuthMiddleware); // Vérifier le JWT dans handshake.auth.token

  io.on('connection', (socket) => {
    const userId = socket.data.userId;
    socket.join(`user:${userId}`); // Room privée par utilisateur
  });

  return io;
}

// Depuis n'importe quel service ou processeur :
io.to(`user:${userId}`).emit('notification:new', notificationData);
```

**Dépendances** :
- `socket.io`
- `@socket.io/redis-adapter`

**Fichiers à créer/modifier** :
- `src/lib/socket.ts` — initialisation Socket.io + middleware auth
- `src/server.ts` — passer `httpServer` à `initSocket()`
- `src/jobs/processors/notification.processor.ts` — émettre l'événement après création
- `src/core/middleware/socketAuth.ts` — vérification JWT dans le handshake

---

### R14 — Journal d'audit complet (enrichissement) `[P2]`

**État actuel** : le `GET /api/audit-logs` existe et filtre les logs. L'endpoint est fonctionnel mais peut être enrichi pour couvrir des cas d'usage comptables et de conformité SYSCOHADA avancés.

**Ce qui manque** :

**1. Diff visuel avant/après**
Actuellement `old_data` et `new_data` sont stockés mais jamais calculés automatiquement. Le middleware `audit.ts` ne capture que `req.body` comme `newData` — il ne capture pas l'état avant modification.

```typescript
// Dans auditMiddleware — avant d'appeler next(), lire l'état actuel
const before = await prisma[tableName].findUnique({ where: { id: req.params.id } });
res.on('finish', () => {
  prisma.auditLog.create({ data: { oldData: before, newData: req.body, ... } });
});
```

**2. Export du journal d'audit**
```
GET /api/audit-logs?export=csv&dateFrom=2026-01-01&dateTo=2026-03-31
```
Requis pour les audits comptables annuels — l'expert-comptable demande l'historique complet d'une période.

**3. Statistiques d'activité**
```
GET /api/audit-logs/stats
→ { topUsers: [...], topTables: [...], actionsPerDay: [...] }
```

**4. Alertes sur actions sensibles**
Certaines actions devraient déclencher une notification admin en temps réel :
- Suppression d'un utilisateur (`SOFT_DELETE` sur `users`)
- Annulation d'une facture payée (`STATUS_CHANGE` sur `invoices`)
- Modification des paramètres de sécurité (`UPDATE` sur `company_settings`)

**Fichiers à modifier** :
- `src/core/middleware/audit.ts` — capturer `oldData` avant modification
- `src/modules/audit/audit.routes.ts` — ajouter `?export=csv` et `GET /stats`

---

### R15 — Tests automatisés (Jest + Playwright) `[P1]`

**Pourquoi** : sans tests, chaque modification du code peut casser une fonctionnalité existante sans le savoir. Pour un système de facturation conforme SYSCOHADA, les régressions sur la numérotation, les calculs financiers ou les statuts sont critiques.

**Stratégie de test recommandée** :

#### Tests unitaires — Jest

Tester la logique métier isolée (calculs, transformations) :

```
src/
└── __tests__/
    ├── unit/
    │   ├── lib/pdf.test.ts              — buildDocumentHtml()
    │   ├── lib/documentNumber.test.ts   — format BTS/{BUREAU}/{AAAA}/{MM}/...
    │   ├── modules/invoices/
    │   │   ├── computeLine.test.ts      — calculs HT, remise, TVA, TTC
    │   │   └── computeTotals.test.ts    — totaux globaux, remise globale
    │   └── modules/proformas/
    │       └── convertToInvoice.test.ts — logique acompte/solde
    └── integration/
        ├── auth.test.ts                 — login, 2FA, refresh, reset
        ├── invoices.test.ts             — cycle complet draft→issued→paid
        ├── proformas.test.ts            — cycle draft→sent→accepted→converti
        └── payments.test.ts            — enregistrement + recalcul solde
```

**Cas critiques à couvrir impérativement** :
- `computeLine()` : remise %, remise fixe, sans remise
- `computeTotals()` : remise globale sur somme des nets HT
- Cycle acompte/solde : `totalHt` = projet complet, `totalTtc` = montant acompte
- Numérotation : format correct, pas de trou en cas d'accès concurrent

#### Tests d'intégration — Jest + base de données de test

```typescript
// jest.config.ts
export default {
  testEnvironment: 'node',
  globalSetup: './src/__tests__/setup.ts',    // Créer la DB de test
  globalTeardown: './src/__tests__/teardown.ts', // Nettoyer
  setupFilesAfterFramework: ['./src/__tests__/prisma-mock.ts'],
};
```

#### Tests End-to-End — Playwright

Tester les flux critiques depuis le frontend :

```
e2e/
├── auth.spec.ts           — connexion, 2FA, déconnexion
├── invoice-cycle.spec.ts  — créer → émettre → payer une facture
├── proforma-convert.spec.ts — créer proforma → convertir en acompte
└── pdf-download.spec.ts   — générer et vérifier le téléchargement PDF
```

**Dépendances** :
- `jest`, `@types/jest`, `ts-jest` — tests unitaires et intégration
- `supertest`, `@types/supertest` — appels HTTP dans les tests d'intégration
- `@playwright/test` — tests E2E

**Scripts à ajouter dans `package.json`** :
```json
{
  "scripts": {
    "test": "jest",
    "test:unit": "jest --testPathPattern=unit",
    "test:integration": "jest --testPathPattern=integration",
    "test:e2e": "playwright test",
    "test:coverage": "jest --coverage"
  }
}
```

---

### R16 — CI/CD GitHub Actions `[P1]`

**Pourquoi** : sans pipeline CI/CD, les déploiements sont manuels et risqués. Chaque push en production doit passer par une vérification automatique (tests, lint, build) avant d'être déployé. C'est le filet de sécurité qui empêche les régressions d'atteindre les utilisateurs.

**Pipeline recommandé** :

```
Push/PR sur main
    ↓
[CI] Lint + Build TypeScript
    ↓
[CI] Tests unitaires (Jest)
    ↓
[CI] Tests d'intégration (Jest + PostgreSQL de test)
    ↓ (sur merge dans main seulement)
[CD] Build image Docker
    ↓
[CD] Push Docker Hub / GitHub Container Registry
    ↓
[CD] Déploiement sur serveur (SSH + docker-compose pull + up)
```

**Fichier `.github/workflows/ci.yml`** :
```yaml
name: CI/CD

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  ci:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15-alpine
        env:
          POSTGRES_DB: invoicehub_test
          POSTGRES_PASSWORD: testpassword
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
      redis:
        image: redis:7-alpine
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s

    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v3
        with: { version: 9 }

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm

      - run: pnpm install --frozen-lockfile

      - name: Lint
        run: pnpm lint

      - name: Build TypeScript
        run: pnpm build

      - name: Tests unitaires
        run: pnpm test:unit

      - name: Tests d'intégration
        run: pnpm test:integration
        env:
          DATABASE_URL: postgresql://postgres:testpassword@localhost:5432/invoicehub_test
          REDIS_URL: redis://localhost:6379
          JWT_ACCESS_SECRET: test_access_secret_min_32_characters
          JWT_REFRESH_SECRET: test_refresh_secret_min_32_characters

  cd:
    needs: ci
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Build & Push image Docker
        uses: docker/build-push-action@v5
        with:
          push: true
          tags: ghcr.io/bts/invoicehub-api:latest

      - name: Déploiement SSH
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.SERVER_HOST }}
          username: ${{ secrets.SERVER_USER }}
          key: ${{ secrets.SSH_PRIVATE_KEY }}
          script: |
            cd /opt/invoicehub
            docker-compose pull api
            docker-compose up -d api
            docker-compose exec -T api pnpm prisma migrate deploy
```

**Secrets GitHub à configurer** :
- `SERVER_HOST` — IP ou domaine du serveur de production
- `SERVER_USER` — utilisateur SSH
- `SSH_PRIVATE_KEY` — clé privée SSH
- `GHCR_TOKEN` — token GitHub Container Registry

**Fichiers à créer** :
- `.github/workflows/ci.yml` — pipeline principal
- `.github/workflows/pr-checks.yml` — vérifications légères sur les PRs (lint, type-check uniquement)
- `Dockerfile` (dans `docker/`) — à vérifier/compléter pour le build de production

---

## 5. Déploiement — Prérequis restants

### Installation des dépendances
```bash
pnpm install
```

### Variables d'environnement
Copier `.env.example` → `.env` et remplir :

```env
DATABASE_URL=postgresql://postgres:PASSWORD@db:5432/invoicehub
JWT_ACCESS_SECRET=<min 32 caractères aléatoires>
JWT_REFRESH_SECRET=<min 32 caractères aléatoires>
REDIS_URL=redis://redis:6379
SMTP_HOST=smtp.example.com
SMTP_USER=noreply@bts.cm
SMTP_PASS=<mot de passe SMTP>
APP_URL=https://invoicehub.bts.cm
```

### Initialisation de la base de données
```bash
# Option A — Prisma (recommandé si schema.prisma est à jour)
pnpm prisma generate
pnpm prisma db push

# Option B — SQL direct
psql -U postgres -d invoicehub -f invoicehub_schema_v2.sql
```

### Démarrage avec Docker
```bash
# Production
docker-compose up -d

# Développement (hot reload)
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up
```

### Vérification
```bash
curl http://localhost:3000/health
# → { "status": "ok", "timestamp": "...", "env": "production" }
```

---

*Document généré le 2026-03-05 — InvoiceHub v2.0 BTS*
