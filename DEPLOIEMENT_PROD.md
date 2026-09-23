# Déploiement en production — InvoiceHub v2/v3

> Ce fichier liste les commandes à taper sur le **serveur de prod** pour mettre à jour l'application.
> **Règle** : à chaque nouvelle fonctionnalité, une entrée est ajoutée dans le **journal** en bas
> avec les commandes *supplémentaires* à exécuter (migrations SQL, scripts de synchro, etc.).

---

## 1. Procédure standard (à chaque déploiement)

Depuis le dossier du backend (`invoicehub-api/`) :

```bash
# 1. Récupérer le code
git pull

# 2. Backend — dépendances + client Prisma + migrations + build
cd invoicehub-api
pnpm install
pnpm db:generate            # prisma generate (client à jour)
pnpm db:migrate             # prisma migrate deploy (applique les migrations en attente)
pnpm build

# 3. Frontend
cd ../bridge-frontend
pnpm install
pnpm build

# 4. Redémarrer les services
#   - PM2 :
pm2 restart invoicehub-api
pm2 restart bridge-frontend
#   - ou Docker :
#   docker compose -f invoicehub-api/docker-compose.yml up -d --build
```

> ⚠️ **Toujours faire une sauvegarde de la base avant** une mise à jour qui touche le schéma :
> ```bash
> pg_dump -U postgres -d invoicehub -F c -f backup_$(date +%F).dump
> ```

---

## 2. Commandes utiles (rappel)

| But | Commande (dans `invoicehub-api/`) |
|---|---|
| Appliquer les migrations | `pnpm db:migrate` |
| État des migrations | `pnpm db:status` |
| Régénérer le client Prisma | `pnpm db:generate` |
| Rafraîchir les templates email en base | `pnpm db:sync-emails` |
| Exécuter un fichier SQL ponctuel | `npx prisma db execute --file prisma/<fichier>.sql --schema prisma/schema.prisma` |

---

## 3. Journal par fonctionnalité (le plus récent en haut)

> Ces commandes sont **en plus** de la procédure standard, à ne lancer **qu'une seule fois** par
> environnement (elles sont idempotentes sauf mention contraire).

### 2026-09-23 — Envoi des factures & devis par email (+ « marquer comme envoyé »)
Depuis le menu d'actions d'une **facture** ou d'un **devis** : bouton « Envoyer par email »
ouvrant un drawer (destinataire pré-rempli, CC, objet, message, PDF joint automatiquement),
avec **deux actions** :
- **Envoyer** → email réel au client (PDF joint), via la file `email` (Nodemailer/SMTP).
- **Marquer comme envoyé** → aucun email ; trace la date (l'employé l'a transmis lui-même).
  Pour un devis en brouillon, le passe aussi à « envoyé ».
- **Reply-To configurable** (Paramètres → Facturation → « Envoi des documents par email ») :
  l'employé qui envoie (défaut) ou une adresse centrale. Copie (BCC) à l'employé.
- Expéditeur = **nom de l'entreprise** depuis `company_settings` (white-label ; l'ancienne
  adresse `noreply@bts.cm` en dur a été retirée du mailer).

> **Migration SQL requise** (`email_config` sur company_settings + `last_email_sent_at` sur
> invoices/proformas) :
> ```bash
> npx prisma db execute --file prisma/add_document_email_sending.sql --schema prisma/schema.prisma
> pnpm db:generate
> ```
> **Variables d'env pour l'envoi réel** (sinon « Envoyer » est bloqué, « Marquer comme envoyé »
> reste dispo) : `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE`, `SMTP_FROM`.
> ⚠️ Délivrabilité : configurer **SPF/DKIM** sur le domaine d'envoi (sinon spam) — voir avec l'IT.

### 2026-09-23 — Module Facture : récurrence auto + avoir partiel comptabilisé + duplicate
- **Factures récurrentes auto-générées** : le cron `recurring` quotidien appelle désormais
  `RecurringService.generateDueTemplates()` → crée les factures dues en **brouillon** (à
  relire/émettre) au lieu de seulement notifier. Notification aux détenteurs de `invoices:read`.
- **Avoir partiel comptabilisé (correctif compta)** : `createAvoir` ne produisait **aucune
  écriture** (il appelait `onInvoiceCancelled(avoir.id)` qui ne trouvait rien, + l'outbox
  échouait en boucle). Nouveau hook `onAvoirIssued` : **Dr 70x + Dr 443 / Cr 411** basé sur
  les lignes de l'avoir (réduit CA + TVA + créance). L'annulation COMPLÈTE reste inchangée
  (contre-passe l'originale). Vérifié équilibré (Dr=Cr).
- **`duplicate`** recopie désormais l'escompte, les options d'affichage et le compte bancaire.

> **Aucune migration SQL** (changements de logique + comptabilité uniquement).
> ⚠️ Les avoirs partiels créés AVANT ce correctif restent **sans écriture** (leur événement
> outbox `onInvoiceCancelled` est en échec définitif, sans impact fonctionnel). Rattrapage
> possible si besoin : enregistrer un événement `onAvoirIssued` (sourceType `invoice`) pour
> chaque avoir concerné et laisser l'outbox le rejouer — à faire seulement si des avoirs
> partiels existent déjà en prod.

### 2026-09-23 — Module Stock : inventaire physique (comptage + recalage)
Nouveau sous-module **Inventaire** (obligation SYSCOHADA art. 17) : on crée une session
(fige le stock théorique), on saisit les quantités **réellement comptées**, la validation
génère un **mouvement d'ajustement par écart** (recale le stock EXACTEMENT sur le compté +
écriture comptable). Écran de comptage sous **Stock → Inventaires** (`/stock/inventory`).
- API : `GET/POST /stock/inventory`, `GET /stock/inventory/:id`, `PUT :id/counts`,
  `POST :id/validate`, `POST :id/cancel` (lecture `stock:read`, actions `stock:adjust`).

> **Migration SQL requise** (nouvelles tables `inventory_sessions` + `inventory_count_lines`
> et l'enum `inventory_session_status`) :
> ```bash
> npx prisma db execute --file prisma/add_inventory_sessions.sql --schema prisma/schema.prisma
> pnpm db:generate
> ```
> (La procédure standard `pnpm db:generate` + `pnpm build` suffit ensuite.)

### 2026-09-23 — Module Stock : fiabilité des mouvements + contre-passation
- **Sorties/entrées de stock fiabilisées** : à l'émission d'une facture (sortie `sale`) et à
  la réception d'un BC (entrée `purchase_receipt`), le mouvement était *fire-and-forget* avec
  échec **silencieux** (`console.error`). Désormais **attendu** ; en cas d'échec (compte de
  stock manquant, stock insuffisant), une **notification** est envoyée aux détenteurs de
  `stock:adjust` pour régularisation. Plus de désync stock↔ventes muette.
- **Bug pagination corrigé** : le filtre « stock bas / rupture » (`GET /stock/levels`) était
  appliqué **après** la pagination (total faux, pages vides). Filtrage désormais sur l'ensemble
  puis pagination en mémoire.
- **Contre-passation d'un mouvement** (nouveau) : `POST /stock/movements/:id/reverse`
  (droit `stock:adjust`) crée le mouvement inverse (restaure quantité + valeur) et **extourne
  l'écriture comptable** d'origine (inversion exacte). Refuse si le stock deviendrait négatif
  ou si le mouvement est déjà une contre-passation. Bouton « Contre-passer » dans le journal.
- Correctifs : idempotence de l'écriture stock (`onStockMovement`), bornes de dates du journal
  en **UTC**, champ mort `supplierId` retiré du schéma d'ajustement.

> **Aucune migration SQL** (réutilise tables/enums existants ; `sourceType` = simples chaînes).
> Aucune action prod supplémentaire.

### 2026-09-22 — Module Dépenses : RBAC réparé + justificatifs + récurrence + remboursement
- **RBAC réparé (bloquant)** : les routes dépenses/catégories exigeaient `expenses:write` et
  `expenses:pay`, permissions **inexistantes** au catalogue → seul l'admin (`*`) pouvait créer/
  modifier/payer une dépense (le **comptable** ne pouvait que lire/approuver). Contrôleurs passés
  à `expenses:create`/`update`/`pay`. Catalogue enrichi de `expenses:pay` et `expenses:*`.
- **Justificatifs câblés** : l'upload était un faux bouton et le détail n'affichait rien. Upload
  réel (validation type + 5 Mo), aperçu authentifié, suppression **avec purge disque**.
- **Récurrence** effective : les dépenses `isRecurring` génèrent des **brouillons** à chaque
  échéance (cron `recurring` quotidien, déjà planifié) — fréquence + date de fin au formulaire.
- **Remboursement note de frais employé** : action « Rembourser l'employé » (`POST /expenses/:id/reimburse`).
- Correctifs : `taxAmount` désormais calculé (restait à 0), `paidAmount` renseigné au paiement,
  compte comptable validé au plan comptable, stats en UTC, recherche élargie (bénéficiaire/réf.),
  champ fantôme `supplierInvoiceId` retiré.

> **Aucune migration SQL** (tous les champs utilisés — `frequency`, `next_occurrence_date`,
> `end_date`, `reimbursed_at`, `paid_amount`, `tax_amount`… — préexistaient au schéma).
> **Action prod à lancer une fois** (accorde les nouvelles permissions au rôle comptable) :
> ```bash
> npx ts-node prisma/grant-expense-permissions.ts
> ```
> ⚠️ Rôles **personnalisés** gérant les dépenses : leur accorder `expenses:pay` (et
> `expenses:delete` si suppression attendue) via Paramètres → Rôles.

### 2026-09-22 — Budgets v2 (Phase 4.4) : ventilation annuel → mensuel
Action **« Ventiler sur 12 mois »** (modale d'édition d'un budget annuel) : remplace le
budget annuel par **12 budgets mensuels** (répartition égale, résidu d'arrondi sur décembre),
dimensions et statut conservés. `POST /expense-budgets/:id/spread`. Aucune migration SQL.
Refuse si des budgets mensuels existent déjà pour le même compte/dimension/année.

### 2026-09-22 — Budgets v2 (Phase 4.6) : workflow d'approbation du budget (opt-in)
- Nouvelle colonne `expense_budgets.status` (`draft`/`active`, défaut **`active`** → aucun
  changement pour les budgets existants).
- Si `company_settings.budget_control.requireApproval = true` : un budget créé naît en
  **`draft`** et **ne s'applique au contrôle a priori qu'une fois activé** (bouton « Activer »,
  droit `expenses:approve`, route `POST /expense-budgets/:id/activate`).
- Réglage dans **Paramètres → Facturation → Contrôle budgétaire**.

```bash
cd invoicehub-api
npx prisma db execute --file prisma/add_budget_status.sql --schema prisma/schema.prisma
```
> Opt-in : par défaut `requireApproval` est faux et les budgets sont actifs immédiatement.

### 2026-09-21 — Budgets v2 (Phase 4.1) : engagé = dépenses + commandes d'achat
L'« engagé » d'un budget inclut désormais les **commandes d'achat ouvertes** (statut
`sent`/`confirmed`, non `fullyInvoiced`), rattachées au **compte d'achat par défaut**
(`company_settings.default_purchase_account`), en plus des dépenses approuvées non payées.
On s'arrête à `confirmed` pour ne pas double-compter avec le réalisé (le grand-livre prend
le relais à la validation de la facture fournisseur). Aucune migration SQL.

### 2026-09-21 — Budgets v2 (Phase 3b) : édition + révisions/versions
- **Édition d'un budget** (bouton crayon sur chaque carte) : réutilise la modale, permet
  de modifier compte/dimensions/période/montant.
- **Révisions/versions** : tout changement de **montant** est journalisé (ancien → nouveau,
  motif, auteur, date) dans la nouvelle table `budget_revisions` ; l'historique s'affiche
  dans la modale d'édition. Endpoint `GET /expense-budgets/:id/revisions`.

```bash
cd invoicehub-api
npx prisma db execute --file prisma/add_budget_revisions.sql --schema prisma/schema.prisma
```
> Termine le module Budgets v2 (Phases 1 → 3). Aucune nouvelle dépendance.

### 2026-09-21 — Budgets v2 (Phase 3a) : report de reliquat + import Excel
- **Report (carry-over)** : bouton « Préparer {N+1} » → recopie les budgets de l'année N
  vers N+1 (`POST /expense-budgets/carry-over` — `basis` = `budget` ou `remaining`). Les
  budgets déjà présents en N+1 sont ignorés.
- **Import Excel** : bouton « Importer » → `.xlsx` (colonnes : Compte, Année, Période,
  Mois/Trimestre, Montant, Libellé) → `POST /expense-budgets/import`. Chaque ligne est
  validée indépendamment ; le rapport indique les créés et les erreurs par ligne.

> Aucune migration SQL, aucune nouvelle dépendance (`exceljs` déjà ajouté en Phase 2).
> Reste (Phase 3b) : révisions/versions de budget (nécessite l'écran d'édition).

### 2026-09-21 — Budgets v2 (Phase 2) : Budget vs Réalisé consolidé + export Excel/PDF
- Nouvel écran **Budget vs Réalisé** (bascule « Suivi » / « Budget vs Réalisé » sur la page
  Budgets) : tableau consolidé par compte avec Budget / Engagé / Réalisé / Disponible / % +
  **projection d'atterrissage** (run-rate linéaire) et totaux par nature (charges/produits).
- **Export Excel** (`exceljs`) et **PDF** : `GET /expense-budgets/export?format=xlsx|pdf&year=`.
- Endpoint consolidé : `GET /expense-budgets/summary?year=`.

> **Nouvelle dépendance backend : `exceljs`.** Lancer `pnpm install` sur l'API avant de
> (re)démarrer. Aucune migration SQL.

```bash
cd invoicehub-api && pnpm install
```

### 2026-09-21 — Budgets v2 (Phase 1b) : contrôle a priori + alertes configurables
- **Contrôle a priori** : à l'**approbation** d'une dépense, si son compte/période dépasse
  le budget → **blocage** (refus d'approbation) si `blockOnExceed`, sinon **alerte** au
  franchissement du seuil. Le contrôle est à l'approbation (le paiement ne change pas le
  consommé : engagé → réalisé).
- **Alertes cohérentes** : `checkBudgetAlerts` (par catégorie, au paiement) remplacé par
  une évaluation **par compte** réutilisant réalisé + engagé. Fini l'incohérence introduite
  en Phase 1 (les budgets par compte n'étaient plus surveillés).
- **Configurable** : `company_settings.budget_control` = `{ warnThresholdPct, blockOnExceed,
  notifyRoles[] }`, éditable dans **Paramètres → Facturation → Contrôle budgétaire** (fini
  le 80/100 % et « admins » codés en dur).

```bash
cd invoicehub-api
npx prisma db execute --file prisma/add_budget_control.sql --schema prisma/schema.prisma
```
> Défauts : seuil 80 %, blocage désactivé, notifie les `admin`. Aucun changement de
> comportement bloquant tant que `blockOnExceed` n'est pas activé.

### 2026-09-21 — Budgets v2 (Phase 1) : par compte comptable + engagé/réalisé/disponible
Refonte du module budget en outil de pilotage :
- Le budget cible désormais un **compte comptable** (classe 6 charge / 7 produit) avec
  **dimensions optionnelles** (catégorie, bureau) et **périodicité** (annuel / trimestriel /
  mensuel). Débloque le **budget de revenus** (classe 7), pas seulement les dépenses.
- **Réalisé** calculé depuis le **grand-livre** (couvre 6 et 7) ; **engagé** = dépenses
  approuvées/soumises non encore payées ; **disponible** = budget − engagé − réalisé.
- Compte budgété validé (existant, actif, classe 6/7) ; unicité multi-dimensions ; UI
  refondue (sélecteur de compte, dimensions, 4 métriques + jauge empilée réalisé/engagé).
- Reprise des budgets par catégorie existants : rattachement au compte de la catégorie.

```bash
cd invoicehub-api
npx prisma db execute --file prisma/add_budget_dimensions.sql --schema prisma/schema.prisma
```
> Aucune donnée perdue : les budgets par catégorie restent, avec `account_number` repris de
> la catégorie quand disponible (sinon réalisé = 0 tant qu'un compte n'est pas fixé).
> Phases suivantes (à venir) : contrôle a priori à l'approbation d'une dépense, seuils
> configurables, écran budget/réalisé consolidé + export, révisions/report.

### 2026-09-21 — White-label : dé-câblage des éléments codés « BTS/Cameroun »
Prérequis pour donner l'app à une autre entreprise (déploiement dédié) :
- **Numérotation des documents** : le préfixe vient désormais de
  `company_settings.company_code` (repli `BTS`), au lieu de `BTS` codé en dur dans
  `fn_next_document_number`. Les numéros déjà émis ne changent pas.
- **Libellés TVA des PDF** : le taux affiché (« TVA 19,25 % ») est dérivé du **taux réel
  des lignes** (taux unique → affiché ; taux multiples → « TVA » sans taux). Le rapport
  TVA affiche le **taux par défaut configuré** + le pays, plus de « CGI du Cameroun » figé.
- **Assistant IA** : prompt devenu **gabarit à jetons** rempli par les paramètres
  entreprise (nom, code, ville, pays, devise, taux) — plus d'identité « BTS » ni de nom de
  développeur en dur. L'assistant se nomme « {company_code} Assistant ».
- **Noms de fichiers PDF** états financiers : `{company_code}_Bilan_…` au lieu de `BTS_…`.

```bash
cd invoicehub-api
npx prisma db execute --file prisma/add_company_code_numbering.sql --schema prisma/schema.prisma
```
> Reste volontairement dépendant de l'env : `TOTP_ISSUER` (label 2FA) — à définir par
> déploiement. L'app reste **mono-entreprise** (une autre société = instance dédiée + re-seed)
> et **orientée OHADA/SYSCOHADA** (plan comptable, états, TVA).

### 2026-09-21 — Budgets de dépenses : correction des bugs bloquants
- **RBAC réparé** : les routes budget exigeaient `expenses:write` (permission **inexistante**
  au catalogue) → seul l'admin passait. Corrigé en `expenses:create` / `expenses:update` /
  `expenses:delete` → le **comptable** peut de nouveau gérer les budgets. Front aligné.
- **`categoryId` désormais requis** (schéma + formulaire) : la colonne étant NOT NULL, un
  budget sans catégorie plantait en 500. La catégorie est validée (existence) à la création.
- **Doublon** (catégorie, année, mois) renvoie un **409** clair au lieu d'un 500 (contrôle
  applicatif car en Postgres deux `month=NULL` ne violent pas la contrainte unique).
- **`spent` calculé en UTC** dans `listBudgets` (comme les alertes) — plus de décalage d'un
  jour en bord de période au Cameroun (UTC+1).
- **Traçabilité** : `createdById` renseigné à la création.

> **Aucune migration SQL.** Changements de logique + permissions uniquement.
> ⚠️ Rôles personnalisés gérant les budgets : s'assurer qu'ils ont `expenses:create/update/delete`.

### 2026-09-21 — Journaux comptables : protection & fiabilisation
- **Journaux système** : nouvelle colonne `accounting_journals.is_system` (les 7 journaux
  seedés VTE/ACH/BQ/CAI/OD/AN/CL sont marqués système). Un journal système ne peut plus
  être **supprimé, désactivé ni changer de type**. Un journal non système ne peut pas non
  plus être **supprimé/désactivé s'il est le dernier actif de son type**, ni changer de
  type **s'il porte déjà des écritures**.
- **Sélection déterministe** : `getDefaultJournal` (et la clôture d'exercice) choisissent
  le journal par `isDefault` puis `code` (fini le `findFirst` dépendant de l'ordre physique
  quand plusieurs journaux partagent un type). `isDefault` est désormais réglable (un seul
  par type).
- **Validation** : le compte de contrepartie par défaut d'un journal est vérifié au plan
  comptable (existant, imputable, actif).
- **UI** : les journaux **inactifs** sont désormais listés (réactivables) ; badges
  Système / Par défaut ; type verrouillé pour un journal système ou déjà mouvementé.
- **Permissions** : routes journaux passées de `accounting:*` à **`fiscal:read`/`fiscal:write`**
  (cohérent avec les périodes ; détenu par admin + comptable), front aligné.

```bash
cd invoicehub-api
npx prisma db execute --file prisma/add_journal_is_system.sql --schema prisma/schema.prisma
```
> ⚠️ Si des **rôles personnalisés** géraient les journaux via `accounting:write`, leur
> accorder `fiscal:write`. Les rôles système `admin`/`comptable` l'ont déjà.

### 2026-09-20 — Module paiement : fiabilisation (concurrence, période, rapprochement)
Corrections des points critiques du module de paiement :
- **Concurrence** : la création d'un paiement verrouille désormais la facture
  (`SELECT … FOR UPDATE`) et **recalcule le montant réglé par agrégation** des
  paiements (fini l'arithmétique sur snapshot périmé). Deux paiements simultanés
  sur la même facture ne peuvent plus dépasser le solde ni corrompre `amountPaid`.
- **Période comptable** : un paiement daté hors d'un exercice **ouvert** est
  désormais **refusé** (avant : accepté mais écriture Dr 521/Cr 411 échouant en
  silence → règlement sans comptabilité).
- **Rapprochement** : impossible de supprimer un paiement **rapproché** d'une
  transaction bancaire ; il faut d'abord le dé-rapprocher (module Banque).
- `attachmentPath` n'est plus accepté dans le corps de création (anti-spoof) :
  seul l'endpoint `/attachment` le définit.
- Suppression d'un paiement : trace le changement de statut (`statusHistory`) et
  restaure `overdue` si l'échéance est dépassée (au lieu de forcer `issued`).

> **Aucune migration SQL.** Changements de comportement uniquement.

### 2026-09-20 — Périodes comptables : corrections & durcissement
Refonte des points faibles du module de périodes :
- **Création d'exercice** génère désormais les **12 périodes mensuelles** (conforme à
  l'UI et aux déclarations de TVA mensuelles) au lieu d'une seule période annuelle ;
  refuse la création d'un exercice déjà existant et trace le créateur.
- **`getOpenPeriod` / auto-détection** comparent par **date calendaire** : corrige
  l'échec silencieux des contre-passations effectuées le dernier jour d'une période
  (l'écriture d'extourne était omise → solde faussé).
- **Numérotation des écritures manuelles** unifiée sur le préfixe du journal
  (`JOURNAL-AAAA-NNNNN`, année **UTC**) au lieu de l'ancien `JNL-…` global qui polluait
  les journaux et cassait le calcul du dernier numéro.
- **Permissions** : les routes périodes / clôture d'exercice passent de `accounting:*`
  à **`fiscal:read` / `fiscal:write`** (permission dédiée, déjà détenue par `admin` et
  `comptable`).
- Frontend : confirmations `window.confirm()` remplacées par un `ConfirmDialog`, barre
  de progression basée sur le nombre réel de périodes.

> **Aucune migration SQL.** ⚠️ Si des **rôles personnalisés** doivent gérer les périodes,
> leur accorder `fiscal:read` / `fiscal:write` (les rôles système `admin`/`comptable`
> les ont déjà). Les exercices déjà créés « en une période annuelle » restent tels quels ;
> pour repartir sur 12 mois, supprimer l'exercice (s'il est sans écriture) puis le recréer.

### 2026-09-20 — TVA sur les encaissements (prestations de services)
Régime optionnel des encaissements pour la **TVA des services** (les marchandises restent au
régime des débits). Quand `tva_on_collection` est activé dans les paramètres : à l'émission, la
TVA des lignes de **services** est logée en **4438** « TVA en attente d'exigibilité » (au lieu de
4431) ; à **chaque règlement**, la fraction encaissée est transférée `Dr 4438 / Cr 4431` au prorata
du montant payé sur le TTC (le solde final absorbe le résidu d'arrondi). L'écriture de transfert
(journal **OD**, `entryKind='tva_collection'`) est idempotente par paiement et contre-passée si le
paiement est supprimé. Ajoute le compte **4438**, les colonnes `company_settings.pending_tva_account`
(défaut `'4438'`) et `company_settings.tva_on_collection` (défaut `FALSE`). Réglage dans
**Paramètres → Facturation → Comptes SYSCOHADA → TVA sur les encaissements**.

> Durcissement inclus : `nextEntryNumber` borne désormais la recherche du dernier numéro au
> **préfixe exact** (`JOURNAL-ANNÉE-`), pour éviter qu'une donnée héritée mal préfixée dans le même
> journal provoque une collision d'`entry_number`.

```bash
cd invoicehub-api
npx prisma db execute --file prisma/add_tva_on_collection.sql --schema prisma/schema.prisma
```
> Option **désactivée par défaut** : aucun changement de comportement tant qu'elle n'est pas activée.
> À valider avec l'expert-comptable avant activation (régime réel selon la déclaration de TVA).

### 2026-09-16 — Règles de matching : compteur d'usage + anti-doublon + logique effective
Le module de règles de rapprochement exploite désormais réellement l'apprentissage :
bonus fondé sur le **libellé bancaire** (et non le libellé fabriqué), règles **globales**
prises en compte, bonus appliqué aussi dans l'**auto-match**, `isAutoApply` **effectif**
(abaisse le seuil d'auto-application à 75 % avec marge), règles **manuelles fiables d'emblée**,
plage de montants **élargie** au fil de l'apprentissage, **jokers `*`/`?`** supportés, et audit
des mutations. Ajoute `bank_matching_rules.usage_count` (compteur réel) + contrainte unique
`(bank_account_id, label_contains, entity_type)`.

```bash
cd invoicehub-api
npx prisma db execute --file prisma/add_matching_rule_usage_and_unique.sql --schema prisma/schema.prisma
```
> ⚠️ La contrainte unique échoue s'il existe des doublons de règle : dédupliquer d'abord
> (garder la règle à la confiance la plus haute). En dev, aucune dédup n'a été nécessaire.

### 2026-09-16 — Contrepartie automatique des frais bancaires / agios (rapprochement)
Un débit bancaire sans contrepartie métier dont le libellé est reconnu (FRAIS, COMMISSION,
AGIOS, INTÉRÊTS…) peut, **sur confirmation**, générer sa contrepartie comptable : une dépense
« payée » + son écriture SYSCOHADA (Dr **627** services bancaires / **671** agios & intérêts,
+ 445x si TVA / Cr **521** banque) + le rapprochement de la transaction. Le dé-rapprochement
supprime la dépense et son écriture. Ajoute la colonne `expenses.auto_bank_fee`.

```bash
cd invoicehub-api
npx prisma db execute --file prisma/add_expense_auto_bank_fee.sql --schema prisma/schema.prisma
```
> Endpoint : `POST /api/bank/transactions/:id/create-fee-expense` (permission `bank:reconcile`).
> Plafond de sécurité appris de l'historique ; au-delà, `allowOverCeiling: true` requis.

### 2026-07-02 — Options d'affichage du PDF par facture (masquer colonne PT / TOTAL HT)
Permet, **facture par facture**, de masquer sur le PDF la colonne **PT** (montant par ligne d'article)
et/ou la/les ligne(s) **TOTAL HT** du bloc des totaux — sans toucher aux calculs ni à la
comptabilité. Cas d'usage : un client qui, sur une facture solde, ne veut pas voir le détail
des montants par ligne ni le HT du projet complet. Nouvelle colonne JSON `display_options`
(défaut `{}`) sur `invoices` : `{ "hidePtColumn": true, "hideTotalHt": true }`.

```bash
cd invoicehub-api
# Ajoute la colonne display_options (idempotent)
npx prisma db execute --file prisma/add_invoice_display_options.sql --schema prisma/schema.prisma
pnpm db:generate    # régénère le client Prisma avec le nouveau champ
```
> Les cases se règlent dans le formulaire de facture, carte « Affichage du PDF ».

### 2026-07-01 — Retenue à la source subie (acompte IR / précompte 2,2 %)
Gestion de la retenue à la source prélevée par certains clients (État, grandes entreprises) :
saisie **au moment du paiement** (rien sur la facture), la facture est soldée par
*encaissé + retenue*. Nouveaux comptes/colonnes : `withholding_account` (défaut `4492`) et
`withholding_rate` (défaut `2.2`) sur `company_settings` ; `withholding_applied` /
`withholding_amount` sur `payments`. Écriture comptable Dr 4492 / Cr 411.

```bash
cd invoicehub-api
# Ajoute les colonnes retenue à la source (idempotent)
npx prisma db execute --file prisma/add_withholding_source.sql --schema prisma/schema.prisma
pnpm db:generate    # régénère le client Prisma avec les nouveaux champs
```
> Compte et taux configurables dans Paramètres → Facturation → Comptes comptables SYSCOHADA.

### 2026-07-01 — Filigrane BROUILLON / ANNULÉE sur les PDF
Filigrane diagonal en arrière-plan des documents brouillon (« BROUILLON ») et annulés (« ANNULÉE »)
sur factures, proformas et bons de commande. **Pur changement de code** (aucune migration ni script).

```bash
# Rien de spécial : la procédure standard (git pull → build → restart) suffit.
```

### 2026-07-01 — Couverture emails + identification InvoiceHub + sécurité
Commit `7ede4c9`. Nouveaux templates email (bon de commande, facture fournisseur, budget, compta),
objet préfixé `[InvoiceHub]`, échappement HTML.

```bash
cd invoicehub-api
# a) Aligner l'enum notification_status (valeurs v3 manquantes en base)
npx prisma db execute --file prisma/sync_notification_status_enum.sql --schema prisma/schema.prisma
# b) Rafraîchir/insérer les 22 templates email en base
pnpm db:sync-emails
```
> ⚠️ `db:sync-emails` **écrase** les templates personnalisés depuis l'interface (Paramètres →
> Notifications). Ne le relancer que si l'on veut repartir du design fourni par le code.

### 2026-06 — Option comptable « avances et acomptes reçus » (compte 4191)
Ajoute les colonnes `use_advance_account` / `advance_account` à `company_settings`.

```bash
cd invoicehub-api
npx prisma db execute --file prisma/add_advance_account_4191.sql --schema prisma/schema.prisma
```

---

## Modèle d'entrée (à copier pour chaque nouvelle fonctionnalité)

```
### AAAA-MM-JJ — Titre de la fonctionnalité
Commit `xxxxxxx`. Description courte.

​```bash
# commandes prod supplémentaires (migrations SQL, scripts…)
​```
> ⚠️ Notes / précautions éventuelles.
```
