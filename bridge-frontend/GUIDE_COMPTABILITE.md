# Guide utilisateur — Module Comptabilité

> **InvoiceHub v2.0 — Bridge Technologies Solutions (BTS), Douala**  
> Conforme au plan comptable OHADA (SYSCOHADA révisé 2017)  
> TVA Cameroun : 19,25 % (19 % TVA + 0,25 % CAC)

---

## Table des matières

1. [Vue d'ensemble](#1-vue-densemble)
2. [Dashboard comptabilité](#2-dashboard-comptabilité)
3. [Plan comptable](#3-plan-comptable)
4. [Périodes fiscales](#4-périodes-fiscales)
5. [Journaux comptables](#5-journaux-comptables)
6. [Écritures comptables](#6-écritures-comptables)
7. [Saisie d'une écriture](#7-saisie-dune-écriture)
8. [Lettrage des comptes](#8-lettrage-des-comptes)
9. [Balance & Grand livre](#9-balance--grand-livre)
10. [Export Sage / CSV / FEC](#10-export-sage--csv--fec)
11. [Déclarations TVA](#11-déclarations-tva)
12. [Concepts clés SYSCOHADA](#12-concepts-clés-syscohada)
13. [Questions fréquentes](#13-questions-fréquentes)

---

## 1. Vue d'ensemble

Le module comptabilité couvre l'ensemble du cycle comptable de BTS :

```
Plan comptable → Périodes → Journaux → Écritures → Lettrage → Rapports → TVA
```

**Accès** : Menu latéral → **Comptabilité**

**Qui peut accéder ?**

| Fonctionnalité | Employé | Commercial | Admin |
|---|:---:|:---:|:---:|
| Consulter les écritures | ✅ | ✅ | ✅ |
| Saisir une écriture | ✅ | ✅ | ✅ |
| Lettrer des comptes | ✅ | ✅ | ✅ |
| Clôturer une période | ❌ | ❌ | ✅ |
| Gérer le plan comptable | ❌ | ❌ | ✅ |
| Déposer une déclaration TVA | ❌ | ❌ | ✅ |
| Exporter vers Sage | ❌ | ✅ | ✅ |

---

## 2. Dashboard comptabilité

**Chemin** : `/accounting`

Le tableau de bord donne une vision instantanée de la situation financière du mois en cours.

### Indicateurs clés (KPI)

| Indicateur | Ce qu'il mesure |
|---|---|
| **Chiffre d'affaires** | Total des produits du mois (comptes 7x) |
| **Charges** | Total des charges du mois (comptes 6x) |
| **Résultat net** | CA − Charges (vert si bénéfice, rouge si déficit) |
| **TVA à reverser** | TVA collectée − TVA déductible du dernier mois |

> **Couleur du résultat** : vert = bénéfice · rouge = perte · la border-left de la card change de couleur selon le signe.

### Graphique d'évolution

Le graphique en barres affiche les **6 derniers mois** :
- Barres **bleues** : Chiffre d'affaires
- Barres **rouges** : Charges

Survolez une barre pour voir le détail exact du mois.

### Dernières écritures

Les 5 écritures les plus récentes sont affichées. Cliquez sur **"Voir toutes les écritures"** pour accéder à la liste complète.

### Raccourcis rapides

Quatre boutons permettent d'accéder directement aux modules les plus utilisés : Plan comptable, Journaux, Périodes fiscales et Déclarations TVA.

---

## 3. Plan comptable

**Chemin** : `/accounting/chart`

Le plan comptable OHADA structure tous les comptes utilisés dans vos écritures. Il suit la numérotation des **9 classes SYSCOHADA** :

| Classe | Intitulé |
|---|---|
| 1 | Comptes de capitaux |
| 2 | Comptes d'actif immobilisé |
| 3 | Comptes de stocks |
| 4 | Comptes de tiers |
| 5 | Comptes de trésorerie |
| 6 | Comptes de charges |
| 7 | Comptes de produits |
| 8 | Comptes de résultat |

### Naviguer dans le plan

- **Filtres par classe** : cliquez sur les pilules `Cl. 1` à `Cl. 8` pour afficher uniquement les comptes d'une classe
- **Recherche** : saisissez un numéro (ex : `401`) ou un intitulé (ex : `fournisseur`) dans la barre de recherche
- **Arborescence** : cliquez sur `›` pour déplier les sous-comptes d'un compte parent

### Ajouter un compte

1. Cliquez sur **+ Nouveau compte** (bouton haut droite)
2. Renseignez :
   - **Numéro** : selon la nomenclature OHADA (ex : `4011` pour Fournisseurs - achats de biens)
   - **Intitulé** : nom du compte
   - **Type** : Actif / Passif / Capitaux propres / Produit / Charge
   - **Sens normal** : Débit ou Crédit (détermine comment le solde est affiché)
   - **Compte parent** : laissez vide pour un compte de classe, ou sélectionnez le parent
   - **Solde d'ouverture** : montant initial (reprise de la comptabilité précédente)
3. Cliquez sur **Créer le compte**

> **Règle SYSCOHADA** : un compte ne peut recevoir des écritures que s'il est un **compte de détail** (feuille), pas un compte parent. Exemple : les écritures vont sur `4011` pas sur `401`.

### Modifier ou désactiver un compte

Cliquez sur `⋮` à droite de la ligne du compte :
- **Modifier** : ouvre le formulaire de modification
- **Grand livre** : affiche toutes les écritures de ce compte
- **Désactiver** : le compte n'apparaît plus dans le sélecteur de compte lors de la saisie (mais ses écritures sont conservées)

> ⚠️ Un compte avec des écritures ne peut pas être supprimé, seulement désactivé.

---

## 4. Périodes fiscales

**Chemin** : `/accounting/periods`

Les périodes fiscales découpent l'exercice comptable en mois. Elles permettent de clôturer la comptabilité mois par mois.

### Structure

```
Exercice 2026
├── Janvier 2026    [Clôturé]
├── Février 2026    [Clôturé]
├── Mars 2026       [En cours]  ← période active
├── Avril 2026      [Ouvert]
└── …
```

### Créer un exercice fiscal

1. Cliquez sur **+ Nouvel exercice**
2. Saisissez l'**année** (ex : `2027`)
3. Le système génère automatiquement les **12 périodes** (1er janvier → 31 décembre)
4. Cliquez sur **Créer l'exercice**

### Clôturer une période

La clôture d'une période **empêche toute modification** des écritures de ce mois. À faire en fin de mois, après vérification de l'équilibre.

1. Trouvez le mois à clôturer dans l'accordéon de l'exercice
2. Cliquez sur **Clôturer** sur la ligne du mois
3. Confirmez l'action

> 🔒 Une période clôturée peut être **réouverte** par un admin en cas d'erreur, mais cette action est tracée dans l'audit.

### Indicateurs de progression

La barre de progression de chaque exercice indique la proportion de mois clôturés. L'alerte **"Fin de période imminente"** apparaît automatiquement quand une période ouverte se termine dans moins de 5 jours.

---

## 5. Journaux comptables

**Chemin** : `/accounting/journals`

Un journal regroupe des écritures de même nature. SYSCOHADA impose des journaux obligatoires :

| Code | Journal | Usage |
|---|---|---|
| `AC` | Achats | Factures fournisseurs, bons de commande |
| `VE` | Ventes | Factures clients, avoirs |
| `BQ` | Banque | Mouvements bancaires |
| `CA` | Caisse | Paiements en espèces |
| `OD` | Opérations diverses | Paie, amortissements, régularisations |
| `AN` | À-nouveaux | Soldes de reprise d'exercice |

### Ajouter un journal

1. Cliquez sur **+ Nouveau journal**
2. Renseignez :
   - **Code** : 2 à 4 lettres majuscules (ex : `BQ2` pour un second compte bancaire)
   - **Nom** : intitulé complet
   - **Type** : sélectionnez parmi les 6 types SYSCOHADA
   - **Compte par défaut** : compte pré-rempli à l'ouverture d'une écriture dans ce journal (optionnel)
3. Cliquez sur **Créer le journal**

### Désactiver un journal

Cliquez sur `⋮` → **Désactiver**. Le journal n'apparaît plus dans le sélecteur lors de la saisie. Ses écritures passées sont conservées.

---

## 6. Écritures comptables

**Chemin** : `/accounting/entries`

La liste de toutes les écritures comptables, qu'elles soient saisies manuellement ou générées automatiquement (facture émise, paiement reçu, dépense approuvée).

### Lire le tableau

| Colonne | Description |
|---|---|
| **Date** | Date comptable de l'écriture |
| **N° Pièce** | Numéro unique par journal (ex : `VE-2026-001`) |
| **Journal** | Badge coloré avec le code (ex : `VE` en vert) |
| **Libellé** | Description de l'opération |
| **Source** | `Manuel` / `Facture` / `Paiement` / `Dépense` / `BC` |
| **Débit** | Montant débiteur (rouge) |
| **Crédit** | Montant créditeur (vert) |

Les 4 KPI en haut de page récapitulent :
- **Total Débit** et **Total Crédit** de la page affichée
- **Équilibre** : indique si Σ Débit = Σ Crédit (obligatoire en SYSCOHADA)
- **Nombre d'écritures** et numéro de page

### Filtrer les écritures

- **Recherche** : par libellé ou numéro de pièce
- **Journal** : menu déroulant pour ne voir qu'un journal
- **Dates** : plage de dates (début et fin)

### Annuler une écriture

> ⚠️ En comptabilité, on n'efface jamais une écriture — on la **contre-passe**.

1. Cliquez sur `⋮` → **Annuler**
2. Confirmez : le système génère automatiquement une **contre-écriture** qui annule l'effet de l'écriture originale
3. Les deux écritures restent visibles dans l'historique

---

## 7. Saisie d'une écriture

**Chemin** : `/accounting/entries/new`

### Principe fondamental

Toute écriture doit respecter la **partie double** : chaque opération génère au moins une ligne de débit et une ligne de crédit, et la somme des débits doit être égale à la somme des crédits.

```
Exemple : achat de fournitures 50 000 XAF (payé en caisse)

  Ligne 1 : Débit  606 - Achats fournitures   50 000
  Ligne 2 : Crédit 571 - Caisse               50 000
  ─────────────────────────────────────────────────────
  Σ Débit = Σ Crédit = 50 000 ✓
```

### Étape 1 — En-tête de l'écriture

| Champ | Description |
|---|---|
| **Journal** | Sélectionnez le journal approprié (Achats, Ventes, Banque…) |
| **Date** | Date de l'opération (pré-remplie à aujourd'hui) |
| **Libellé général** | Description résumée de l'opération |

### Étape 2 — Lignes de l'écriture

Chaque ligne représente un mouvement sur un compte :

1. **Compte** : cliquez sur le sélecteur, tapez le numéro ou le nom du compte
   - Seuls les comptes de **détail** (feuilles) sont disponibles
   - Exemple : `401` s'affiche mais seul `4011` peut être sélectionné
2. **Libellé** : précisez l'objet de cette ligne (pré-rempli avec le libellé général)
3. **Débit** ou **Crédit** : saisissez le montant — un seul des deux champs par ligne

Utilisez **+ Ajouter une ligne** pour les écritures complexes (TVA, acomptes, etc.).

Le bouton `✕` supprime une ligne (au minimum 2 lignes obligatoires).

### Étape 3 — Vérification de l'équilibre

Le panneau de droite affiche en temps réel :
- **Total Débit** et **Total Crédit**
- **Indicateur d'équilibre** : vert `✓ Équilibré` ou rouge avec le montant de la différence

> Le bouton **Enregistrer** est bloqué tant que l'écriture n'est pas équilibrée.

### Exemples d'écritures courantes

**Facture fournisseur (HT : 500 000 / TVA 19,25 % : 96 250)**

```
D  6011 - Achats de marchandises    500 000
D  4452 - TVA déductible             96 250
C  4011 - Fournisseurs              596 250
```

**Encaissement client par virement**

```
D  521  - Banque                    500 000
C  4111 - Clients                   500 000
```

**Paiement de salaires**

```
D  661  - Rémunérations du personnel  800 000
C  421  - Personnel - rémunérations   800 000
```

---

## 8. Lettrage des comptes

**Chemin** : `/accounting/lettering`

Le lettrage consiste à **rapprocher** une ligne de débit et une ligne de crédit sur un même compte de tiers (client ou fournisseur), pour marquer qu'elles se compensent — typiquement une facture et son paiement.

### Pourquoi lettrer ?

Sans lettrage, il est impossible de savoir quelles factures sont réglées et lesquelles restent impayées. Le lettrage marque visuellement ce qui est "soldé".

```
Compte 4111 - Client SABC

  FAC-001   Crédit   500 000    ← facture émise
  PAY-001   Débit    500 000    ← paiement reçu

  → Lettrage A1 : les deux lignes se soldent à 0
```

### Procédure de lettrage

**Étape 1 — Sélectionner le compte**

Choisissez un compte de **classe 4** (tiers) dans le sélecteur :
- Comptes `40x` : fournisseurs
- Comptes `41x` : clients

**Étape 2 — Identifier les lignes à rapprocher**

Les lignes non lettrées s'affichent dans le tableau. La page propose automatiquement des **suggestions** (fond doré + badge "Suggéré") : quand vous cochez une ligne, les lignes dont le montant compense exactement votre sélection sont mises en évidence.

**Étape 3 — Sélectionner les lignes**

Cochez les lignes qui se compensent. L'indicateur en haut du tableau affiche :
- Le **solde de la sélection** en temps réel
- `✓ Sélection équilibrée — prêt à lettrer` si Σ Débit = Σ Crédit

> En SYSCOHADA, le **lettrage partiel est interdit** : vous ne pouvez lettrer que des groupes dont le solde est exactement à 0.

**Étape 4 — Valider le lettrage**

Cliquez sur **Lettrer**. Un code lettre (A1, A2, B1…) est assigné au groupe.

### Délettrer un groupe

Si le lettrage est incorrect :
1. Dépliez le groupe lettré dans la section **Lignes lettrées**
2. Cliquez sur **Délettrer**
3. Confirmez — les lignes retournent dans "Non lettrées"

> Le délettrage est tracé dans le journal d'audit.

---

## 9. Balance & Grand livre

**Chemin** : `/accounting/reports`

Deux états de synthèse comptables accessibles via les onglets.

### Balance des comptes

La balance liste tous les comptes avec leurs **mouvements cumulés** sur une période.

**Colonnes :**

| Colonne | Description |
|---|---|
| **Compte** | Numéro OHADA |
| **Intitulé** | Nom du compte |
| **Mvt Débit** | Total des débits de la période |
| **Mvt Crédit** | Total des crédits de la période |
| **Solde** | Débit − Crédit (rouge si débiteur, vert si créditeur) |

**Filtres disponibles :**
- **Période** : sélectionnez l'exercice/mois à analyser
- **Classe** : affichez uniquement les comptes d'une classe (1 à 8)
- **Inclure comptes nuls** : affiche aussi les comptes sans mouvement
- **Recherche** : par numéro ou intitulé

**Totaux par classe** : chaque groupe de classe affiche une ligne de total en gras (fond gris).

**Double-clic sur un compte** → ouvre automatiquement le Grand livre de ce compte dans l'onglet Grand livre.

### Grand livre

Le grand livre affiche le **détail de toutes les écritures** d'un compte, avec le solde progressif (running balance).

1. Sélectionnez un compte via le sélecteur en haut
2. Le tableau affiche : Date · N° pièce · Journal · Libellé · Débit · Crédit · Solde progressif · Lettre
3. La colonne **Lettre** indique le code de lettrage (`A1`, `B3`…) ou `—`

La ligne de pied de tableau récapitule les totaux de la période.

---

## 10. Export Sage / CSV / FEC

**Chemin** : `/accounting/reports/sage`

Permet de générer un fichier d'export pour votre expert-comptable ou pour importer dans un autre logiciel.

### Configurer l'export

**1. Définir la période**

Saisissez la date de début et la date de fin. Les raccourcis **T1 / T2 / T3 / T4** sélectionnent automatiquement les trimestres de l'exercice en cours.

**2. Sélectionner les journaux**

Cochez les journaux à inclure dans l'export. Par défaut, tous les journaux actifs sont cochés.

**3. Choisir le format**

| Format | Usage |
|---|---|
| **Sage 100** | Import direct dans Sage Comptabilité (format propriétaire `.txt`) |
| **CSV standard** | Tableur Excel, LibreOffice, n'importe quel logiciel |
| **FEC (DGI France)** | Fichier des Écritures Comptables — format audit fiscal |

**4. Choisir l'encodage**

- **UTF-8** : recommandé pour la plupart des logiciels modernes
- **Latin-1** : pour les anciennes versions de Sage qui ne supportent pas UTF-8

### Aperçu

Activez **Afficher l'aperçu** pour visualiser les 5 premières lignes du fichier avant de le télécharger.

### Télécharger

Cliquez sur **Générer et télécharger**. Le fichier est nommé automatiquement :
```
export_comptable_20260101_20260331.txt
```

Le bouton affiche un spinner pendant la génération et se désactive pour éviter les doublons.

---

## 11. Déclarations TVA

**Chemin** : `/accounting/tax-declarations`

Synthèse mensuelle ou trimestrielle de la TVA à reverser à la Direction Générale des Impôts (DGI) du Cameroun.

### Taux applicables

| Taux | Nature |
|---|---|
| **19,25 %** | Taux standard (19 % TVA + 0,25 % Contribution aux Communes) |
| **0 %** | Produits et services exonérés (produits alimentaires de base, etc.) |

> **Fréquence de déclaration** : mensuelle si le CA annuel dépasse 50 millions XAF, trimestrielle sinon (Art. 138 CGI Cameroun).

### Comprendre les KPI

| Indicateur | Comptes utilisés | Signification |
|---|---|---|
| **TVA Collectée** | `4455x` | TVA facturée aux clients sur vos ventes |
| **TVA Déductible** | `4452x` | TVA payée sur vos achats et charges |
| **TVA Nette** | Collectée − Déductible | Montant à reverser (positif) ou crédit (négatif) |

### Créer une déclaration

1. Cliquez sur **+ Nouvelle déclaration**
2. Sélectionnez l'**exercice fiscal**
3. Sélectionnez le **mois** (ou trimestre)
4. Ajoutez des **notes internes** si nécessaire (ajustements, références DGI)
5. Cliquez sur **Créer la déclaration**

Le système calcule automatiquement les montants en lisant les écritures des comptes `4455x` (collectée) et `4452x` (déductible).

### Cycle de vie d'une déclaration

```
Brouillon → Déposé → Validé
              ↓
          À reverser
```

| Statut | Signification | Action disponible |
|---|---|---|
| **Brouillon** (gris) | En cours de vérification | Déposer à la DGI |
| **Déposé** (bleu) | Envoyé à la DGI | — |
| **Validé** (vert) | Accepté par la DGI | — |
| **À reverser** (orange) | Paiement en attente | — |

### Déposer une déclaration

Quand la déclaration est vérifiée :
1. Cliquez sur `⋮` → **Déposer à la DGI**
2. Confirmez — l'action est **irréversible** : une déclaration déposée ne peut plus être modifiée

### Lire le panneau de détail

Le tableau de détail ventile la TVA par taux (19,25 % et 0 %) avec, pour chaque ligne :
- **Base HT** : montant hors taxes sur lequel la TVA est calculée
- **TVA** : montant de TVA correspondant

Ces données proviennent directement des écritures comptables — pas d'un calcul approximatif.

---

## 12. Concepts clés SYSCOHADA

### La partie double

Principe fondamental : **chaque opération affecte au moins deux comptes**. La somme des débits est toujours égale à la somme des crédits.

### Débit et Crédit

Le sens débit/crédit dépend de la **nature du compte** :

| Type de compte | Augmente au | Diminue au |
|---|---|---|
| Actif (1xx, 2xx, 3xx, 5xx) | **Débit** | Crédit |
| Passif / Capitaux (1xx) | Crédit | **Débit** |
| Charges (6xx) | **Débit** | Crédit |
| Produits (7xx) | Crédit | **Débit** |

### Numérotation des pièces

Les numéros de pièce sont générés automatiquement et **sans saut de numéro** (obligation SYSCOHADA) :
```
VE-2026-001, VE-2026-002, VE-2026-003…
```

### Clôture de période

Une fois une période clôturée, **aucune écriture ne peut être modifiée ou ajoutée** sur cette période. En cas d'erreur, une contre-écriture doit être passée sur la période ouverte suivante.

### Contre-écriture (annulation)

En comptabilité SYSCOHADA, on n'efface pas une écriture erronée — on passe une **écriture inverse** (contre-écriture) qui annule l'effet de l'originale. Les deux écritures restent visibles dans l'historique.

---

## 13. Questions fréquentes

**Q : Pourquoi le bouton "Enregistrer" est-il grisé lors de la saisie d'écriture ?**  
R : L'écriture n'est pas équilibrée. Vérifiez que la somme des débits est égale à la somme des crédits. L'indicateur rouge en haut à droite vous montre le montant de la différence.

---

**Q : Comment corriger une écriture déjà enregistrée ?**  
R : Vous ne pouvez pas modifier une écriture existante. Passez une **contre-écriture** via le bouton Annuler (colonne `⋮`). Le système génère automatiquement l'écriture inverse.

---

**Q : Je ne trouve pas un compte dans le sélecteur lors de la saisie. Pourquoi ?**  
R : Deux raisons possibles : (1) le compte n'est pas un compte de détail (feuille) — utilisez un sous-compte plus précis ; (2) le compte a été désactivé — contactez votre administrateur.

---

**Q : Peut-on lettrer partiellement (ex : payer 30 000 sur une facture de 50 000) ?**  
R : Non, SYSCOHADA interdit le lettrage partiel. Pour une situation de paiement partiel, il faut créer deux écritures : une pour le montant payé (que vous pourrez lettrer), une pour le reste à payer (qui reste en attente).

---

**Q : Quelle est la différence entre "Clôturer" et "Archiver" une période ?**  
R : **Clôturée** : la période est fermée, aucune écriture ne peut y être ajoutée, mais elle reste visible et réouvrable par un admin. **Archivée** : état final — la période est définitivement fermée et n'apparaît plus dans les listes actives.

---

**Q : L'export Sage fonctionne-t-il avec toutes les versions de Sage ?**  
R : Oui, avec les formats disponibles : choisissez **Sage 100** pour Sage Comptabilité 100, **Latin-1** si vous utilisez une version antérieure à 2018 qui ne gère pas l'UTF-8.

---

**Q : La TVA est calculée automatiquement lors de la saisie d'écriture ?**  
R : Non — en comptabilité SYSCOHADA, c'est le comptable qui saisit manuellement les lignes TVA (compte `4452x` pour la déductible, `4455x` pour la collectée). Les écritures générées automatiquement depuis les factures et paiements incluent déjà les lignes TVA correctes.

---

**Q : Que se passe-t-il si je dépose une déclaration TVA avec une erreur ?**  
R : Une déclaration déposée est irréversible dans le système. Contactez directement la DGI Cameroun pour déposer une déclaration rectificative. En interne, ajoutez une note dans la déclaration suivante pour tracer l'ajustement.

---

*Document généré le 23 mai 2026 — InvoiceHub v2.0 — Bridge Technologies Solutions*
