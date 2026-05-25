# Module Comptabilité — Design & Architecture

> **Statut** : Phase de conception — à lire avant tout codage  
> **Conformité** : SYSCOHADA révisé (OHADA 2017) — Plan comptable OHADA, journaux obligatoires, lettrage  
> **Charte graphique** : Sora (display) · DM Sans (body) · JetBrains Mono (mono) · Primaire `#2D7DD2` · Sidebar `#0c2340` · Fond `#f0f4f9`

---

## Philosophie de design

Le module comptabilité est le cœur financier de l'application. Il doit inspirer **confiance, précision et lisibilité**. Les références : Sage Comptabilité, QuickBooks, FreshBooks côté densité de l'information ; Linear et Notion côté fluidité de navigation.

### Principes retenus

| Principe | Application concrète |
|----------|---------------------|
| **Financial Dashboard** | KPI cards à border-left coloré, valeurs en JetBrains Mono |
| **Data-Dense Tables** | Ligne de 36px, padding compact 8–12px, overflow-x-auto |
| **Profit/Loss Colors** | Crédit : `#16a34a` · Débit : `#dc2626` · Neutre : `var(--text-2)` |
| **Trust Blue** | Accents primaires `#2D7DD2` — cohérence avec le reste de l'app |
| **Waterfall Charts** | Recharts BarChart empilé pour évolutions cumulées (grand livre) |
| **Consistency** | Mêmes patterns PageHeader / KpiCard / Pagination / ActionMenu partout |

### Ce qu'on n'utilise PAS

- Émojis comme icônes (Lucide uniquement)
- `Inter` / `Roboto` / `Arial` (app utilise Sora + DM Sans)
- Dégradés violets sur fond blanc (style "AI générique")
- Modales centrées pour les formulaires complexes → drawers latéraux

---

## Structure des routes

```
/accounting                     → Dashboard comptabilité (KPIs financiers)
/accounting/chart               → Plan comptable
/accounting/periods             → Périodes fiscales
/accounting/journals            → Journaux comptables
/accounting/entries             → Écritures comptables
/accounting/lettering           → Lettrage des comptes
/accounting/reports             → Balance des comptes & Grand livre
/accounting/reports/sage        → Export Sage/CSV
/accounting/tax-declarations    → Déclarations TVA
```

---

## Architecture des fichiers

```
src/
├── app/(dashboard)/accounting/
│   ├── layout.tsx                    (si sous-layout nécessaire)
│   ├── page.tsx                      → Dashboard
│   ├── loading.tsx
│   ├── error.tsx
│   ├── chart/
│   │   └── page.tsx                  → Plan comptable
│   ├── periods/
│   │   └── page.tsx                  → Périodes fiscales
│   ├── journals/
│   │   └── page.tsx                  → Journaux
│   ├── entries/
│   │   ├── page.tsx                  → Liste des écritures
│   │   └── new/page.tsx              → Saisie d'écriture
│   ├── lettering/
│   │   └── page.tsx                  → Lettrage
│   ├── reports/
│   │   ├── page.tsx                  → Balance & Grand livre
│   │   └── sage/page.tsx             → Export Sage
│   └── tax-declarations/
│       └── page.tsx                  → Déclarations TVA
│
└── features/accounting/
    ├── types.ts                      → AccountEntry, Account, Period, Journal…
    ├── api.ts                        → Appels REST /accounting/*
    ├── hooks.ts                      → useAccounts, useEntries, useBalance…
    └── components/
        ├── AccountPicker.tsx         → Sélecteur de compte (combobox)
        ├── EntryForm.tsx             → Formulaire d'écriture comptable
        ├── LetteringPanel.tsx        → Interface de lettrage
        ├── BalanceTable.tsx          → Tableau balance des comptes
        ├── GeneralLedger.tsx         → Grand livre par compte
        └── TaxDeclarationCard.tsx    → Card TVA collectée/déductible
```

---

## Page 1 — Dashboard Comptabilité (`/accounting`)

### Rôle
Point d'entrée du module. Vue d'ensemble financière : position nette, TVA à reverser, état des périodes. Redirige vers les outils spécialisés.

### Layout
```
┌─────────────────────────────────────────────────────────────────┐
│ PageHeader : "Comptabilité"  [BookCheck]  [+ Nouvelle écriture] │
├─────────────┬──────────────┬─────────────┬──────────────────────┤
│ KPI: Chiffre│ KPI: Charges │ KPI: Résult.│ KPI: TVA à reverser  │
│ d'affaires  │ du mois      │ net mois    │ période en cours     │
│ (mois)      │              │ vert/rouge  │ alerte orange        │
├─────────────┴──────────────┴─────────────┴──────────────────────┤
│ Graphique Recharts — Évolution CA vs Charges (6 derniers mois)  │
│ BarChart groupé — barres bleu primaire + rouge charges          │
├──────────────────────────────┬──────────────────────────────────┤
│ Dernières écritures (5)      │ État des périodes fiscales        │
│ table compacte               │ liste : ouvertes / clôturées      │
│ [Voir toutes les écritures]  │ badge statut coloré              │
└──────────────────────────────┴──────────────────────────────────┘
```

### Composants
- `KpiCard` (réutilisé de purchase-orders) — border-left coloré, valeur en `var(--font-mono)`
- `BarChart` Recharts — couleurs `#2D7DD2` (CA) et `#dc2626` (charges), tooltip formaté XAF
- Section "Dernières écritures" : même style que les listes compactes des autres modules
- Section "Périodes" : badges `ouvert` (vert) / `clôturée` (gris) / `en_cours` (bleu)

### KPIs
| KPI | Couleur border | Icône |
|-----|----------------|-------|
| CA mois (Cr. compte 7x) | `#16a34a` | `TrendingUp` |
| Charges mois (Db. compte 6x) | `#dc2626` | `TrendingDown` |
| Résultat net | vert si > 0, rouge si < 0 | `BarChart3` |
| TVA à reverser | `#d97706` | `Receipt` |

---

## Page 2 — Plan Comptable (`/accounting/chart`)

### Rôle
Référentiel de tous les comptes OHADA utilisés par BTS. Permet de créer, modifier, activer/désactiver les comptes. Organisé par classe (1 à 8 SYSCOHADA).

### Layout
```
┌────────────────────────────────────────────────────────────────┐
│ PageHeader: "Plan comptable"  [List]  [+ Ajouter un compte]    │
├───────────────────┬────────────────────────────────────────────┤
│ Filtre par classe │ Barre de recherche (numéro ou intitulé)     │
│ [1] [2] [3]...[8]│ [Rechercher…]                              │
└───────────────────┴────────────────────────────────────────────┤
│ TABLE ARBORESCENTE                                              │
│ Classe 1 — Comptes de ressources durables          [expandable]│
│  └ 10 Capital et réserves                          [expandable]│
│     └ 101 Capital social                           ████████████│
│        │ Intitulé      │ Type  │ Sens  │ Actif │ Actions      │
│        │ Capital social│ Passif│ Crédit│  ✓    │ [⋮]          │
└────────────────────────────────────────────────────────────────┘
```

### Composants
- **Onglets de classes** : boutons pill 1–8 + "Tous", highlight `var(--primary)` sur sélection
- **Table arborescente** : indentation (16px par niveau), expand/collapse, icône `ChevronRight` / `ChevronDown`
- **AccountDrawer** (drawer latéral 480px) : numéro, intitulé, type (Actif/Passif/Produit/Charge), sens normal, solde d'ouverture, toggle actif
- **Badge type** : Actif `#2D7DD2`, Passif `#7c3aed`, Produit `#16a34a`, Charge `#dc2626`
- **ActionMenu** : Modifier · Activer/Désactiver · Voir le grand livre

### Données affichées par ligne
`numéro` · `intitulé` · `type` · `sens normal` (Débit/Crédit) · `solde_ouverture` · `actif` (toggle) · `[⋮ actions]`

### Notes SYSCOHADA
- Numérotation OHADA : classes 1–9 (classe 9 = analytique, optionnelle)
- Comptes racines non saisissables (bold, pas d'écritures directes)
- Comptes feuille saisissables (regular)
- Validation : un compte `actif: false` ne peut être utilisé dans une nouvelle écriture

---

## Page 3 — Périodes Fiscales (`/accounting/periods`)

### Rôle
Gestion des exercices et des périodes comptables. Contrôle l'ouverture/clôture des périodes pour éviter des écritures hors période. Critique pour la conformité SYSCOHADA.

### Layout
```
┌────────────────────────────────────────────────────────────────┐
│ PageHeader: "Périodes fiscales"  [Calendar]  [+ Nouvel exercice]│
├────────────────────────────────────────────────────────────────┤
│ Exercice 2026          [ouvert]    01/01/2026 → 31/12/2026      │
│ ├── Jan 2026  [clôturée]   ████████████  01/01 → 31/01         │
│ ├── Fév 2026  [clôturée]   ████████████  01/02 → 28/02         │
│ ├── Mar 2026  [en cours]   ████████████  01/03 → 31/03         │
│ └── Avr–Déc  [futures]                                          │
│ Exercice 2025          [clôturé]   …                            │
└────────────────────────────────────────────────────────────────┘
```

### Composants
- **Accordéon exercice** : expand/collapse, badge statut `ouvert` / `clôturé` / `archivé`
- **Barre de progression** : mois actuel visualisé (barre bleue pleine → mois clôturés, vide → futurs)
- **Actions par période** : [Clôturer] (uniquement si ouvert + après date fin) · [Rouvrir] (admin only)
- **PeriodDrawer** (480px) : dateDebut, dateFin, exercice parent, statut, confirmation de clôture avec alerte de verrouillage
- **Alerte** : banner jaune si la période courante se termine dans < 5 jours

### Statuts
| Statut | Couleur | Signification |
|--------|---------|---------------|
| `ouvert` | `#2D7DD2` | Saisies autorisées |
| `en_cours` | `#16a34a` | Période courante |
| `clôturée` | `#94a3b8` | Saisies verrouillées |
| `archivée` | `#64748b` | Exercice terminé |

### Notes SYSCOHADA
- Clôture d'une période = verrouillage de toutes les écritures datées dans cette période
- Réouverture réservée à l'admin avec traçabilité dans `audit_logs`
- L'exercice comptable commence obligatoirement au 01/01

---

## Page 4 — Journaux Comptables (`/accounting/journals`)

### Rôle
Liste et configuration des journaux de saisie SYSCOHADA : Achats (AC), Ventes (VE), Banque (BQ), Caisse (CA), À-nouveaux (AN), Opérations diverses (OD). Chaque écriture appartient à exactement un journal.

### Layout
```
┌────────────────────────────────────────────────────────────────┐
│ PageHeader: "Journaux"  [BookOpen]  [+ Créer un journal]       │
├────────────────────────────────────────────────────────────────┤
│ Grille 3 colonnes — cards journal                               │
│ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐            │
│ │ [icon] AC    │ │ [icon] VE    │ │ [icon] BQ    │            │
│ │ Achats       │ │ Ventes       │ │ Banque       │            │
│ │ 142 éc.      │ │ 387 éc.      │ │ 256 éc.      │            │
│ │ [actif]      │ │ [actif]      │ │ [actif]      │            │
│ │ [⋮]          │ │ [⋮]          │ │ [⋮]          │            │
│ └──────────────┘ └──────────────┘ └──────────────┘            │
└────────────────────────────────────────────────────────────────┘
```

### Composants
- **JournalCard** : card blanche, icône colorée (couleur par type), code journal en `var(--font-display)` bold, nom, compteur d'écritures, badge actif
- **JournalDrawer** (480px) : code (ex: AC), libellé, type (achat/vente/banque/caisse/od/an), compte par défaut contrepartie, toggle actif
- **Couleurs par type** :
  - Achats `#7c3aed` · Ventes `#16a34a` · Banque `#2D7DD2`
  - Caisse `#d97706` · OD `#0891b2` · À-nouveaux `#94a3b8`

### Notes SYSCOHADA
- Code journal OHADA : 2 caractères (AC, VE, BQ, CA, AN, OD…)
- Les journaux système (AC, VE) ne sont pas supprimables
- À-nouveaux (AN) : utilisé uniquement lors de l'ouverture d'exercice

---

## Page 5 — Écritures Comptables (`/accounting/entries`)

### Rôle
Coeur de la saisie comptable. Liste de toutes les écritures avec filtres puissants. Équilibre débit = crédit obligatoire. Visualisation des pièces (source : factures, dépenses, manuelles).

### Layout — Liste
```
┌────────────────────────────────────────────────────────────────┐
│ PageHeader: "Écritures"  [PenLine]  [+ Nouvelle écriture]      │
├─────────┬──────────┬──────────┬─────────────┬──────────────────┤
│ KPI     │ KPI      │ KPI      │ KPI          │                  │
│ Total Db│ Total Cr │ Équilibre│ Période      │                  │
│ (mois)  │ (mois)   │ ✓ ou ✗   │ en cours     │                  │
├─────────┴──────────┴──────────┴─────────────┴──────────────────┤
│ Filtres: [Journal ▾] [Période ▾] [Compte ▾] [Statut ▾] [🔍]   │
├────────┬──────────┬──────────┬─────────┬────────┬──────────────┤
│ Date   │ N° pièce │ Journal  │ Libellé │ Débit  │ Crédit       │
│        │          │          │         │ rouge  │ vert         │
├────────┼──────────┼──────────┼─────────┼────────┼──────────────┤
│ ligne compacte (36px) — alternance bg légère tous les 2 lignes │
│ …                                                               │
└────────────────────────────────────────────────────────────────┘
```

### Layout — Saisie (`/accounting/entries/new`)
```
┌────────────────────────────────────────────────────────────────┐
│ PageHeader: "Nouvelle écriture" ← retour liste                  │
├──────────────────────────┬─────────────────────────────────────┤
│ ENTÊTE                   │ TOTAL ÉQUILIBRE                      │
│ Journal [select]         │ Débit total :  ████████ XAF (rouge) │
│ Date    [date picker]    │ Crédit total : ████████ XAF (vert)  │
│ N° pièce [text]          │ Différence :   ████████ XAF         │
│ Libellé  [text]          │ [✓ Équilibré] ou [⚠ Déséquilibré]  │
│ Pièce jointe [upload]    │                                      │
├──────────────────────────┴─────────────────────────────────────┤
│ LIGNES D'ÉCRITURE                           [+ Ajouter une ligne]│
│ ┌────────────────────────────────────────────────────────────┐  │
│ │ N° Compte [picker] │ Libellé │ Débit    │ Crédit   │ [✕]  │  │
│ │ AccountPicker      │ text    │ number   │ number   │      │  │
│ └────────────────────────────────────────────────────────────┘  │
├────────────────────────────────────────────────────────────────┤
│                    [Annuler]   [Enregistrer l'écriture]         │
└────────────────────────────────────────────────────────────────┘
```

### Composants
- **EntryForm** : layout 2 panneaux (header gauche, totaux droite) + lignes d'écritures
- **AccountPicker** : combobox avec recherche par numéro ou intitulé, groupé par classe, affiche `101 · Capital social`
- **EquilibriumIndicator** : badge vert `Équilibré` si `Σ débit === Σ crédit`, rouge sinon — bloque la soumission
- **KpiCard** : Total débit / Total crédit en JetBrains Mono — couleurs rouge/vert
- **Filtres** : journal, période, compte (AccountPicker), source (manual/auto), statut (valide/annulé)
- **Table** : colonnes `date · n°pièce · journal · compte · libellé · débit · crédit · lettre · source · [⋮]`

### Colonnes — liste détaillée
| Colonne | Largeur | Rendu |
|---------|---------|-------|
| Date | 90px | `formatDate(date)` |
| N° pièce | 120px | `var(--font-mono)` bold |
| Journal | 60px | badge type journal (couleur) |
| Compte | 140px | `101 · Capital social` |
| Libellé | flex | texte tronqué |
| Débit | 110px | `#dc2626` bold, `formatXAF()` |
| Crédit | 110px | `#16a34a` bold, `formatXAF()` |
| Lettre | 50px | `A1` si lettré, `-` sinon |
| Source | 80px | badge : Manuel / Facture / Dépense |

### Notes SYSCOHADA
- Une écriture = N lignes de débit + N lignes de crédit, Σ débit = Σ crédit obligatoire
- Numéro de pièce auto-généré par journal et période
- Annulation = contre-écriture (pas de suppression)
- Écritures générées automatiquement lors de : émission facture, paiement, dépense approuvée

---

## Page 6 — Lettrage (`/accounting/lettering`)

### Rôle
Associer des lignes de débit et de crédit sur un même compte de tiers (client 4x, fournisseur 4x) pour marquer les règlements. Essentiel pour le suivi des créances/dettes ouvertes.

### Layout
```
┌────────────────────────────────────────────────────────────────┐
│ PageHeader: "Lettrage"  [Link2]                                 │
├──────────────────────────────────────────────────────┬─────────┤
│ Sélecteur de compte tiers                            │ Filtres │
│ AccountPicker — comptes 40x (fourn.) ou 41x (client) │ Période │
├──────────────────────────────────────────────────────┴─────────┤
│ LIGNES NON LETTRÉES                          [Lettrer sélection]│
│ ┌──────────────────────────────────────────────────────────┐    │
│ │ ☐ │ Date     │ Pièce      │ Libellé  │ Débit   │ Crédit │    │
│ │ ☐ │ 12/01/26 │ FAC-001    │ Facture… │         │ 50 000 │    │
│ │ ☐ │ 18/01/26 │ PAY-001    │ Paiement │ 50 000  │        │    │
│ └──────────────────────────────────────────────────────────┘    │
│ Solde sélection : 0 XAF  ✓ Lettrable                           │
├────────────────────────────────────────────────────────────────┤
│ LIGNES LETTRÉES (accordéon)                    [Délettrer]      │
│ Lettre A1 │ FAC-001 + PAY-001 │ 50 000 XAF │ 12/01/26 → 18/01 │
└────────────────────────────────────────────────────────────────┘
```

### Composants
- **AccountPicker** : filtré sur comptes 40x/41x uniquement
- **LetteringTable** : checkboxes multi-sélection, débit rouge / crédit vert
- **BalanceIndicator** : somme des lignes sélectionnées — vert si = 0, rouge sinon
- **Bouton "Lettrer"** : activé uniquement si solde sélection = 0
- **LetteredGroup** : accordéon groupé par lettre (A1, A2…), avec [Délettrer] par groupe

### UX
- Sélectionner une ligne de 50 000 crédit → l'app met en évidence les lignes de débit égales
- Lettrage partiel interdit (SYSCOHADA)
- Le délettrage est réversible mais tracé dans l'audit

---

## Page 7 — Balance & Grand Livre (`/accounting/reports`)

### Rôle
Les deux états de synthèse comptables les plus utilisés :
- **Balance des comptes** : solde débiteur / créditeur par compte sur une période
- **Grand livre** : détail de toutes les écritures d'un compte

### Layout — Balance
```
┌────────────────────────────────────────────────────────────────┐
│ PageHeader: "Balance & Grand livre"  [BarChart3]  [↓ Export]   │
├────────────────────────────────────────────────────────────────┤
│ Onglets : [Balance des comptes]  [Grand livre]                  │
├──────────────────────────────────────────────────────────────  │
│ Filtres : [Période ▾]  [Classe ▾]  [Afficher comptes nuls ☐]   │
├──────────┬──────────────────────┬──────────┬──────────┬────────┤
│ Compte   │ Intitulé             │ Mvt Débit│ Mvt Créd.│ Solde  │
├──────────┼──────────────────────┼──────────┼──────────┼────────┤
│ Totaux de classe (ligne bold bg gris clair)                     │
│ 101      │ Capital social       │    0     │  500 000 │ -500K  │
│ 401      │ Fournisseurs         │  120 000 │   80 000 │  40K   │
│ …        │                      │          │          │        │
├──────────┼──────────────────────┼──────────┼──────────┼────────┤
│ TOTAUX   │                      │ X XXX    │ X XXX    │        │
└──────────┴──────────────────────┴──────────┴──────────┴────────┘
```

### Layout — Grand livre
```
┌────────────────────────────────────────────────────────────────┐
│ [AccountPicker] — sélecteur compte                              │
├─────────────────────────────────────────────────────────────────┤
│ 401 — Fournisseurs  │ Solde ouverture: 0  │  Solde final: 40K  │
├────────┬────────────┬──────────┬──────────┬──────────┬─────────┤
│ Date   │ N° pièce   │ Journal  │ Libellé  │ Débit    │ Crédit  │
│ 05/01  │ AC-001     │ Achats   │ SABC…    │          │  25 000 │
│ 12/01  │ BQ-015     │ Banque   │ Paiement │  25 000  │         │
│ …                                                               │
├────────┴────────────┴──────────┴──────────┴──────────┴─────────┤
│ TOTAL PÉRIODE                              │  XXX XXX│ XXX XXX │
└────────────────────────────────────────────┴──────────┴─────────┘
```

### Composants
- **BalanceTable** : groupé par classe, lignes totaux en bold avec fond `var(--surface-2)`, colonnes Débit rouge / Crédit vert / Solde conditionnellement coloré
- **GeneralLedger** : table + solde progressif (running balance)
- **ExportButton** : dropdown [CSV · Excel · PDF] — déclenche `/accounting/reports/sage` pour Sage
- **BalanceChart** (optionnel) : Recharts Waterfall sur les 8 classes pour visualisation rapide

### UX
- Balance : double-cliquer sur un compte → ouvre le Grand livre de ce compte
- Grand livre : bouton "Retour à la balance" dans le fil d'Ariane
- Export Sage : page dédiée `/accounting/reports/sage` avec options de période et format

---

## Page 8 — Export Sage (`/accounting/reports/sage`)

### Rôle
Générer un fichier d'export compatible Sage Comptabilité (format `.txt` ou `.csv` propriétaire Sage) pour les cabinets comptables et pour l'audit. Aussi utilisé pour l'export vers d'autres logiciels comptables.

### Layout
```
┌────────────────────────────────────────────────────────────────┐
│ PageHeader: "Export Sage"  [Download]  ← Balance & Grand livre  │
├────────────────────────────────────────────────────────────────┤
│ CONFIGURATION DE L'EXPORT                                       │
│ ┌────────────────────────────────────────────────────────────┐  │
│ │ Période : [Début] → [Fin]                                  │  │
│ │ Journaux : ☑ Achats  ☑ Ventes  ☑ Banque  ☑ OD  ☑ AN      │  │
│ │ Format   : ◉ Sage 100  ○ CSV standard  ○ FEC (DGI France) │  │
│ │ Encodage : ◉ UTF-8  ○ Latin-1 (Sage ancien)               │  │
│ └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│ APERÇU (5 premières lignes)                                     │
│ ┌────────────────────────────────────────────────────────────┐  │
│ │ JNL;DATE;PIECE;COMPTE;LIBELLE;DEBIT;CREDIT                 │  │
│ │ AC;20260105;AC001;401SABC;Facture SABC;;;25000.00          │  │
│ └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│ Nombre d'écritures : 387      [Générer et télécharger]          │
└────────────────────────────────────────────────────────────────┘
```

### Composants
- **ExportConfigForm** : checkboxes journaux, date range, radio format
- **PreviewTable** : aperçu monospace (JetBrains Mono 12px) des 5 premières lignes
- **DownloadButton** : désactivé pendant génération, spinner, téléchargement blob

---

## Page 9 — Déclarations TVA (`/accounting/tax-declarations`)

### Rôle
Synthèse de la TVA collectée (sur ventes) et TVA déductible (sur achats) pour une période. Calcul automatique de la TVA nette à reverser ou à rembourser. Export pour déclaration DGI Cameroun.

### Layout
```
┌────────────────────────────────────────────────────────────────┐
│ PageHeader: "Déclarations TVA"  [FileCheck]  [+ Nouvelle déc.] │
├──────────────────────────────────────────────────────────────  │
│ Filtre période : [Exercice ▾]  [Mois ▾]                        │
├────────────────┬───────────────┬───────────────┬───────────────┤
│ TVA Collectée  │ TVA Déductible│ TVA Nette     │ Statut        │
│ 1 250 000 XAF  │   480 000 XAF │   770 000 XAF │ À reverser    │
│ vert           │ bleu          │ rouge/orange  │ badge         │
├────────────────┴───────────────┴───────────────┴───────────────┤
│ DÉTAIL TVA COLLECTÉE              │ DÉTAIL TVA DÉDUCTIBLE       │
│ Taux 19,25% | Base | Montant      │ Taux 19,25% | Base | Montant│
│ Factures ventes : 6 500 000       │ Factures achats : 2 492 228 │
│ Avoirs : (200 000)                │ Dépenses : 101 000          │
│                                    │                             │
├───────────────────────────────────┴─────────────────────────────┤
│ Historique des déclarations précédentes (table)                  │
│ Période │ TVA coll. │ TVA déd. │ Net │ Statut │ Déposé le │ [⋮]│
└─────────────────────────────────────────────────────────────────┘
```

### Composants
- **TaxDeclarationCard** : 4 KPI cards row — collectée vert / déductible bleu / nette rouge / statut
- **DetailPanel** (2 colonnes) : breakdown TVA collectée vs déductible par taux (19.25%, exonéré)
- **HistoryTable** : liste des déclarations passées, badge statut (brouillon / déposé / validé)
- **TaxDeclarationDrawer** (600px) : formulaire nouvelle déclaration, période, montants ajustables, notes, export DGI

### Statuts déclaration
| Statut | Couleur | Signification |
|--------|---------|---------------|
| `brouillon` | `#94a3b8` | En cours de saisie |
| `déposé` | `#2D7DD2` | Envoyé à la DGI |
| `validé` | `#16a34a` | Accepté par la DGI |
| `à_reverser` | `#d97706` | Paiement en attente |

### Notes SYSCOHADA / DGI Cameroun
- Taux TVA standard Cameroun : **19,25%** (19% TVA + 0,25% CAC)
- Déclaration mensuelle si CA > 50M XAF, trimestrielle sinon
- Les montants sont extraits automatiquement des comptes 4455x (TVA collectée) et 4452x (TVA déductible)

---

## Tokens CSS à ajouter dans `globals.css`

```css
/* ── Comptabilité — statuts ─────────────────────────────────── */
--s-acc-open:        #2D7DD2;   --s-acc-open-bg:    #eff6ff;
--s-acc-current:     #16a34a;   --s-acc-current-bg: #f0fdf4;
--s-acc-closed:      #94a3b8;   --s-acc-closed-bg:  #f1f5f9;
--s-acc-archived:    #64748b;   --s-acc-archived-bg:#f8fafc;

/* ── Comptabilité — débit / crédit ─────────────────────────── */
--acc-debit:         #dc2626;
--acc-credit:        #16a34a;
--acc-balanced:      #16a34a;
--acc-unbalanced:    #dc2626;
```

---

## Types TypeScript (`features/accounting/types.ts`)

```typescript
export type AccountType    = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense'
export type AccountClass   = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9
export type JournalType    = 'purchase' | 'sale' | 'bank' | 'cash' | 'od' | 'opening'
export type PeriodStatus   = 'open' | 'current' | 'closed' | 'archived'
export type EntrySource    = 'manual' | 'invoice' | 'payment' | 'expense' | 'purchase_order'
export type TaxDeclStatus  = 'draft' | 'submitted' | 'validated' | 'to_pay'

export interface Account {
  id:            string
  number:        string          // ex: "401"
  name:          string          // ex: "Fournisseurs"
  type:          AccountType
  normalBalance: 'debit' | 'credit'
  class:         AccountClass
  parentId:      string | null
  isLeaf:        boolean         // peut recevoir des écritures
  isActive:      boolean
  openingBalance: number
  createdAt:     string
}

export interface FiscalPeriod {
  id:        string
  exercice:  number
  startDate: string
  endDate:   string
  status:    PeriodStatus
  createdAt: string
}

export interface AccountingJournal {
  id:                  string
  code:                string     // "AC", "VE", "BQ"…
  name:                string
  type:                JournalType
  defaultAccountId:    string | null
  isActive:            boolean
  entriesCount:        number
}

export interface EntryLine {
  id:          string
  accountId:   string
  account:     { number: string; name: string }
  label:       string
  debit:       number
  credit:      number
  letterCode:  string | null
}

export interface AccountingEntry {
  id:          string
  number:      string             // N° pièce
  journalId:   string
  journal:     { code: string; name: string; type: JournalType }
  periodId:    string
  date:        string
  label:       string
  source:      EntrySource
  sourceId:    string | null
  lines:       EntryLine[]
  attachmentPath: string | null
  createdById: string
  createdAt:   string
  updatedAt:   string
}

export interface AccountBalance {
  accountId:    string
  account:      Account
  debitTotal:   number
  creditTotal:  number
  balance:      number            // > 0 = débiteur, < 0 = créditeur
}

export interface TaxDeclaration {
  id:             string
  periodId:       string
  period:         FiscalPeriod
  vatCollected:   number
  vatDeductible:  number
  vatNet:         number
  status:         TaxDeclStatus
  submittedAt:    string | null
  notes:          string | null
  createdAt:      string
}
```

---

## Ordre de développement recommandé

| # | Page / Feature | Dépendances | Priorité |
|---|----------------|-------------|---------|
| 1 | `features/accounting/types.ts` | — | Critique |
| 2 | `features/accounting/api.ts` | types | Critique |
| 3 | `features/accounting/hooks.ts` | api | Critique |
| 4 | `/accounting/chart` — Plan comptable | hooks | Haute |
| 5 | `/accounting/periods` — Périodes | hooks | Haute |
| 6 | `/accounting/journals` — Journaux | hooks | Haute |
| 7 | `/accounting/entries` — Liste + Saisie | AccountPicker | Haute |
| 8 | `/accounting` — Dashboard | entries, balance | Moyenne |
| 9 | `/accounting/reports` — Balance + GL | BalanceTable | Moyenne |
| 10 | `/accounting/lettering` — Lettrage | entries | Moyenne |
| 11 | `/accounting/tax-declarations` — TVA | periods | Moyenne |
| 12 | `/accounting/reports/sage` — Export | reports | Basse |

---

## Composants partagés à créer

| Composant | Utilisé par | Description |
|-----------|-------------|-------------|
| `AccountPicker` | entries, lettering, reports | Combobox recherche par n° ou intitulé |
| `PeriodSelector` | entries, balance, tax | Sélecteur période fiscale |
| `DebitCreditCell` | toutes les tables | Montant rouge si débit, vert si crédit |
| `EquilibriumBadge` | EntryForm | Badge ✓ / ✗ équilibre débit=crédit |
| `JournalBadge` | tables | Badge coloré code journal (AC, VE…) |
| `AccountTypeBadge` | plan comptable | Badge type compte (Actif, Passif…) |

---

## Règles d'accessibilité / UX appliquées

- `overflow-x: auto` sur toutes les tables (mobile)
- `cursor-pointer` sur toutes les lignes cliquables
- Transition `150-300ms` sur hover / expand
- Focus visible sur tous les inputs (ring `#2D7DD2`)
- Colonnes Débit/Crédit : couleur + icône (pas seulement la couleur) pour les daltoniens
- Totaux en gras + ligne de séparation épaisse dans les tables financières
- Montants toujours en `var(--font-mono)` pour l'alignement des chiffres
- Labels de champs toujours présents (pas de placeholder-only)

---

*Dernière mise à jour : 2026-05-22 — À mettre à jour au fur et à mesure du développement*
