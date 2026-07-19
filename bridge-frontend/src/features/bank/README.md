# Module Banque — Spécifications UI

> Document de référence pour l'implémentation de toutes les pages du module banque.
> Basé sur les meilleures pratiques de Pennylane, Xero, QuickBooks et Wave,
> adapté à la charte graphique Bridge Technologies Solutions.

---

## Table des matières

1. [Architecture du module](#1-architecture-du-module)
2. [Charte visuelle appliquée](#2-charte-visuelle-appliquée)
3. [Page `/bank/accounts` — Comptes bancaires](#3-page-bankaccounts--comptes-bancaires)
4. [Page `/bank/import` — Import de relevé](#4-page-bankimport--import-de-relevé)
5. [Page `/bank/transactions` — Transactions](#5-page-banktransactions--transactions)
6. [Page `/bank/reconciliations` — Rapprochements](#6-page-bankreconciliations--rapprochements)
7. [Page `/bank/matching-rules` — Règles de matching](#7-page-bankmatching-rules--règles-de-matching)
8. [Composants partagés](#8-composants-partagés)
9. [Structure des fichiers à créer](#9-structure-des-fichiers-à-créer)

---

## 1. Architecture du module

### Navigation (déjà en place)

La sidebar expose un overlay panel `bank` avec 5 entrées :

```
COMPTES
  └─ Mes comptes bancaires         /bank/accounts
IMPORT
  └─ Importer un relevé            /bank/import
TRANSACTIONS
  └─ Transactions                  /bank/transactions
RAPPROCHEMENT
  ├─ Rapprochements                /bank/reconciliations
  └─ Règles de matching            /bank/matching-rules
```

### Permissions requises (vérifier côté guard)

| Action                       | Permission            |
|------------------------------|-----------------------|
| Lire comptes, transactions   | `bank:read`           |
| Créer / modifier un compte   | `bank:manage`         |
| Rapprocher une transaction   | `bank:reconcile`      |
| Détecter / prévisualiser     | `bank:import-parse`   |
| Confirmer un import          | `bank:import-confirm` |
| Auto-matching batch          | `bank:auto-match`     |
| Gérer les règles             | `bank:rules`          |

---

## 2. Charte visuelle appliquée

Toutes les pages respectent les tokens CSS globaux de l'application :

| Élément               | Valeur                          |
|-----------------------|---------------------------------|
| Fond page             | `var(--bg)` → `#f0f4f9`         |
| Surface card          | `var(--surface)` → `#ffffff`    |
| Surface secondaire    | `var(--surface-2)` → `#f8fafc`  |
| Bordure               | `var(--border)` → `#e2e8f0`     |
| Texte principal       | `var(--text-1)` → `#0f1923`     |
| Texte secondaire      | `var(--text-2)` → `#3d5166`     |
| Texte tertiaire       | `var(--text-3)` → `#5a7a96`     |
| Primaire BTS          | `var(--primary)` → `#2D7DD2`    |
| Police titres         | Sora (font-display)             |
| Police corps          | DM Sans                         |
| Police montants/codes | JetBrains Mono                  |
| Radius card           | `var(--radius-lg)` → 14px       |
| Radius input          | `var(--radius-md)` → 10px       |

### Couleurs de statut spécifiques au module banque

| Statut                | Couleur badge              |
|-----------------------|----------------------------|
| `pending` En attente  | Amber `#d97706` / fond `#fef3c7`  |
| `reconciled` Rapproché | Vert `#16a34a` / fond `#dcfce7`  |
| `unmatched` Non identifié | Rouge `#dc2626` / fond `#fee2e2` |
| `ignored` Ignoré      | Gris `#64748b` / fond `#f1f5f9`  |
| Session `open`        | Bleu `#3b82f6` / fond `#dbeafe`  |
| Session `completed`   | Vert `#16a34a` / fond `#dcfce7`  |
| Import `processing`   | Violet `#9333ea` / fond `#f3e8ff`|
| Import `completed`    | Vert `#16a34a` / fond `#dcfce7`  |
| Import `failed`       | Rouge `#dc2626` / fond `#fee2e2` |

---

## 3. Page `/bank/accounts` — Comptes bancaires

### Référence UX

Inspiré de **Pennylane** (cards colorées par compte), **Xero** (synthèse solde total en haut),
**QuickBooks** (actions rapides par compte). Meilleure approche : vue en grille de cards,
pas un tableau — les comptes bancaires sont des entités visuelles, pas des lignes de données.

### 3.1 Structure générale

```
┌─ PageHeader ─────────────────────────────────────────────────────┐
│  Titre: "Comptes bancaires"                                       │
│  Sous-titre: "{n} compte(s) actif(s)"                            │
│  Actions: [+ Nouveau compte]                                      │
└──────────────────────────────────────────────────────────────────┘

┌─ Barre KPI (4 cards en ligne) ───────────────────────────────────┐
│  [Solde total]  [Transactions en attente]  [Sessions ouvertes]   │
│  [Imports ce mois]                                                │
└──────────────────────────────────────────────────────────────────┘

┌─ Grille de cards comptes ────────────────────────────────────────┐
│  [Card compte 1]  [Card compte 2]  [Card compte 3]  ...          │
│  Responsive: 3 colonnes desktop, 2 tablette, 1 mobile            │
└──────────────────────────────────────────────────────────────────┘
```

### 3.2 Barre KPI

Données issues de `GET /bank/summary`. 4 cards horizontales, style `.card` avec icône colorée :

| KPI                            | Icône         | Couleur icône  |
|--------------------------------|---------------|----------------|
| Solde total (somme tous comptes) | `Wallet`     | `var(--primary)` |
| Transactions non rapprochées   | `AlertCircle` | `#d97706` amber |
| Sessions de rapprochement ouvertes | `GitMerge` | `#9333ea` violet |
| Imports ce mois                | `Upload`      | `#16a34a` vert  |

Structure d'une KPI card :
```
┌────────────────────────┐
│ [Icône 40×40 arrondi]  │
│ Valeur (20px, mono, bold) │
│ Libellé (12px, text-3) │
└────────────────────────┘
```

Le solde total affiche la devise (XAF) et le montant en monospace.
Si `unreconciledCount > 0`, la KPI "Transactions en attente" a une couleur amber et un lien
vers `/bank/transactions?reconciled=false`.

### 3.3 Card d'un compte

Chaque compte est une card cliquable menant à sa page de détail ou ouvrant le tiroir d'édition.

```
┌──────────────────────────────────────────────┐
│ ● [bande couleur gauche 4px — color du compte]│
│                                               │
│ [Icône type compte]  NOM DU COMPTE            │
│                      Nom banque               │
│                                               │
│ Solde actuel                                  │
│ XXX XXX XAF   (monospace, 18px, bold)         │
│                                               │
│ [badge type]  [badge devise]                  │
│                                               │
│ ── séparateur ────────────────────────────    │
│ N° de compte: ••••••1234                      │
│ En attente:   12 transactions  (si > 0, amber)│
│                                               │
│ [ActionMenu ···]  [Importer]  [Rapprocher]    │
└──────────────────────────────────────────────┘
```

**Couleur de la bande gauche** : le champ `color` du compte (personnalisable à la création,
palettes prédéfinies : bleu, vert, violet, amber, rose, slate). Si null → `var(--primary)`.

**Icône selon le type de compte** :
- `checking` → `Building2`
- `savings` → `PiggyBank`
- `petty_cash` → `Banknote`
- `mobile_money` → `Smartphone`
- `term_deposit` → `Lock`

**ActionMenu** (3 points) contient :
- Modifier
- Définir comme compte par défaut (si pas déjà défaut)
- Importer un relevé (→ redirect `/bank/import?accountId=...`)
- Voir les transactions (→ redirect `/bank/transactions?accountId=...`)
- Désactiver / Archiver (danger, confirmation modale)

**Badge "Défaut"** : si `isDefault = true`, une petite étoile ★ ou un badge "Défaut" en bleu
apparaît dans le coin supérieur droit de la card.

### 3.4 Empty state

Quand aucun compte n'existe (`RichEmptyState`) :
- Icône : `Building2`
- Titre : "Aucun compte bancaire"
- Description : "Connectez vos comptes pour importer vos relevés et rapprocher vos transactions automatiquement."
- Features chips : "Import CSV / OFX / MT940", "Rapprochement automatique", "6 banques camerounaises"
- CTA principal : "+ Ajouter un compte"

### 3.5 Tiroir de création / modification d'un compte

Drawer latéral droit (largeur 480px), fermeture par croix ou clic en dehors.

**Sections du formulaire :**

```
INFORMATIONS GÉNÉRALES
─────────────────────
Nom du compte *         [input text]          ex: "Compte courant Afriland"
Banque *                [input text]          ex: "Afriland First Bank"
Type de compte *        [select]              Compte courant / Épargne / Caisse / Mobile Money / Dépôt à terme
Devise *                [select, défaut XAF]

COORDONNÉES BANCAIRES
─────────────────────
Numéro de compte        [input text]
Agence / Succursale     [input text]
IBAN                    [input text, formaté]
SWIFT / BIC             [input text, majuscules auto]

PARAMÈTRES
──────────
Solde d'ouverture *     [input number, min 0]   Solde au moment de la création
Compte comptable        [input text]             ex: "512100" (SYSCOHADA classe 5)
Couleur d'identification [palette 8 couleurs prédéfinies, sélection par clic]
Compte par défaut       [toggle switch]
Alertes solde minimum   [input number optionnel]
Notes                   [textarea optionnel]
```

Validation : nom + banque + type + devise + solde requis.
En mode édition, le champ "Solde d'ouverture" est en lecture seule avec un tooltip explicatif.

---

## 4. Page `/bank/import` — Import de relevé

### Référence UX

Inspiré de **Wave** (wizard step-by-step visuel), **Xero** (auto-détection de format),
**Pennylane** (prévisualisation tabulaire avant confirmation). Meilleure approche :
wizard 3 étapes avec barre de progression, jamais d'import direct sans confirmation.

### 4.1 Structure générale

```
┌─ PageHeader ─────────────────────────────────────────────────────┐
│  Titre: "Importer un relevé bancaire"                            │
│  Sous-titre: "Formats supportés : CSV, OFX, MT940"              │
└──────────────────────────────────────────────────────────────────┘

┌─ Wizard (card principale) ───────────────────────────────────────┐
│  ┌─ Barre de progression ─────────────────────────────────────┐  │
│  │  [1. Sélection] ──── [2. Prévisualisation] ──── [3. Confirmation] │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  [Contenu de l'étape courante]                                    │
│                                                                   │
│  [← Retour]                          [Continuer →]               │
└──────────────────────────────────────────────────────────────────┘

┌─ Historique des imports ──────────────────────────────────────────┐
│  Titre: "Imports récents"                                         │
│  Tableau des 20 derniers imports                                  │
└──────────────────────────────────────────────────────────────────┘
```

### 4.2 Étape 1 — Sélection

**Sélecteur de compte :**
Dropdown avec les comptes actifs (nom + banque + solde actuel). Si `?accountId=` est présent
dans l'URL, le compte est pré-sélectionné.

**Zone de dépôt de fichier :**
```
┌───────────────────────────────────────────────────────┐
│                                                       │
│   [Icône Upload 40px, text-3]                         │
│   Glissez votre relevé ici                            │
│   ou cliquez pour sélectionner                        │
│                                                       │
│   CSV · OFX · MT940 · 5 Mo max                        │
│                                                       │
└───────────────────────────────────────────────────────┘
```
Style : bordure dashed 2px `var(--border)`, fond `var(--surface-2)`, radius `var(--radius-lg)`.
Au survol / drag-over : bordure `var(--primary)`, fond légèrement bleuté.
Quand un fichier est sélectionné : affiche le nom du fichier, taille, icône de suppression.

**Encodage (optionnel, avancé) :**
Un lien "Options avancées" déroule un select encodage (UTF-8, ISO-8859-1, Windows-1252).
Par défaut caché car l'API auto-détecte.

**Clic sur "Continuer" :**
Appelle `POST /bank/import/detect` → affiche un indicateur de chargement (spinner sur le bouton)
→ si succès, passe à l'étape 2 avec les données de détection.

**Résultat de détection affiché sous la zone :**
Badge vert "Format détecté : CSV (Afriland First Bank)" ou orange "Format détecté : CSV générique"
si aucun profil de banque ne correspond.

### 4.3 Étape 2 — Prévisualisation

**Résumé de la détection :**
```
┌─ card info ──────────────────────────────────────────────────────┐
│  Fichier: releve-mars-2026.csv (42 Ko)                           │
│  Format: CSV · Encodage: UTF-8                                   │
│  Banque détectée: Afriland First Bank  [badge vert]              │
│  Période: 01/03/2026 → 31/03/2026                               │
│  Transactions détectées: 87                                      │
└──────────────────────────────────────────────────────────────────┘
```

**Tableau de prévisualisation (10 premières lignes) :**
Colonnes : Date | Libellé | Débit | Crédit | Solde

Style tableau identique au reste de l'app (`.data-table`) :
- Débits en rouge `#dc2626` avec préfixe `−`
- Crédits en vert `#16a34a` avec préfixe `+`
- Montants en monospace
- Ligne d'en-tête fond `var(--surface-2)`, uppercase 11.5px

Bandeau d'avertissement si des lignes sont ignorées (hors période, doublons détectés) :
```
⚠  8 transactions déjà importées seront ignorées (hash identique)
```

**Message si format non reconnu :**
Encadré orange avec icône `AlertTriangle` :
"Le format n'a pas été reconnu automatiquement. Vérifiez que votre fichier correspond
au format attendu ou contactez le support."
Lien "Configurer le profil manuellement" (fonctionnalité future).

### 4.4 Étape 3 — Confirmation et traitement

**Récapitulatif avant import :**
```
┌─ card résumé ────────────────────────────────────────────────────┐
│  Compte destination : Compte courant Afriland                    │
│  Transactions à importer : 79                                    │
│  Doublons ignorés : 8                                            │
│  Période : 01/03/2026 → 31/03/2026                              │
└──────────────────────────────────────────────────────────────────┘
```

Bouton "Confirmer l'import" (primary, pleine largeur).

**Après confirmation (`POST /bank/import/confirm`) :**
L'import est traité en asynchrone (BullMQ). On appelle `GET /bank/import/{id}/status`
en polling (toutes les 2 secondes) jusqu'à `completed` ou `failed`.

Indicateur de progression :
```
┌─ card progression ───────────────────────────────────────────────┐
│  [Spinner animé]  Traitement en cours...                         │
│  ████████████░░░░  45%                                           │
│  67 / 79 transactions importées                                  │
└──────────────────────────────────────────────────────────────────┘
```

**Succès :**
Encadré vert avec icône `CheckCircle` :
"79 transactions importées avec succès."
Boutons : "Voir les transactions" → `/bank/transactions` | "Rapprocher maintenant" → `/bank/reconciliations`

**Échec :**
Encadré rouge avec message d'erreur de l'API.
Bouton "Annuler / Rollback" → `DELETE /bank/import/{id}` avec confirmation modale.

### 4.5 Historique des imports

Tableau sous le wizard, titre "Imports récents".

Colonnes : Date | Compte | Fichier | Format | Période | Nb transactions | Statut | Actions

Actions par ligne :
- `completed` → "Voir les transactions" (lien filtré)
- `failed` → "Détails de l'erreur" (tooltip ou modal)
- Tout statut → "Supprimer / Annuler" (si annulable)

---

## 5. Page `/bank/transactions` — Transactions

### Référence UX

Inspiré de **Pennylane** (colonne statut rapprochement très visible, suggestions inline),
**Xero** (filtres puissants, masse d'actions), **QuickBooks** (reconcile checkbox pattern).
Meilleure approche : liste dense avec status bien visible, actions rapides inline pour
le rapprochement, sans obliger l'utilisateur à ouvrir une modale pour chaque transaction.

### 5.1 Structure générale

```
┌─ PageHeader ─────────────────────────────────────────────────────┐
│  Titre: "Transactions bancaires"                                 │
│  Actions: [+ Saisie manuelle]                                    │
└──────────────────────────────────────────────────────────────────┘

┌─ Barre de filtres ───────────────────────────────────────────────┐
│  [Compte ▼]  [Période ▼]  [Recherche...]  [Type ▼]  [↓ Filtres] │
└──────────────────────────────────────────────────────────────────┘

┌─ Onglets de statut ──────────────────────────────────────────────┐
│  [Toutes (142)]  [En attente (38)]  [Rapprochées (97)]          │
│  [Non identifiées (4)]  [Ignorées (3)]                           │
└──────────────────────────────────────────────────────────────────┘

┌─ Actions de masse (visible si sélection) ────────────────────────┐
│  3 sélectionnées  [Rapprocher en masse]  [Ignorer]  [Annuler]   │
└──────────────────────────────────────────────────────────────────┘

┌─ Liste des transactions ─────────────────────────────────────────┐
│  [Ligne transaction 1]                                            │
│  [Ligne transaction 2]                                            │
│  ...                                                              │
└──────────────────────────────────────────────────────────────────┘

┌─ Pagination ─────────────────────────────────────────────────────┐
└──────────────────────────────────────────────────────────────────┘
```

### 5.2 Barre de filtres

**Filtre compte :** Dropdown avec tous les comptes actifs + option "Tous les comptes".
Si `?accountId=` dans l'URL, pré-sélectionné.

**Filtre période :** Dropdown avec raccourcis :
- Ce mois-ci
- Mois dernier
- Ce trimestre
- Cette année
- Période personnalisée (ouvre deux date pickers inline)

**Filtre type :** Tous | Débit | Crédit

**Recherche :** Filtre sur le libellé de la transaction (debounce 300ms).

**Filtres avancés (collapse) :**
- Montant min / max
- Importé via (sélecteur d'import)
- Entité liée (facture, paiement fournisseur, dépense)

### 5.3 Onglets de statut

Pastilles rondes style de l'app existant (mêmes que les factures) :
- **Toutes** : total général
- **En attente** : `pending` → badge amber
- **Rapprochées** : `reconciled` → badge vert
- **Non identifiées** : `unmatched` → badge rouge
- **Ignorées** : `ignored` → badge gris

### 5.4 Ligne de transaction

Chaque ligne est une rangée du `.data-table` avec les colonnes :

```
□ | Date | Libellé | Compte | Débit | Crédit | Rapprochement | Actions
```

**Colonne Date :** JJ/MM/AAAA en text-2, 13px.

**Colonne Libellé :**
- Texte principal : libellé brut de la transaction (14px, text-1, semi-bold)
- Sous-texte : référence bancaire si disponible (12px, text-3, mono)

**Colonne Compte :**
- Pastille colorée + nom court du compte

**Colonnes Débit / Crédit :**
- Montants en monospace 14px
- Débit : rouge `#dc2626`, préfixe `−`
- Crédit : vert `#16a34a`, préfixe `+`
- L'un des deux est toujours vide selon le type

**Colonne Rapprochement :**
Selon le statut de la transaction :

- `pending` → Badge amber "En attente" + bouton inline [Rapprocher]
- `reconciled` → Badge vert + lien vers l'entité liée (numéro de facture, paiement, etc.)
- `unmatched` → Badge rouge "Non identifié" + bouton inline [Affecter]
- `ignored` → Badge gris "Ignorée" + lien [Réactiver]

**Expandable row (clic sur la ligne) :**
Quand l'utilisateur clique sur une ligne `pending` ou `unmatched`, la ligne s'expand
pour afficher les suggestions de rapprochement :

```
┌─ Suggestions de rapprochement ────────────────────────────────────┐
│  Correspondances suggérées par le système :                        │
│                                                                    │
│  ○ [95%] Facture FAC-2026-001 — Client ABC — 150 000 XAF — 05/03 │
│  ○ [82%] Paiement PAY-001 — Fournisseur XYZ — 148 500 XAF        │
│  ○ Saisir manuellement l'entité liée  [input autocomplete]        │
│                                       [Valider]  [Ignorer]        │
└────────────────────────────────────────────────────────────────────┘
```

Le score en % provient de l'algorithme de scoring de l'API (montant + date + libellé + référence).
Score ≥ 90% → vert, 70-89% → amber, < 70% → rouge.
L'input "Saisir manuellement" est un autocomplete sur les factures, paiements et dépenses.

**Actions par ligne (menu 3 points) :**
- Rapprocher manuellement
- Voir les détails complets
- Ignorer cette transaction
- Dé-rapprocher (si `reconciled`) avec confirmation

### 5.5 Tiroir de saisie manuelle

Drawer 480px pour créer une transaction manuelle (`POST /bank/transactions`).

```
TRANSACTION MANUELLE
────────────────────
Compte *          [select, comptes actifs]
Date *            [date picker]
Libellé *         [input text]
Type *            [radio: Débit | Crédit]
Montant *         [input number, min 0.01]
Référence         [input text optionnel]
Notes             [textarea optionnel]
```

---

## 6. Page `/bank/reconciliations` — Rapprochements

### Référence UX

Inspiré de **Xero** (workflow de rapprochement en 2 colonnes côte à côte, barre de balance),
**Pennylane** (session de rapprochement avec étapes guidées),
**QuickBooks** (récapitulatif de balance en bas de page avant validation).
Meilleure approche : la page liste les sessions, chaque session s'ouvre dans une vue dédiée
avec interface split-screen pour matcher les transactions.

### 6.1 Vue liste des sessions

```
┌─ PageHeader ─────────────────────────────────────────────────────┐
│  Titre: "Rapprochements bancaires"                               │
│  Actions: [+ Nouvelle session]                                   │
└──────────────────────────────────────────────────────────────────┘

┌─ Filtres ────────────────────────────────────────────────────────┐
│  [Compte ▼]  [Statut ▼]  [Année ▼]                              │
└──────────────────────────────────────────────────────────────────┘

┌─ Tableau des sessions ───────────────────────────────────────────┐
│  Compte | Période | Solde relevé | Solde système | Écart | Statut | Actions │
└──────────────────────────────────────────────────────────────────┘
```

**Colonne Écart :**
- Écart = 0 → texte vert "0 XAF" ✓
- Écart ≠ 0 → texte rouge avec montant

**Statuts de session :**
- `open` → badge bleu "En cours" + bouton "Continuer"
- `completed` → badge vert "Terminé" + bouton "Rapport"
- `cancelled` → badge gris "Annulé"

### 6.2 Modale de création de session

Modale centrée (pas drawer) car courte, width 480px.

```
Compte *              [select comptes actifs]
Période du relevé *   [date picker from] → [date picker to]
Solde d'ouverture *   [input number]   ← solde début de période (du relevé papier)
Solde de clôture *    [input number]   ← solde fin de période (du relevé papier)
```

Validation : les deux dates et les deux soldes sont requis.
Après création → redirect vers la vue de travail de la session.

### 6.3 Vue de travail d'une session (interface de rapprochement)

C'est la page la plus complexe du module. Elle s'ouvre sur `/bank/reconciliations/{id}`.

```
┌─ Header session ─────────────────────────────────────────────────┐
│  ← Retour   Compte courant Afriland | Mars 2026                  │
│  [badge statut]    [Auto-matcher]    [Terminer le rapprochement] │
└──────────────────────────────────────────────────────────────────┘

┌─ Barre de balance ───────────────────────────────────────────────┐
│  Solde relevé: 2 450 000 XAF  │  Solde système: 2 380 000 XAF  │
│  Écart: -70 000 XAF  [barre rouge si ≠ 0, verte si = 0]        │
└──────────────────────────────────────────────────────────────────┘

┌─ Split screen ──────────────────────────────────────────┐
│  TRANSACTIONS BANCAIRES      │  ÉCRITURES SYSTÈME        │
│  (non rapprochées)           │  (paiements, dépenses)    │
│  ──────────────────          │  ───────────────────────  │
│  ☐ 05/03 Virement ABC       │  ☐ FAC-001 Client ABC     │
│     150 000 XAF crédit      │     150 000 XAF            │
│                              │                            │
│  ☐ 08/03 Frais bancaires    │  ☐ PAY-045 Fournisseur X  │
│     2 500 XAF débit         │     2 500 XAF              │
└──────────────────────────────┴────────────────────────────┘

┌─ Barre d'action contextuelle (visible si sélection) ─────────────┐
│  1 transaction + 1 écriture sélectionnées — 150 000 = 150 000   │
│                                           [Rapprocher ce couple] │
└──────────────────────────────────────────────────────────────────┘
```

**Côté gauche — Transactions bancaires :**
Toutes les transactions `pending` du compte pour la période.
Chaque item : checkbox | Date | Libellé | Montant (débit rouge / crédit vert).

**Côté droit — Écritures système :**
Paiements clients et fournisseurs, dépenses non encore rapprochés, dans la même période.
Chaque item : checkbox | Date | Référence | Entité | Montant.

**Sélection et matching :**
- L'utilisateur coche une transaction (gauche) + une ou plusieurs écritures (droite)
- La barre du bas montre l'égalité ou l'écart entre les montants
- Si égalité → bouton "Rapprocher ce couple" actif → appelle `POST /bank/transactions/{id}/reconcile`
- Si non égalité → bouton grisé avec message "Montants différents (+3 500 XAF)"

**Auto-match :**
Bouton "Auto-matcher" dans le header → appelle `POST /bank/reconciliations/{id}/auto-match`
(sans paramètre : le serveur décide seul ce qu'il applique).

Le serveur n'applique **que** les correspondances ≥ 90 %. Les 70–89 % sont renvoyées
comme suggestions et ne sont jamais écrites automatiquement — à 70 points, on a
typiquement « bon montant + date à ±2 j + vague écho de libellé », ce qui relève du
tirage au sort dès qu'il y a plusieurs paiements du même montant dans la semaine.

La réponse distingue trois issues, toutes affichées dans la modale :
| Champ     | Sens |
|-----------|------|
| `applied` | ≥ 90 % réellement rapprochées |
| `medium`  | 70–89 % proposées, **à confirmer à la main** |
| `skipped` | ≥ 90 % écartées : contrepartie déjà rapprochée d'un autre mouvement |

⚠️ Il n'y a plus de case « haute confiance uniquement » : elle laissait croire qu'on
pouvait faire appliquer les 70–89 %, ce que le serveur refuse désormais.

**Terminer le rapprochement :**
Bouton "Terminer" → vérifie que l'écart = 0 avant d'autoriser.
Si écart ≠ 0 → warning "Il reste un écart de 70 000 XAF. Voulez-vous quand même terminer ?"
Appelle `POST /bank/reconciliations/{id}/complete` → session passe en `completed`
→ redirect vers la liste avec toast de succès.

### 6.4 Rapport de rapprochement

Page `/bank/reconciliations/{id}/report` (ou drawer large) affichant :
- Résumé : compte, période, soldes, écart final
- Liste de toutes les paires rapprochées avec date de rapprochement et utilisateur
- Export PDF (bouton en haut à droite)

---

## 7. Page `/bank/matching-rules` — Règles de matching

### Référence UX

Inspiré de **Xero** (règles de codage de banque), **Pennylane** (patterns appris automatiquement).
Meilleure approche : tableau simple avec toggle actif/inactif et indicateur de fiabilité,
permettant à l'utilisateur de comprendre et contrôler ce que le système apprend.

### 7.1 Structure générale

```
┌─ PageHeader ─────────────────────────────────────────────────────┐
│  Titre: "Règles de matching automatique"                         │
│  Sous-titre: "Appris au fil des rapprochements manuels"          │
│  Actions: [+ Créer une règle]                                    │
└──────────────────────────────────────────────────────────────────┘

┌─ Filtres ────────────────────────────────────────────────────────┐
│  [Compte ▼]  [Type entité ▼]  [Rechercher un pattern...]        │
└──────────────────────────────────────────────────────────────────┘

┌─ Tableau des règles ─────────────────────────────────────────────┐
│  Pattern libellé | Type entité | Entité liée | Confiance | Auto | Utilisations | Actions │
└──────────────────────────────────────────────────────────────────┘
```

### 7.2 Tableau des règles

**Colonne Pattern libellé :**
Le pattern de matching (ex: "VIREMENT AFRILAND*", "FRAIS TENUE DE COMPTE").
Affiché en monospace avec fond légèrement coloré (style code).

**Colonne Type entité :**
Badge coloré : Facture | Paiement | Dépense | Fournisseur

**Colonne Entité liée :**
Si la règle est liée à une entité spécifique (ex: Client ABC), affiche le nom.
Sinon "Type général".

**Colonne Confiance :**
Barre de progression (0→100%) + pourcentage. Colorée :
- ≥ 90% → verte
- 70–89% → amber
- < 70% → rouge

**Colonne Auto :**
Toggle switch : si activé, la règle est appliquée automatiquement lors des imports.
Appelle `PUT /bank/matching-rules/{id}` avec `{ autoApply: true/false }`.

**Colonne Utilisations :**
Nombre de fois que la règle a été appliquée (confirmée par l'utilisateur).

**Actions par ligne (3 points) :**
- Modifier
- Tester sur les transactions en cours
- Désactiver / Supprimer (danger)

### 7.3 Tiroir de création / modification d'une règle

Drawer 480px.

```
RÈGLE DE MATCHING
─────────────────
Compte                [select, "Tous les comptes" par défaut]
Pattern du libellé *  [input text]   ex: "VIREMENT CLIENT*"
                      [aide: * = joker, ? = un caractère]
Montant min           [input number optionnel]
Montant max           [input number optionnel]
Type d'entité *       [select: Facture | Paiement | Dépense | Fournisseur]
Entité spécifique     [autocomplete optionnel]
Application auto      [toggle switch]
Notes                 [textarea optionnel]
```

**Zone de test en bas du drawer :**
Un bouton "Tester ce pattern" affiche combien de transactions existantes correspondent
(appel filtré côté client sur les transactions déjà chargées, pas d'appel API).

### 7.4 Empty state

- Icône : `Zap`
- Titre : "Aucune règle de matching"
- Description : "Les règles s'apprennent automatiquement au fil de vos rapprochements manuels.
  Vous pouvez aussi en créer manuellement pour les libellés récurrents."
- CTA : "+ Créer une règle"

---

## 8. Composants partagés

Ces composants seront créés dans `src/features/bank/components/` et réutilisés sur plusieurs pages.

### `BankAccountBadge`

Pastille couleur + nom court du compte. Props : `accountId`, `name`, `color`, `size?: 'sm'|'md'`.
Utilisé dans les listes de transactions, sessions de rapprochement.

### `ReconciliationStatusBadge`

Badge selon le statut de rapprochement d'une transaction.
Props : `status: 'pending'|'reconciled'|'unmatched'|'ignored'`.
Réutilisé dans `/bank/transactions` et l'interface de rapprochement.

### `TransactionAmount`

Affiche un montant débit/crédit coloré. Props : `amount`, `type: 'debit'|'credit'`, `currency`.
Toujours en monospace, débit rouge, crédit vert.

### `ImportStatusBadge`

Badge pour le statut d'un import (`pending`, `processing`, `completed`, `failed`, `cancelled`).

### `ConfidenceBar`

Barre de progression colorée pour le score de confiance (0–100%).
Props : `value: number` (0–100).

### `BankSummaryKpiCards`

Les 4 KPI cards du haut de `/bank/accounts`.
Données via `useQuery(['bank-summary'], () => bankApi.getSummary())`.
Réutilisable sur un éventuel dashboard banque.

---

## 9. Structure des fichiers à créer

```
src/
├── features/bank/
│   ├── README.md                        ← ce fichier
│   ├── api.ts                           ← tous les appels API
│   ├── types.ts                         ← interfaces TypeScript
│   ├── hooks.ts                         ← React Query hooks
│   └── components/
│       ├── BankAccountCard.tsx
│       ├── BankAccountDrawer.tsx        ← création + édition
│       ├── BankAccountBadge.tsx
│       ├── BankSummaryKpiCards.tsx
│       ├── TransactionRow.tsx           ← ligne expandable avec suggestions
│       ├── TransactionDrawer.tsx        ← saisie manuelle
│       ├── ReconciliationStatusBadge.tsx
│       ├── TransactionAmount.tsx
│       ├── ImportStatusBadge.tsx
│       ├── ImportWizard.tsx             ← wizard 3 étapes
│       ├── ImportHistoryTable.tsx
│       ├── ReconciliationSessionRow.tsx
│       ├── ReconciliationWorkspace.tsx  ← interface split-screen
│       ├── AutoMatchModal.tsx
│       ├── ConfidenceBar.tsx
│       ├── MatchingRuleRow.tsx
│       └── MatchingRuleDrawer.tsx
│
└── app/(dashboard)/bank/
    ├── layout.tsx                       ← layout commun (breadcrumb, guard permission)
    ├── page.tsx                         ← redirect vers /bank/accounts
    ├── accounts/
    │   └── page.tsx
    ├── import/
    │   └── page.tsx
    ├── transactions/
    │   └── page.tsx
    ├── reconciliations/
    │   ├── page.tsx                     ← liste des sessions
    │   └── [id]/
    │       └── page.tsx                 ← interface de travail
    └── matching-rules/
        └── page.tsx
```

---

## Ordre d'implémentation recommandé

1. **`api.ts` + `types.ts` + `hooks.ts`** — fondation sans laquelle rien ne marche
2. **`/bank/accounts`** — page la plus simple, valide l'architecture
3. **`/bank/transactions`** — liste filtrée, patterns réutilisables
4. **`/bank/import`** — wizard 3 étapes, la plus délicate (polling async)
5. **`/bank/reconciliations`** — liste puis interface split-screen
6. **`/bank/matching-rules`** — la plus simple, clôture le module

---

*Document rédigé pour Bridge Technologies Solutions — InvoiceHub v2.0*
*Charte : Navy `#0c2340` | Primaire `#2D7DD2` | Fond `#f0f4f9` | Police Sora + DM Sans*
