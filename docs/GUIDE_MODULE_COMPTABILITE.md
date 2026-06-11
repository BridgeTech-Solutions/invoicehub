# Guide utilisateur — Module Comptabilité SYSCOHADA

**InvoiceHub v2 — Bridge Technologies Solutions, Douala**

Ce guide décrit le module de comptabilité tel qu'il fonctionne réellement dans l'application : le plan comptable, les journaux, la saisie et la validation des écritures, la balance et le grand livre, le lettrage, les périodes fiscales, les déclarations de TVA et l'export comptable.

> ℹ️ **Statut :** le module est développé et en cours de validation. Certains états (Bilan, Compte de résultat, clôture annuelle automatique) ne sont **pas encore disponibles** — voir la section « Ce qui n'est pas encore disponible ».

---

## Vue d'ensemble

| Écran | Rôle |
|---|---|
| **Comptabilité** (tableau de bord) | Produits, charges et résultat du mois en cours |
| **Plan comptable** | Gérer les comptes SYSCOHADA (classes 1 à 9) |
| **Journaux comptables** | Gérer les journaux (ventes, achats, banque, caisse, OD…) |
| **Écritures comptables** | Saisir, valider, annuler et extourner les écritures |
| **Balance & Grand livre** | Solde de chaque compte et détail des mouvements |
| **Lettrage des comptes** | Rapprocher les lignes qui se soldent (facture ↔ règlement) |
| **Périodes fiscales** | Ouvrir, clôturer et rouvrir les périodes |
| **Déclarations TVA** | Préparer et soumettre la TVA |
| **Export comptable** | Exporter les écritures au format Sage (CSV) |

---

## Comprendre les bases (à savoir pour expliquer)

### Débit / Crédit et la partie double
Toute opération s'enregistre sur **au moins deux comptes** : un montant au **débit**, un montant au **crédit**. La règle d'or : **le total des débits doit toujours être égal au total des crédits**. C'est ce qu'on appelle la **partie double**. Une écriture déséquilibrée est refusée par le logiciel.

> Exemple : une vente de 1 180 000 F TTC (1 000 000 HT + 180 000 TVA) →
> Débit **411** Client 1 180 000 · Crédit **701** Vente 1 000 000 · Crédit **443** TVA collectée 180 000. Total débit = total crédit = 1 180 000. ✔️

**Pourquoi ça s'équilibre toujours — l'équation comptable.** La partie double découle d'une équation fondamentale : **Actif = Passif + Capitaux propres** (ce que l'entreprise possède = comment c'est financé). Chaque opération a deux faces : une **ressource** (l'origine de la valeur) et un **emploi** (sa destination). Par convention, l'**emploi** se note au **débit** et la **ressource** au **crédit**. Comme tout emploi a une ressource du même montant, Σ débits = Σ crédits pour chaque écriture — et le bilan reste équilibré en permanence.

**Le sens débit/crédit selon le type de compte :**

| Type de compte | Augmente au | Diminue au |
|---|---|---|
| **Actif** (immobilisations, stocks, banque, clients 41) | Débit | Crédit |
| **Passif / ressources** (capital, dettes, fournisseurs 40) | Crédit | Débit |
| **Charges** (classe 6) | Débit | — |
| **Produits** (classe 7) | Crédit | — |

> Le **résultat** de l'exercice = Produits (soldes créditeurs de la classe 7) − Charges (soldes débiteurs de la classe 6).

### Le plan comptable
C'est la liste de tous les **comptes** utilisables, organisés par **classes SYSCOHADA** :

| Classe | Nature |
|---|---|
| 1 | Capitaux (capital, réserves, emprunts) |
| 2 | Immobilisations |
| 3 | Stocks |
| 4 | Tiers (clients 41, fournisseurs 40, État 44…) |
| 5 | Trésorerie (banque 52, caisse 57) |
| 6 | Charges |
| 7 | Produits |
| 8 | Comptes de résultat |
| 9 | Comptabilité analytique |

Chaque compte a une **nature** : *débit normal* (classes 1 à 6) ou *crédit normal* (classe 7). Le logiciel la déduit automatiquement du numéro.

### Les journaux
Un **journal** regroupe les écritures de même nature. Les journaux typiques :

| Type | Usage |
|---|---|
| **Ventes** (JV) | Factures clients |
| **Achats** (JA) | Factures fournisseurs |
| **Banque** (JB) | Mouvements bancaires |
| **Caisse** (JC) | Mouvements d'espèces |
| **Opérations diverses** (OD) | Écritures manuelles, régularisations |
| **À-nouveaux / Clôture** | Ouverture et clôture d'exercice |

### Le lettrage
**Lettrer**, c'est rapprocher les lignes d'un même compte de tiers qui s'annulent : par exemple une **facture** (débit 411) et son **règlement** (crédit 411). Une fois rapprochées, elles reçoivent un même **code lettre** (A, B, C…) et sortent de la liste des opérations « non soldées ». Cela permet de voir d'un coup d'œil ce qui reste **dû** ou **à encaisser**.

### La TVA
- **TVA collectée** : la TVA facturée à vos clients (vous la devez à l'État).
- **TVA déductible** : la TVA payée à vos fournisseurs (l'État vous la rembourse / vous la déduisez).
- **TVA nette = collectée − déductible.** Si positive → montant à verser à la DGI ; si négative → crédit de TVA reportable.

### La période fiscale
Une **période** (généralement un mois) regroupe les écritures d'un intervalle de dates. Elle a un statut :
- **Ouverte** : on peut y saisir des écritures
- **Clôturée** : plus de saisie, mais réouverture possible
- **Verrouillée** : définitivement figée, aucune réouverture

### La contre-passation (extourne)

**Le problème.** Une écriture **validée est figée** : on ne peut ni la modifier, ni la supprimer — sinon on créerait un trou dans la piste d'audit, interdit en comptabilité. Comment corriger ou annuler une écriture validée, alors ?

**La solution : la contre-passation.** C'est une **nouvelle écriture qui inverse exactement** l'écriture d'origine : on permute le débit et le crédit de chaque ligne. Les deux écritures s'additionnent à **zéro** → l'effet comptable est neutralisé, tout en **conservant les deux pièces** dans les journaux (traçabilité intacte).

**Comment l'écriture est créée (la mécanique) :**
1. On reprend **chaque ligne** de l'écriture validée.
2. On **permute débit et crédit** : ce qui était au débit passe au crédit, et inversement.
3. On crée une **nouvelle écriture**, datée du jour, avec un **nouveau numéro**, libellée « EXTOURNE — *[libellé d'origine]* ».
4. L'écriture d'origine reste **visible** mais est marquée comme neutralisée.

**Exemple concret.** Écriture de vente validée à contre-passer :

| Compte | Débit | Crédit |
|---|---|---|
| 411 Client | 1 180 000 | |
| 701 Ventes | | 1 000 000 |
| 443 TVA collectée | | 180 000 |

Sa contre-passation (extourne) — débit et crédit permutés :

| Compte | Débit | Crédit |
|---|---|---|
| 411 Client | | 1 180 000 |
| 701 Ventes | 1 000 000 | |
| 443 TVA collectée | 180 000 | |

Résultat sur chaque compte : solde net **= 0**. La créance client est annulée, le produit de vente est annulé, et la TVA collectée est récupérée — proprement, sans rien effacer.

> **Corriger une écriture validée = 2 temps** : (1) on **extourne** l'écriture fausse (elle s'annule), puis (2) on **saisit l'écriture correcte**. Les trois pièces restent tracées.

**Dans InvoiceHub, la contre-passation est :**
- **Automatique** lors de l'**annulation d'une facture** (génère l'avoir), de l'**annulation d'un paiement**, ou de la **contestation d'une facture fournisseur** — le système inverse exactement l'écriture d'origine et marque l'originale comme annulée.
- **Manuelle** via le bouton **Extourner** sur une écriture validée (écran Écritures comptables).
- **Impossible si la période est verrouillée** : il faut alors passer l'extourne sur une période ouverte.

---

## Comptabilisation automatique (le moteur comptable)

> **Point fort du module.** Vous ne saisissez **pas** les écritures courantes à la main : l'application les **génère automatiquement** à chaque événement de gestion, selon les règles SYSCOHADA. Les écritures sont créées en **brouillon**, puis **validées** par le comptable (contrôle humain avant intégration).

| Événement | Écriture générée | Journal |
|---|---|---|
| Facture client **émise** | Dr **411** Client (TTC) / Cr **70x** Ventes (HT) / Cr **TVA collectée** | Ventes |
| Règlement client **reçu** | Dr **52x** Banque / Cr **411** Client | Banque |
| Facture client **annulée** / avoir | Contre-passation : Dr **70x** + Dr **TVA** / Cr **411** | OD / Ventes |
| Escompte de règlement accordé | Dr **673** Escomptes accordés / Cr **411** Client | OD |
| Facture **fournisseur** validée | Dr **60x** Achats (HT) + Dr **TVA déductible** / Cr **401** Fournisseur | Achats |
| Paiement **fournisseur** | Dr **401** Fournisseur / Cr **52x** Banque | Banque |
| Facture fournisseur **contestée** | Extourne (contre-passation) | Achats |
| **Dépense** payée | Dr **6x** Charge / Cr **52x** Banque | OD |
| **Stock — réception** (inventaire permanent) | Dr **311** Stock / Cr **603** Variation de stock | OD |
| **Stock — vente** | Dr **603** Coût des ventes / Cr **311** Stock | OD |
| **Stock — rebut / perte** | Dr **603x** Perte / Cr **311** Stock | OD |

**Ce qu'il faut retenir :**
- **Inventaire permanent SYSCOHADA** — chaque mouvement de stock est comptabilisé en temps réel, valorisé au **CMUP**.
- **Lettrage automatique** — quand une facture client est intégralement réglée, la facture (411) et son/ses règlement(s) sont **lettrés automatiquement** ; idem côté fournisseur (401).
- **Comptes auxiliaires** — chaque client/fournisseur peut avoir son propre sous-compte (411xxx / 401xxx).
- **Aucun compte codé en dur** — tous les comptes d'imputation (clients, ventes, TVA, banque, achats, charges…) sont **paramétrables** dans les réglages de l'entreprise et au niveau produit / catégorie → adaptable à tout plan comptable OHADA.
- **Numérotation continue** par journal et par année (ex. `JV-2026-00001`), sans trou.

---

## Les écrans en détail

### 1. Tableau de bord comptable

**Menu : Comptabilité**

Affiche pour le **mois en cours** :
- Les **produits** (classe 7)
- Les **charges** (classe 6)
- Le **résultat net** (produits − charges)

> Seules les écritures **validées** sont prises en compte dans ces chiffres.

---

### 2. Plan comptable

**Menu : Comptabilité → Plan comptable**

Liste tous les comptes avec leur numéro, intitulé, classe et nature.

**Filtres :** recherche (numéro ou nom), classe (1 à 9), comptes actifs.

**Créer un compte :** numéro, intitulé, (nom court, compte parent, description optionnels). La **classe** et la **nature** sont déduites automatiquement du numéro (un compte commençant par 7 est en crédit normal, sinon débit normal). On peut aussi indiquer si le compte **autorise le lettrage** (comptes de tiers).

**Règles :**
- Les **comptes système SYSCOHADA** ne peuvent être ni modifiés ni supprimés.
- Impossible de supprimer un compte qui porte des **écritures** ou qui a des **sous-comptes**.

---

### 3. Journaux comptables

**Menu : Comptabilité → Journaux comptables**

Liste les journaux actifs avec leur **code**, leur **nom**, leur **type** et le **nombre d'écritures**.

**Créer / modifier un journal :** code, nom, type (ventes, achats, banque, caisse, opérations diverses…).

**Règle :** impossible de supprimer un journal qui contient déjà des écritures.

---

### 4. Écritures comptables

**Menu : Comptabilité → Écritures comptables**

C'est le cœur du module. La liste affiche chaque écriture avec son **numéro** (généré automatiquement, ex. `JV-2026-00001`), sa **date**, son **journal**, son **libellé**, son **statut** et le **nombre de lignes**.

> La **plupart des écritures arrivent automatiquement** via le moteur comptable (voir « Comptabilisation automatique »). La saisie manuelle décrite ci-dessous sert surtout aux **opérations diverses (OD)** : régularisations, à-nouveaux, écritures de paie, etc.

**Filtres :** recherche (numéro ou libellé), journal, période, statut, dates.

#### Créer une écriture (« Nouvelle écriture »)

Champs en haut :
- **Journal** *(obligatoire)*
- **Date**
- **Libellé** *(obligatoire)* — ex. « Facture SABC du 15/01/2026 »

Puis le tableau des lignes — bouton **Ajouter une ligne** — avec les colonnes :

| Colonne | Description |
|---|---|
| **Compte** | Numéro de compte (ex. 411000) |
| **Libellé ligne** | Texte de la ligne (reprend le libellé de l'écriture par défaut) |
| **Débit** | Montant au débit |
| **Crédit** | Montant au crédit |

Un indicateur d'**équilibre** affiche en temps réel le total débit, le total crédit et l'écart. **Le bouton d'enregistrement reste désactivé tant que l'écriture n'est pas équilibrée** (débit = crédit) et que le journal, la date et le libellé ne sont pas renseignés.

> La **période fiscale** est détectée automatiquement à partir de la date. Si aucune période **ouverte** ne couvre cette date, l'écriture est refusée.

#### Statuts d'une écriture

| Statut | Signification |
|---|---|
| **Brouillon** (draft) | Modifiable et supprimable librement |
| **Validée** (validated) | Figée — plus modifiable ni supprimable |
| **Verrouillée** (locked) | Figée par la clôture de période |
| **Annulée** (cancelled) | Brouillon annulé |

#### Actions
- **Modifier** : uniquement sur un **brouillon**.
- **Valider** : passe le brouillon en *validée*. Après validation, **l'écriture ne peut plus être modifiée ni supprimée**.
- **Annuler** : possible uniquement sur un brouillon. Une écriture **validée ne s'annule pas** — on utilise l'**extourne**.
- **Extourner (contre-passation)** : crée une **nouvelle écriture inverse** (débit et crédit permutés, libellé « EXTOURNE — … »). C'est la méthode comptable correcte pour neutraliser une écriture validée sans la supprimer. L'extourne est impossible si la période est verrouillée.

---

### 5. Balance & Grand livre

**Menu : Comptabilité → Balance & Grand livre**

- **Balance** : pour chaque compte, le **total débit**, le **total crédit** et le **solde** (débit − crédit). Filtrable par **période** et par **classe**.
- **Grand livre** : le **détail des mouvements** d'un compte donné (date, n° de pièce, journal, libellé, débit, crédit), pour pointer ligne par ligne.

> Seules les écritures **validées** (ou verrouillées) alimentent la balance et le grand livre. Les brouillons n'y figurent pas.

---

### 6. Lettrage des comptes

**Menu : Comptabilité → Lettrage des comptes**

On choisit un **compte de tiers** (ex. 411 Clients) et on voit ses lignes **non lettrées**. On coche les lignes qui se soldent (une facture au débit + son règlement au crédit) puis on **lettre la sélection**.

**Règles du lettrage :**
- Au moins **2 lignes**, toutes sur le **même compte**
- La sélection doit être **équilibrée** (total débit = total crédit)
- Aucune ligne déjà lettrée
- Les lignes reçoivent un **code lettre** automatique (A, B, C… puis AA, AB…)

On peut **délettrer** un groupe (le code est retiré, les lignes redeviennent « non soldées »).

> Utilité : tout ce qui reste **non lettré** sur le compte client = factures non encore réglées (ce qui vous est dû).

---

### 7. Périodes fiscales

**Menu : Comptabilité → Périodes fiscales**

Liste les périodes avec leur **exercice**, leurs **dates** et leur **statut** (Ouverte / Clôturée / Verrouillée).

**Actions :**
- **Créer une période** : nom, exercice, type (mois par défaut), date de début, date de fin.
- **Clôturer** : une période *ouverte* passe en *clôturée* → plus de saisie possible dessus.
- **Rouvrir** : une période *clôturée* repasse en *ouverte*. ⚠️ Une période **verrouillée ne peut pas être rouverte**.

---

### 8. Déclarations TVA

**Menu : Comptabilité → Déclarations TVA**

Prépare la TVA sur une période :
- **TVA collectée** (facturée aux clients)
- **TVA déductible** (payée aux fournisseurs)
- **TVA nette** = collectée − déductible

La liste affiche chaque déclaration avec sa période, ses montants, son statut et la date de dépôt.

**Cycle :** une déclaration est créée en **Brouillon**, puis **Soumise** (elle devient figée, avec une date de soumission). Seuls les brouillons peuvent être soumis.

---

### 9. Export comptable (Sage)

**Menu : Comptabilité → Export comptable**

Génère un fichier **CSV compatible Sage** des écritures, avec les colonnes :
`Journal ; Date ; Numéro ; Compte ; Libellé ; Débit ; Crédit`

**Filtres :** dates, journaux, période. Seules les écritures **validées / verrouillées** sont exportées. Les montants utilisent la **virgule décimale** (format français).

> Utilité : transmettre la comptabilité à un cabinet ou l'importer dans Sage.

---

## Règles importantes (à retenir absolument)

1. **Équilibre obligatoire** — toute écriture doit avoir total débit = total crédit, sinon elle est refusée (« Écriture non équilibrée »).
2. **Une écriture validée est figée** — on ne peut plus la modifier ni la supprimer ; pour la corriger, on **extourne** (écriture inverse).
3. **On ne saisit que dans une période ouverte** — impossible d'écrire dans une période clôturée ou verrouillée.
4. **Seules les écritures validées comptent** — balance, grand livre, tableau de bord et export n'utilisent que les écritures validées/verrouillées, jamais les brouillons.
5. **Les comptes système ne se touchent pas** — les comptes SYSCOHADA standards ne sont ni modifiables ni supprimables.
6. **Pas de suppression si historique** — un compte avec écritures, ou un journal avec écritures, ne peut pas être supprimé.

---

## Cycle de vie d'une écriture

```
Brouillon ──valider──► Validée ──extourner──► (nouvelle écriture inverse en Brouillon)
   │                      │
   ├─ modifier            └─ (clôture période) ─► Verrouillée
   ├─ supprimer / annuler
```

---

## Ce qui n'est pas encore disponible

Pour rester transparent en présentation, ces éléments **ne sont pas encore dans l'application** :
- **Bilan SYSCOHADA** (actif / passif) automatique
- **Compte de résultat** automatique
- **Clôture annuelle automatique** (génération de l'écriture de résultat 13x et report à nouveau) — aujourd'hui on clôture **période par période** manuellement
- **Pré-remplissage automatique** de la déclaration de TVA depuis les écritures et **export PDF DGI** (la TVA est bien **comptabilisée** automatiquement à chaque facture, mais la déclaration se renseigne encore manuellement)

> Le **rapprochement bancaire** existe bien, mais dans le **module Banque** séparé (pas dans la comptabilité).

---

## Questions d'expert (face à un DAF / comptable)

**Les écritures sont-elles saisies à la main ou générées automatiquement ?**
Les écritures courantes (ventes, encaissements, achats, paiements fournisseurs, dépenses, mouvements de stock) sont **générées automatiquement** par le moteur comptable à chaque événement, en **brouillon**. Le comptable les **revoit et les valide**. La saisie manuelle est réservée aux **OD**.

**Quel est le schéma d'écriture d'une vente ?**
Débit **411** Client pour le TTC ; Crédit **70x** Ventes pour le HT ; Crédit du compte de **TVA collectée** pour la taxe. Exemple : 1 180 000 TTC → Dr 411 = 1 180 000 / Cr 701 = 1 000 000 / Cr TVA = 180 000.

**Gérez-vous l'inventaire permanent ?**
Oui. Chaque mouvement de stock génère son écriture (réception : Dr 311 / Cr 603 ; vente : Dr 603 / Cr 311 ; perte : Dr 603x / Cr 311), valorisé au **CMUP**.

**Le lettrage est-il automatique ?**
Oui sur les comptes clients (411) et fournisseurs (401) : dès qu'une facture est intégralement réglée, la facture et son ou ses règlements sont lettrés automatiquement. Le lettrage manuel reste possible.

**Comment gérez-vous la TVA ?**
La TVA collectée (ventes) et déductible (achats) est comptabilisée automatiquement à chaque facture. La déclaration calcule la **TVA nette = collectée − déductible** (le pré-remplissage automatique de la déclaration n'est pas encore en place).

**Peut-on modifier ou supprimer une écriture validée ?**
Non. Une écriture validée est figée. La seule façon de la neutraliser est l'**extourne** (contre-passation), ce qui préserve la piste d'audit. Les annulations de factures et avoirs sont d'ailleurs **contre-passés automatiquement**.

**La numérotation est-elle continue et sans trou ?**
Oui. Chaque journal a sa propre séquence par année (ex. `JV-2026-00001`, `JV-2026-00002`…), sans rupture — conforme aux exigences légales.

**Les comptes d'imputation sont-ils figés dans le code ?**
Non. Tous les comptes (clients, fournisseurs, ventes, achats, TVA, banque, charges, stock…) sont **paramétrables** : réglages de l'entreprise, comptes auxiliaires par client/fournisseur, comptes de vente par produit ou catégorie. Le système s'adapte au plan comptable OHADA en vigueur.

**Le plan comptable est-il bien SYSCOHADA ?**
Oui, organisé en classes 1 à 9, avec des **comptes système** protégés (non modifiables, non supprimables) et des comptes auxiliaires pour les tiers.

**Produit-il le bilan et le compte de résultat ?**
Pas encore automatiquement (voir « Ce qui n'est pas encore disponible »). La **balance** fournit tous les soldes nécessaires, et l'**export Sage** permet de transmettre la comptabilité à un cabinet pour l'établissement des états financiers.

---

## Questions fréquentes

**Comment corriger une écriture déjà validée ?**
On ne la modifie pas : on fait une **extourne** (contre-passation), qui crée l'écriture inverse, puis on ressaisit l'écriture correcte. C'est la pratique comptable normale.

**Pourquoi je ne peux pas enregistrer mon écriture ?**
Soit elle n'est **pas équilibrée** (débit ≠ crédit), soit il manque le journal, la date ou le libellé, soit **aucune période ouverte** ne couvre la date saisie.

**Quelle différence entre Annuler et Extourner ?**
**Annuler** ne marche que sur un **brouillon**. Pour une écriture **validée**, on **extourne** (on ne supprime jamais une écriture validée, pour garder la traçabilité).

**À quoi sert le lettrage ?**
À rapprocher une facture et son règlement sur un compte de tiers. Ce qui reste **non lettré** sur le compte client correspond aux **factures impayées**.

**Quelle est la différence entre période clôturée et verrouillée ?**
**Clôturée** = plus de saisie mais on peut **rouvrir**. **Verrouillée** = définitif, **aucune réouverture**.

**Les brouillons apparaissent-ils dans la balance ?**
Non. Seules les écritures **validées** (ou verrouillées) alimentent la balance, le grand livre, le tableau de bord et l'export.

**Comment transmettre la compta au cabinet comptable ?**
Via **Export comptable** : un fichier CSV format Sage des écritures validées, filtrable par période et par journal.

**Peut-on générer le bilan et le compte de résultat ?**
Pas encore automatiquement dans l'application. La **balance** fournit toutes les données nécessaires en attendant. (Voir « Ce qui n'est pas encore disponible ».)

---

*Guide utilisateur — InvoiceHub v2, Bridge Technologies Solutions, Douala, Cameroun.*
