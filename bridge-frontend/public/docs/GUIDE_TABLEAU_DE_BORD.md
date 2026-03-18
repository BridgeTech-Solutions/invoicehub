# Guide Utilisateur — Tableau de bord

> **Bridge Technologies Solutions (BTS)** — InvoiceHub v2.0
> Le tableau de bord est la page d'accueil de l'application. Il donne une vue
> d'ensemble complète de l'activité de facturation en temps réel.

---

## Vue générale

```
┌──────────────────────────────────────────────────────────────┐
│  [1] 4 CARTES KPI                                            │
│  CA du mois · Factures émises · Créances · En retard         │
├───────────────────────────────────────┬──────────────────────┤
│  [2] GRAPHIQUE CHIFFRE D'AFFAIRES     │  [3] DONUT STATUTS   │
│  Évolution mensuelle / trimestrielle  │  Répartition factures│
├───────────────────────────────────────┴──────────────────────┤
│  [4] FACTURES RÉCENTES      │  [5] TOP CLIENTS PAR CA        │
│  10 dernières factures      │  Classement par chiffre d'aff. │
├─────────────────────────────┴──────────────────────────────── │
│  [6] BALANCE ÂGÉE DES CRÉANCES                               │
│  Répartition des impayés par ancienneté                      │
└──────────────────────────────────────────────────────────────┘
```

> **Mise à jour automatique** : le tableau de bord se rafraîchit en temps réel
> dès qu'une facture est émise, qu'un paiement est enregistré ou qu'une proforma
> change de statut — sans recharger la page.

---

## [1] Les 4 cartes KPI

Les KPI (indicateurs clés de performance) sont les 4 grandes cartes en haut de page.
Chacune affiche un chiffre principal, une information secondaire et une flèche de tendance.

---

### Carte 1 — CA du mois

```
┌─────────────────────────────┐
│ CA DU MOIS          [icône] │
│                             │
│  1 250 000 XAF              │
│  ↑ 3 factures émises        │
└─────────────────────────────┘
```

**Ce qu'elle mesure** : Le chiffre d'affaires TTC de toutes les factures émises
(non-brouillon, non-annulées) au cours du **mois calendaire en cours**.

**La flèche** :
- ↑ Verte = CA positif ce mois
- — Grise = aucune facture émise ce mois

**À quoi ça sert** : Suivre la performance commerciale mensuelle d'un coup d'œil.

---

### Carte 2 — Factures émises

```
┌─────────────────────────────┐
│ FACTURES ÉMISES     [icône] │
│                             │
│  24                         │
│  ↑ 3 ce mois       Voir →   │
└─────────────────────────────┘
```

**Ce qu'elle mesure** : Le nombre **total** de factures dans le système
(hors brouillons et annulées), depuis le début. La ligne secondaire indique
combien ont été émises ce mois-ci.

**Lien "Voir →"** : Redirige vers la liste complète des factures.

---

### Carte 3 — Créances en attente

```
┌─────────────────────────────┐
│ CRÉANCES EN ATTENTE [icône] │
│                             │
│  850 000 XAF                │
│  — 5 factures      Voir →   │
└─────────────────────────────┘
```

**Ce qu'elle mesure** : La somme totale des soldes dus (`balanceDue`) sur toutes
les factures au statut **Émise** ou **Partiellement payée** — c'est-à-dire
l'argent que les clients doivent encore à BTS.

**La flèche** : Toujours neutre (—) car les créances ne sont ni bonnes ni mauvaises
en elles-mêmes, elles font partie du cycle normal.

> **Attention** : Ce montant inclut les factures en retard. Il représente
> **tout l'argent non encore encaissé**.

---

### Carte 4 — Factures en retard

```
┌─────────────────────────────┐
│ FACTURES EN RETARD  [icône] │
│                             │
│  3                          │
│  ↓ 420 000 XAF     Voir →   │
└─────────────────────────────┘
```

**Ce qu'elle mesure** : Le nombre de factures dont la **date d'échéance est dépassée**
et qui ne sont pas encore entièrement payées. Le montant en dessous est la somme
totale de ces impayés en retard.

**La flèche** :
- ↓ Rouge = il y a des factures en retard (signal d'alerte)
- — Grise = aucun retard (situation saine)

> C'est la carte la plus critique. Si ce chiffre est élevé,
> des relances client sont nécessaires.

---

## [2] Graphique — Évolution du chiffre d'affaires

```
┌─────────────────────────────────────────────────────┐
│ Évolution du chiffre d'affaires                     │
│ Total : 3 250 000 XAF   [Mensuel] [Trimestriel] [Annuel] │
│                                                     │
│  1.5M ┤    ╭─╮                                      │
│  1.0M ┤╭──╯  ╰──╮                                   │
│  500k ┤╯         ╰──╮                               │
│     0 ┼────────────────────────────────             │
│       Jan Fév Mar Avr Mai Jun Jul Aoû Sep            │
└─────────────────────────────────────────────────────┘
```

**Ce qu'il montre** : L'évolution du CA total TTC (factures émises, hors brouillons
et annulées) sur la période sélectionnée.

### Les 3 modes d'affichage

| Bouton | Granularité | Utilisation |
|--------|-------------|-------------|
| **Mensuel** | 1 point par mois | Suivi mois par mois — vue par défaut |
| **Trimestriel** | 1 point par trimestre (T1/T2/T3/T4) | Vision saisonnière |
| **Annuel** | 1 seul point = total annuel | Vue macro |

### Lire le graphique

- **L'axe vertical (Y)** : montants en XAF — `k` = milliers, `M` = millions
- **L'axe horizontal (X)** : période (mois, trimestre ou année)
- **La courbe bleue** : le CA de chaque période
- **La zone ombrée** : aire sous la courbe pour visualiser le volume
- **Survoler un point** : une bulle affiche le montant exact de la période

### Le total affiché

Le chiffre **"Total : X XAF"** sous le titre correspond à la **somme de toutes
les périodes visibles** dans le graphique — utile pour connaître le CA cumulé
de l'année en cours.

---

## [3] Donut — Répartition des statuts de factures

```
         ┌──────────────────────┐
         │ Statuts des factures │
         │ 24 factures          │
         │                      │
         │      ┌──┐            │
         │   ╭──┤12├──╮         │
         │  ╱  └──┘   ╲        │
         │ │  factures  │       │
         │  ╲          ╱       │
         │   ╰──────────╯       │
         │                      │
         │ ● Payées      12  50%│
         │ ● En attente   7  29%│
         │ ● En retard    3  13%│
         │ ● Brouillons   2   8%│
         └──────────────────────┘
```

**Ce qu'il montre** : La répartition de **toutes les factures** du système
par statut, en nombre et en pourcentage.

### Les 4 couleurs

| Couleur | Statut | Signification |
|---------|--------|---------------|
| Vert | **Payées** | Factures intégralement réglées |
| Bleu | **En attente** | Émises, dans les délais (pas encore échues) |
| Rouge | **En retard** | Émises, date d'échéance dépassée |
| Gris | **Brouillons** | Rédigées, pas encore émises |

### Lire le donut

- Le **chiffre au centre** = nombre total de factures toutes catégories confondues
- La **légende à droite** montre le nombre et le pourcentage de chaque statut
- **Survoler un arc** : une bulle affiche le statut, le nombre et le %

### Interprétation

- Un donut majoritairement **vert** = bonne santé financière, les clients paient
- Un donut avec beaucoup de **rouge** = situation critique, relances à lancer
- Un donut avec beaucoup de **gris** = travail en cours, factures pas encore envoyées

---

## [4] Tableau — Factures récentes

```
┌─────────────────────────────────────────── Voir tout →┐
│ N° Facture      Client       Date       Montant  Statut│
│ BTS/DC/2026/03  Acme Corp    15/03/26   150 000  Émise │
│ BTS/DC/2026/03  BTC SA       14/03/26   300 000  Payée │
│ BTS/DC/2026/02  MTN Cam.     10/03/26    75 000  Retard│
│ ...                                                     │
└─────────────────────────────────────────────────────────┘
```

**Ce qu'il montre** : Les **10 dernières factures** créées dans le système,
toutes classées de la plus récente à la plus ancienne.

### Colonnes

| Colonne | Description |
|---------|-------------|
| **N° Facture** | Numéro SYSCOHADA — cliquer pour ouvrir la facture |
| **Client** | Nom du client facturé |
| **Date** | Date d'émission de la facture |
| **Montant TTC** | Montant total toutes taxes comprises |
| **Statut** | Badge coloré indiquant l'état actuel |

### Les badges de statut

| Badge | Couleur | Signification |
|-------|---------|---------------|
| Brouillon | Gris | Rédigée, non envoyée |
| Émise | Bleu | Envoyée au client, en attente de paiement |
| Part. payée | Jaune | Paiement partiel reçu |
| En retard | Orange | Échéance dépassée, non payée |
| Payée | Vert | Intégralement réglée |
| Annulée | Rouge | Annulée (avoir créé) |

**Lien "Voir tout →"** : Redirige vers la liste complète des factures.

---

## [5] Tableau — Top clients par CA

```
┌─────────────────────────────── Voir tout →┐
│ Top clients par CA                        │
│                                           │
│ #1 [AC] Acme Corp        ████████ 500 000 │
│ #2 [BT] BTC SA           █████    310 000 │
│ #3 [MT] MTN Cameroun     ████     250 000 │
│ #4 [OR] Orange Cam.      ██       140 000 │
│ #5 [GU] Guinness Cam.    █         80 000 │
└───────────────────────────────────────────┘
```

**Ce qu'il montre** : Les **5 meilleurs clients** classés par chiffre d'affaires
total (somme des montants TTC de toutes leurs factures payées et en cours).

### Lire le classement

- **Le rang** (#1, #2…) indique la position dans le classement
- **L'avatar** affiche les initiales du client avec une couleur unique
- **La barre de progression** montre le CA relatif au client n°1
  (le premier client = barre pleine 100%, les autres sont proportionnels)
- **Le montant** à droite est le CA TTC total du client

**Cliquer sur un nom de client** → ouvre la fiche détaillée du client.

**Lien "Voir tout →"** → Redirige vers la liste complète des clients.

---

## [6] Balance âgée des créances

```
┌────────────────────────────────────────────────────────────┐
│ Balance âgée des créances                                  │
│ Total en attente : 850 000 XAF — 8 factures               │
│                                                            │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────┐│
│ │ À ÉCHOIR │ │  1–30 j  │ │ 31–60 j  │ │ 61–90 j  │ │+90j││
│ │ Non échu │ │ En retard│ │ En retard│ │ En retard│ │Crit││
│ │ 400 000  │ │ 200 000  │ │ 150 000  │ │  80 000  │ │20k ││
│ │ ████░░░░ │ │ ██░░░░░░ │ │ ██░░░░░░ │ │ █░░░░░░░ │ │░░░░││
│ │ 47%      │ │ 24%      │ │ 18%      │ │  9%      │ │ 2% ││
│ └──────────┘ └──────────┘ └──────────┘ └──────────┘ └────┘│
└────────────────────────────────────────────────────────────┘
```

**Ce qu'elle montre** : La répartition des **créances impayées** (factures émises
et non encore payées) selon leur **ancienneté de retard**.

> Ce widget n'apparaît que si des créances existent. S'il est absent, tout est payé.

### Les 5 tranches

| Tranche | Couleur | Signification |
|---------|---------|---------------|
| **À échoir** | Bleu | Factures pas encore à échéance — situation normale |
| **1 – 30 j** | Jaune | En retard depuis moins d'un mois — relance recommandée |
| **31 – 60 j** | Orange | En retard depuis 1 à 2 mois — relance urgente |
| **61 – 90 j** | Rouge | En retard depuis 2 à 3 mois — action nécessaire |
| **+ de 90 j** | Rouge foncé | Retard critique — risque de créance irrécouvrable |

### Lire chaque case

Chaque case affiche :
1. **La période** (label + sous-label)
2. **Le nombre de factures** concernées (`X fac.`)
3. **Le montant total** des créances dans cette tranche
4. **Une mini barre** proportionnelle au total général
5. **Le pourcentage** que représente cette tranche

### Comment interpréter

**Situation saine** : La majorité des montants est dans "À échoir" (bleu). Les
tranches rouges sont vides ou très faibles.

**Situation préoccupante** : Des montants importants apparaissent dans les tranches
31–60 j ou 61–90 j. Il faut contacter ces clients en priorité.

**Situation critique** : Des montants dans "+90 j". Ces créances risquent de ne
jamais être recouvrées. Escalade et action juridique éventuellement nécessaires.

---

## Mise à jour des données

Le tableau de bord reçoit les mises à jour **en temps réel** via Socket.io :

| Événement | Déclencheur |
|-----------|-------------|
| Rafraîchissement automatique | Émission d'une facture |
| Rafraîchissement automatique | Enregistrement d'un paiement |
| Rafraîchissement automatique | Annulation d'une facture |
| Rafraîchissement automatique | Changement de statut d'une proforma |
| Rafraîchissement automatique | Marquage automatique "en retard" (cron 00h05) |

> Il n'est **pas nécessaire** de recharger la page manuellement.
> Les chiffres se mettent à jour dès qu'une action est effectuée
> par n'importe quel utilisateur connecté.

---

## Questions fréquentes

**Q : Pourquoi le CA du mois est différent du total des factures ?**
Le CA du mois ne compte que les factures émises dans le **mois en cours**.
Les factures des mois précédents apparaissent dans le graphique mais pas dans la carte KPI.

**Q : Pourquoi le nombre total de factures dans la carte 2 diffère du total dans le donut ?**
La carte 2 exclut les brouillons et annulées. Le donut inclut les brouillons dans la tranche grise.

**Q : La Balance âgée n'apparaît pas. Pourquoi ?**
Ce widget est masqué automatiquement quand toutes les créances sont à zéro — c'est une excellente nouvelle, tout est payé !

**Q : Les données du tableau de bord sont-elles en temps réel ?**
Oui. Chaque action dans l'application (facture émise, paiement reçu…) déclenche
une mise à jour instantanée visible par tous les utilisateurs connectés.

**Q : Puis-je accéder directement à une facture depuis le tableau de bord ?**
Oui. Cliquer sur le numéro de facture dans le tableau "Factures récentes" ouvre
directement le détail de la facture.

**Q : Les brouillons comptent-ils dans le CA ?**
Non. Seules les factures **émises** (et non annulées) entrent dans le calcul du CA.
Les brouillons apparaissent uniquement dans le donut (tranche grise) pour information.
