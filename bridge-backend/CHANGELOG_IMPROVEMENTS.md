# Journal des améliorations — InvoiceHub v2.0

> **Date :** Avril 2026  
> **Portée :** Backend Node.js / Express / TypeScript / Prisma  
> **Nombre de modifications :** 19 améliorations réparties en 5 catégories

---

## Table des matières

1. [Corrections de bugs](#1-corrections-de-bugs)
2. [Robustesse et validations](#2-robustesse-et-validations)
3. [Nouvelles fonctionnalités métier](#3-nouvelles-fonctionnalités-métier)
4. [Rapports et exports](#4-rapports-et-exports)
5. [Infrastructure des jobs (BullMQ)](#5-infrastructure-des-jobs-bullmq)
6. [Audit et traçabilité](#6-audit-et-traçabilité)

---

## 1. Corrections de bugs

### 1.1 Fix dates de récurrence ambiguës (fin de mois)

**Fichier :** `src/modules/recurring/recurring.service.ts`

#### Problème

JavaScript a un comportement problématique avec `Date.setMonth()` lorsque le jour du mois source n'existe pas dans le mois cible :

```
Jan 31 + 1 mois  → Mars 2   (au lieu de Fév 28/29)
Mars 31 + 1 mois → Mai 1    (au lieu de Avr 30)
Oct 31 + 1 mois  → Déc 1    (au lieu de Nov 30)
```

Pour un gabarit de facturation récurrent configuré au 31 de chaque mois, toutes les factures de mois courts auraient été générées avec 1 à 3 jours d'avance, créant des irrégularités dans le calendrier de facturation.

#### Solution

Remplacement de `d.setMonth()` par un calcul en trois étapes :

1. Extraire l'année et le mois cibles manuellement
2. Normaliser le dépassement d'année si le mois dépasse 11 (`Math.floor(month / 12)`)
3. Calculer le dernier jour valide du mois cible avec `new Date(year, month + 1, 0).getDate()`
4. Appliquer `Math.min(jourOriginal, dernierJourDuMois)` avant `setFullYear()`

```
Avant fix : Jan 31 + 1 mois = Mars 2
Après fix : Jan 31 + 1 mois = Fév 28 (ou 29 en année bissextile)
```

---

### 1.2 Fix `getReportAssets()` hors de la classe

**Fichier :** `src/modules/reports/reports.service.ts`

#### Problème

Une accolade fermante `}` mal placée faisait que la méthode `getReportAssets()` était définie **en dehors** du corps de la classe `ReportsService`. En JavaScript/TypeScript, cela produit une fonction libre (non rattachée à l'instance), ce qui signifie que `reportsService.getReportAssets()` aurait levé une erreur `TypeError: reportsService.getReportAssets is not a function` à l'exécution de n'importe quel rapport PDF.

#### Solution

Déplacement de la méthode à l'intérieur de la classe, avec suppression de l'accolade parasite. La méthode est maintenant correctement accessible via l'instance `reportsService`.

---

## 2. Robustesse et validations

### 2.1 Validation paiement nul ou négatif

**Fichier :** `src/modules/payments/payments.service.ts`

#### Problème

Le schéma Zod validait déjà `amount > 0` à la couche HTTP. Cependant, le service lui-même n'avait aucune garde défensive. Deux scénarios pouvaient causer des incohérences :

- Un montant `<= 0` arrivant d'un appel interne (hors validation Zod)
- Une facture avec `balanceDue = 0` mais toujours en statut `issued` (état anormal mais possible après correction manuelle en base) — dans ce cas, `input.amount > balanceDue` levait un message d'erreur ambigu au lieu d'expliquer que la facture est soldée

#### Solution

Deux gardes explicites ajoutées dans `payments.service.ts` :

```typescript
// Garde 1 : montant nul ou négatif
if (input.amount <= 0) {
  throw AppError.badRequest('Le montant du paiement doit être supérieur à zéro');
}

// Garde 2 : facture déjà soldée
const balanceDue = Number(invoice.balanceDue);
if (balanceDue <= 0) {
  throw AppError.badRequest('Cette facture est déjà entièrement réglée');
}
```

Le message d'erreur de dépassement de solde a également été amélioré pour afficher les montants formatés en XAF.

---

### 2.2 Validation facture parente (acompte / solde)

**Fichier :** `src/modules/invoices/invoices.service.ts`

#### Problème

Lors de la création d'une facture de type `acompte` ou `solde` avec un `parentInvoiceId`, le service calculait directement les montants (déductions d'acomptes, cumuls) sans vérifier au préalable que la facture parente :
- Existe réellement
- N'est pas en brouillon
- N'est pas annulée

Une facture parente en brouillon ou annulée rendait les calculs de déduction complètement faux (déduire des acomptes d'une facture annulée n'a aucun sens métier).

#### Solution

Bloc de validation ajouté en début de `create()`, avant tout calcul :

```typescript
if (input.parentInvoiceId) {
  const parent = await prisma.invoice.findFirst({
    where: { id: input.parentInvoiceId, deletedAt: null },
    select: { id: true, number: true, status: true },
  });

  if (!parent) throw AppError.notFound('Facture parente introuvable');
  if (parent.status === 'draft') throw AppError.badRequest('...');
  if (parent.status === 'cancelled') throw AppError.badRequest('...');
}
```

---

### 2.3 Détection de doublons client à la création

**Fichier :** `src/modules/clients/clients.service.ts`

#### Problème

La méthode `create()` n'effectuait aucune vérification d'unicité. Il était possible de créer plusieurs fois le même client (même nom, même email, même NIU), polluer la base de données et fausser les rapports financiers (CA par client ventilé sur plusieurs entrées distinctes).

#### Solution

Avant la création, une requête vérifie l'existence d'un client actif (non supprimé) sur 3 critères par ordre de priorité décroissante :

| Critère | Priorité | Raison |
|---------|----------|--------|
| `taxNumber` (NIU fiscal) | Haute | Identifiant légal unique au Cameroun |
| `email` | Haute | Contact principal unique |
| `name` (insensible à la casse) | Moyenne | Doublon évident |

Le message d'erreur retourné précise lequel des trois critères a déclenché le conflit et fournit l'`id` du client existant pour faciliter la correction.

---

### 2.4 Fallback managers vides dans les escalades de rappel

**Fichier :** `src/jobs/processors/reminder.processor.ts`

#### Problème

Le cron quotidien de rappel charge les managers (utilisateurs avec le rôle `admin`) et les notifie lors des escalades de niveau "Urgente" (J+15) et "Critique" (J+30). Si aucun admin actif n'existe en base (ex : admin supprimé accidentellement, ou première installation), la liste `managers` est vide et les escalades critiques partent silencieusement dans le vide — aucun responsable n'est prévenu, sans aucun log d'avertissement.

#### Solution

Après le chargement des managers, une vérification croisée détecte si :
1. La liste de managers est vide **ET**
2. Au moins un niveau de configuration exige `notifyManagers: true`

Dans ce cas, un `logger.warn()` explicite est émis avec un message d'action corrective :

```
[Reminder] Aucun administrateur actif trouvé — les escalades de niveau 
Urgente/Critique ne seront notifiées qu'au créateur/assigné. 
Vérifiez qu'au moins un utilisateur avec le rôle "admin" est actif.
```

---

## 3. Nouvelles fonctionnalités métier

### 3.1 Score de risque client

**Fichiers :** `clients.service.ts`, `clients.controller.ts`, `clients.routes.ts`  
**Endpoint :** `GET /api/clients/:id/risk-score`

#### Description

Calcule automatiquement un score de risque composite (0–100) pour chaque client, basé sur son historique de paiement réel dans la base de données.

#### Algorithme de scoring

| Composante | Critère | Points |
|------------|---------|--------|
| **Retard moyen** | ≤ 0 jours (ponctuel) | 0 pts |
| | 1–7 jours | 15 pts |
| | 8–15 jours | 30 pts |
| | 16–30 jours | 45 pts |
| | > 30 jours | 60 pts |
| **Taux de ponctualité** | ≥ 80% à l'heure | 0 pts |
| | 60–80% | 10 pts |
| | 40–60% | 20 pts |
| | < 40% | 30 pts |
| **Ratio impayés** | 0% du CA impayé | 0 pts |
| | 1–20% | 5 pts |
| | 20–50% | 10 pts |
| | > 50% | 15 pts |

#### Niveaux de risque

| Score | Niveau | Signification |
|-------|--------|---------------|
| 0–20 | `faible` | Client fiable, paiements réguliers |
| 21–50 | `modéré` | Quelques retards, à surveiller |
| 51–75 | `élevé` | Retards fréquents, relances nécessaires |
| 76–100 | `critique` | Impayés importants, risque maximal |
| — | `unknown` | Nouveau client, pas encore d'historique |

#### Exemple de réponse

```json
{
  "score": 45,
  "level": "modéré",
  "details": {
    "invoiceCount": 12,
    "avgDaysLate": 8,
    "onTimeRate": 67,
    "unpaidBalance": 250000,
    "unpaidRatio": 15,
    "components": {
      "delayScore": 30,
      "punctualityScore": 10,
      "unpaidScore": 5
    }
  }
}
```

---

### 3.2 Prédiction de date de paiement probable

**Fichiers :** `invoices.service.ts`, `invoices.controller.ts`, `invoices.routes.ts`  
**Endpoint :** `GET /api/invoices/:id/payment-prediction`

#### Description

Pour une facture non encore payée, prédit la date à laquelle le client va probablement régler, en se basant sur son comportement historique.

#### Méthode de calcul

```
Date prédite = Date d'échéance + Retard moyen historique du client
```

Exemple : si le client règle en moyenne 10 jours après l'échéance, et que la facture est due le 30 avril, la date prédite sera le 10 mai.

#### Niveaux de confiance

| Échantillon | Confiance | Signification |
|-------------|-----------|---------------|
| < 5 paiements | `low` | Peu de données, prédiction peu fiable |
| 5–20 paiements | `medium` | Historique suffisant |
| > 20 paiements | `high` | Très fiable |
| 0 paiement | `null` | Nouveau client, retourne la date d'échéance brute |

---

### 3.3 Cashflow prévisionnel 30 jours

**Fichiers :** `dashboard.service.ts`, `dashboard.routes.ts`  
**Endpoint :** `GET /api/dashboard/cashflow`

#### Description

Génère une projection quotidienne des encaissements attendus sur les 30 prochains jours, en appliquant le retard moyen historique de chaque client à ses factures impayées.

#### Fonctionnement

1. Récupère toutes les factures impayées (`issued`, `partially_paid`, `overdue`)
2. Calcule le retard moyen de chaque client en une seule requête SQL
3. Pour chaque facture : `date prévue = dueDate + avgDaysLate du client`
4. Regroupe les montants par jour sur 30 jours
5. Calcule le cumul progressif

#### Exemple de réponse (extrait)

```json
[
  { "date": "2026-04-12", "expected": 0,       "invoiceCount": 0, "cumulative": 0 },
  { "date": "2026-04-15", "expected": 450000,  "invoiceCount": 2, "cumulative": 450000 },
  { "date": "2026-04-20", "expected": 1200000, "invoiceCount": 5, "cumulative": 1650000 }
]
```

**Utilité :** alimenter un graphique de trésorerie prévisionnelle sur le dashboard frontend.

---

### 3.4 Alerte J-3 avant expiration de proforma

**Fichier :** `src/jobs/processors/overdue.processor.ts`

#### Description

Le cron quotidien de détection des documents en retard envoie maintenant une notification préventive au créateur de la proforma **3 jours avant** son expiration, quand il est encore temps de relancer le client.

#### Déduplication

Pour éviter de spammer l'utilisateur, le système vérifie avant chaque envoi si une notification `proforma_expiry_warning` a déjà été émise pour cette proforma dans les **4 derniers jours**. Si oui, l'alerte est ignorée.

Cette vérification est faite en **une seule requête** pour toutes les proformas concernées (pas de N+1).

#### Contenu de la notification

```
Titre   : "Proforma expire dans 2 jours : PFM-2026-04-015"
Message : "La proforma PFM-2026-04-015 pour Orange Cameroun expire 
           dans 2 jours (14/04/2026). Relancez le client si nécessaire."
```

---

### 3.5 Compteur de factures générées par template récurrent

**Fichier :** `src/modules/recurring/recurring.service.ts`

#### Description

Les endpoints `GET /api/recurring` (liste) et `GET /api/recurring/:id` (détail) retournent maintenant un champ `_count.invoices` indiquant combien de factures ont été générées par chaque gabarit depuis sa création.

#### Implémentation

Utilisation du mécanisme natif Prisma `_count` avec `select` sur la relation `invoices` — aucune requête supplémentaire, aucune migration de schéma requise.

```json
{
  "id": "...",
  "subject": "Maintenance mensuelle",
  "interval": "monthly",
  "isActive": true,
  "_count": { "invoices": 14 }
}
```

---

### 3.6 Désactivation globale des notifications en un clic

**Fichiers :** `notifications.service.ts`, `notifications.controller.ts`, `notifications.routes.ts`

#### Endpoints ajoutés

| Méthode | Route | Action |
|---------|-------|--------|
| `PUT` | `/api/notifications/settings/disable-all` | Désactive toutes les notifications |
| `PUT` | `/api/notifications/settings/enable-all` | Réactive toutes les notifications |

#### Description

Permet à un utilisateur de couper ou réactiver **toutes** ses notifications en un seul appel, sans avoir à modifier chaque type individuellement via `PUT /settings`.

#### Comportement

- Parcourt tous les types `NotificationStatus` de l'enum Prisma
- Upsert chaque type avec `enabled: false` (ou `true` pour `enable-all`)
- **Conserve le canal existant** (`email`, `in_app`, `both`) — seul le flag `enabled` est modifié
- Retourne l'état complet des préférences après modification

Aucune migration de schéma requise — repose sur la table `notification_settings` existante.

---

## 4. Rapports et exports

### 4.1 Rapport paiements par méthode de règlement

**Fichiers :** `reports.service.ts`, `reports.routes.ts`  
**Endpoint :** `GET /api/reports/by-method?format=json|csv|pdf`

#### Description

Nouveau rapport qui ventile les encaissements par mode de paiement sur une période donnée.

#### Données retournées

| Champ | Description |
|-------|-------------|
| `method` | Code méthode (`virement`, `especes`, `cheque`, `mobile_money`, `autre`) |
| `total` | Montant total encaissé par cette méthode |
| `count` | Nombre de paiements |
| `percentage` | Part relative du total global (%) |

#### Export PDF

Inclut des KPIs récapitulatifs + tableau avec barre de progression visuelle pour chaque méthode.

---

### 4.2 Aging report exportable (vieillissement des impayés)

**Fichiers :** `reports.service.ts`, `reports.routes.ts`  
**Endpoint :** `GET /api/reports/aging?format=json|csv|pdf`

#### Description

Le dashboard disposait déjà d'un aging (GET `/dashboard/aging`) mais sans export et sans détail par facture. Ce nouveau rapport de recouvrement offre une vue complète.

#### Tranches de vieillissement

| Tranche | Critère | Couleur PDF |
|---------|---------|-------------|
| Courant | Échéance non atteinte | Vert |
| 1–30j | 1 à 30 jours de retard | Orange |
| 31–60j | 31 à 60 jours | Rouge orangé |
| 61–90j | 61 à 90 jours | Rouge |
| > 90j | Plus de 90 jours | Rouge foncé (critique) |

#### Contenu

- **JSON :** `{ rows, buckets, total }` — rows = détail par facture, buckets = totaux par tranche
- **CSV :** 11 colonnes dont `Réf. client`, `Retard (j)`, `Tranche`
- **PDF :** KPIs par tranche + bannière d'alerte si impayés + tableau complet avec pilules `J+N`

---

### 4.3 Référence client dans tous les exports CSV

**Fichiers :** `invoices.controller.ts`, `proformas.controller.ts`, `reports.routes.ts`, `reports.service.ts`

#### Problème

Le champ `clientReference` (référence de bon de commande du client, ex : `BC-2026-042`) était stocké en base mais absent de tous les exports CSV et des rapports. Les comptables ne pouvaient pas faire le rapprochement avec les documents du client.

#### Solution

Ajout de la colonne `Réf. client` (en 2e position après le numéro de document) dans :

| Export | Fichier modifié |
|--------|-----------------|
| Factures `export=csv` | `invoices.controller.ts` |
| Proformas `export=csv` | `proformas.controller.ts` |
| Rapport impayés CSV | `reports.routes.ts` |
| Aging report CSV | `reports.routes.ts` |

Les méthodes `getUnpaid()` et `getAgingReport()` du service de rapports ont été mises à jour pour sélectionner explicitement `clientReference`.

---

## 5. Infrastructure des jobs (BullMQ)

### 5.1 Purge automatique des anciennes notifications

**Fichiers créés/modifiés :** `cleanup.processor.ts` *(nouveau)*, `queues.ts`, `workers.ts`, `scheduler.ts`

#### Problème

La table `notifications` grossissait indéfiniment. Les notifications lues et anciennes ne servaient plus à rien mais consommaient de l'espace disque et ralentissaient les requêtes.

#### Solution

Nouveau cron hebdomadaire **tous les dimanches à 3h UTC** qui supprime définitivement les notifications satisfaisant les deux critères :
- `isRead = true` (déjà lue par l'utilisateur)
- `createdAt < maintenant - 90 jours`

Les notifications non lues ne sont **jamais** supprimées automatiquement.

---

### 5.2 Retry automatique des jobs critiques

**Fichier :** `src/jobs/queues.ts`

#### Problème

Les queues `overdue`, `recurring` et `reminder` n'avaient aucune politique de retry. Si le job échouait (base de données temporairement indisponible, timeout réseau, erreur Prisma passagère), le job était marqué `failed` et personne n'était notifié.

Conséquences possibles :
- Des factures ne passaient pas en `overdue` certains jours
- Des factures récurrentes n'étaient pas générées
- Des rappels de paiement sautaient

#### Solution

Politique de retry appliquée aux 3 queues critiques :

```typescript
attempts: 3,
backoff: { type: 'exponential', delay: 5 * 60_000 } // 5min → 10min → 20min
```

**Idempotence vérifiée avant activation :** les 3 processors ont été analysés et confirmés idempotents (une re-exécution ne crée pas de doublon) :
- `overdue` : filtre `status: { in: ['issued', 'partially_paid'] }` — une facture déjà `overdue` est ignorée
- `recurring` : transaction atomique qui met à jour `nextInvoiceDate` — un second passage ne regénère pas la même facture
- `reminder` : compare le niveau d'escalade actuel au niveau cible — ne renvoie pas si déjà au bon niveau

---

### 5.3 Rate limiting des backups manuels

**Fichier :** `src/modules/backups/backups.service.ts`

#### Problème

L'endpoint `POST /api/backups/trigger` pouvait être appelé plusieurs fois simultanément (double-clic frontend, retry automatique, bug), ce qui lançait plusieurs `pg_dump` en parallèle. Chaque backup occupant plusieurs centaines de Mo de RAM et d'I/O disque, plusieurs backups simultanés auraient pu saturer le serveur.

#### Solution

Vérification en début de `trigger()` : si un backup avec le statut `pending` ou `running` existe déjà, une erreur `409 Conflict` est retournée avec un message explicite indiquant le statut actuel.

---

### 5.4 Vérification d'intégrité des backups (SHA-256)

**Fichier :** `src/modules/backups/backups.service.ts`

#### Problème

Le checksum SHA-256 était calculé et stocké dans la base au moment de la création du backup, mais **jamais vérifié** au moment du téléchargement. Un fichier de backup corrompu (corruption disque, écriture partielle) pouvait être téléchargé et restauré sans aucun avertissement.

#### Solution

Avant de servir le fichier en téléchargement, le service :
1. Lit le `checksum` stocké en base
2. Recalcule le SHA-256 du fichier sur disque
3. Compare les deux valeurs

Si les checksums ne correspondent pas → erreur `500` avec log d'erreur détaillé (valeur stockée vs calculée) et invitation à créer un nouveau backup.

Cette vérification ne s'applique qu'au **stockage local** (pour les stockages cloud S3/GCS, les URLs signées garantissent déjà l'intégrité).

---

## 6. Audit et traçabilité

### 6.1 Audit trail complet pour les paramètres entreprise

**Fichiers :** `src/core/middleware/audit.ts`, `src/modules/settings/settings.controller.ts`

#### Problème

Le middleware `auditMiddleware` capture l'état "avant" d'une ressource en cherchant `req.params['id']` et en faisant un `prisma.findUnique({ where: { id } })`. Or, la route `PUT /api/settings` est un **singleton** (une seule ligne dans `company_settings`) — elle n'a pas de paramètre `:id`. Résultat : chaque modification des paramètres d'entreprise était loggée dans `audit_logs` avec `previousState: null`, rendant l'audit inutile pour ce cas.

#### Solution

**Approche en deux couches :**

**Couche 1 — Middleware (`audit.ts`) :**
Avant de tenter la lecture Prisma, le middleware vérifie d'abord si un état précédent a été attaché manuellement à la requête via `req.auditPreviousData`. Si oui, il l'utilise directement sans aucune requête supplémentaire.

```typescript
// Priorité 1 : état avant attaché explicitement par le controller
if ((req as any)['auditPreviousData']) {
  oldData = (req as any)['auditPreviousData'];
} else if (recordId && ['PUT', 'PATCH', 'DELETE'].includes(req.method)) {
  // ... lecture Prisma générique (comportement existant)
}
```

**Couche 2 — Controller (`settings.controller.ts`) :**
Avant d'appeler `settingsService.update()`, le controller lit l'état actuel et l'attache à la requête :

```typescript
const before = await settingsService.get();
(req as any)['auditPreviousData'] = before;
```

**Résultat :** `audit_logs` contient maintenant `previousState` (paramètres avant) et `newState` (paramètres après) pour toute modification des paramètres entreprise, permettant de savoir exactement ce qui a changé, quand, et par qui.

---

## Récapitulatif des endpoints ajoutés

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| `GET` | `/api/clients/:id/risk-score` | Score de risque client (0–100) |
| `GET` | `/api/invoices/:id/payment-prediction` | Prédiction date de paiement probable |
| `GET` | `/api/dashboard/cashflow` | Cashflow prévisionnel 30 jours |
| `GET` | `/api/reports/by-method` | Rapport paiements par méthode (JSON/CSV/PDF) |
| `GET` | `/api/reports/aging` | Aging report exportable (JSON/CSV/PDF) |
| `PUT` | `/api/notifications/settings/disable-all` | Désactiver toutes les notifications |
| `PUT` | `/api/notifications/settings/enable-all` | Réactiver toutes les notifications |

---

## Récapitulatif des fichiers modifiés

| Fichier | Type de changement |
|---------|--------------------|
| `src/jobs/processors/cleanup.processor.ts` | **Nouveau** — cron purge notifications |
| `src/jobs/queues.ts` | Ajout `cleanupQueue` + retry overdue/recurring/reminder |
| `src/jobs/workers.ts` | Ajout `cleanupWorker` |
| `src/jobs/scheduler.ts` | Ajout cron `cleanup-weekly` |
| `src/jobs/processors/overdue.processor.ts` | Ajout alerte J-3 expiration proforma |
| `src/jobs/processors/reminder.processor.ts` | Ajout import logger + warning managers vides |
| `src/modules/backups/backups.service.ts` | Vérification intégrité SHA-256 + rate limiting |
| `src/modules/invoices/invoices.service.ts` | Validation parentInvoice + `getPaymentPrediction()` |
| `src/modules/invoices/invoices.controller.ts` | CSV + réf. client + `getPaymentPrediction` handler |
| `src/modules/invoices/invoices.routes.ts` | Route `payment-prediction` |
| `src/modules/payments/payments.service.ts` | Guards montant nul + solde nul |
| `src/modules/clients/clients.service.ts` | Détection doublons + `getRiskScore()` |
| `src/modules/clients/clients.controller.ts` | Handler `getRiskScore` |
| `src/modules/clients/clients.routes.ts` | Route `risk-score` |
| `src/modules/proformas/proformas.controller.ts` | CSV + réf. client |
| `src/modules/recurring/recurring.service.ts` | Fix dates fin de mois + `_count.invoices` |
| `src/modules/dashboard/dashboard.service.ts` | Ajout `getCashflowForecast()` |
| `src/modules/dashboard/dashboard.routes.ts` | Route `cashflow` |
| `src/modules/reports/reports.service.ts` | Fix classe + `getAgingReport()` + `getPaymentsByMethod()` + réf. client |
| `src/modules/reports/reports.routes.ts` | Routes `aging`, `by-method` + réf. client dans CSV |
| `src/modules/settings/settings.controller.ts` | Capture état avant pour audit |
| `src/modules/notifications/notifications.service.ts` | `disableAll()` + `enableAll()` |
| `src/modules/notifications/notifications.controller.ts` | Handlers disable/enable all |
| `src/modules/notifications/notifications.routes.ts` | Routes disable/enable all |
| `src/core/middleware/audit.ts` | Support `req.auditPreviousData` pour singletons |
