# Comprendre les écritures comptables — guide pour non-comptables

> Ce guide explique, **à partir de zéro et sans jargon**, comment fonctionnent les écritures comptables qu'InvoiceHub génère automatiquement. Objectif : que tu comprennes la logique, que tu suives ce que fait l'application, et que tu puisses répondre aux questions d'un comptable ou d'un DAF.

---

## 1. C'est quoi une écriture comptable ?

Une **écriture**, c'est la façon de **raconter une opération** (une vente, un paiement, un achat…) dans les comptes de l'entreprise.

La règle de base de la comptabilité : **chaque opération est racontée deux fois.**
- D'un côté : **d'où vient la valeur** (l'origine)
- De l'autre : **où elle va** (la destination)

C'est pour ça qu'on parle de **comptabilité en partie double** : toujours deux côtés, et les deux montants sont **égaux**.

> **Image simple :** si 100 000 F entrent dans ta caisse parce qu'un client a payé, il y a forcément **une raison** (le client te devait de l'argent). La compta note les **deux** : l'argent qui entre **et** la raison.

---

## 2. Débit et Crédit — la seule chose à vraiment comprendre

C'est LE point qui bloque tout le monde. Alors mettons les choses au clair :

> ⚠️ **Oublie le sens bancaire des mots.** Sur ton relevé bancaire, « débit » = argent qui sort. **En comptabilité, ce n'est PAS ça.**
> En comptabilité, **Débit** et **Crédit** sont juste les noms de **deux colonnes** : la colonne de **gauche** (Débit) et la colonne de **droite** (Crédit). Rien d'autre.

Chaque écriture a donc deux colonnes, et **le total de gauche = le total de droite**. Toujours.

```
        DÉBIT (gauche)   |   CRÉDIT (droite)
        ─────────────────┼──────────────────
        ...montants...   |   ...montants...
        ─────────────────┼──────────────────
        TOTAL = X        |   TOTAL = X   (les deux sont égaux)
```

### Sur quel côté un compte « augmente » ?

Chaque compte a un côté « naturel » où il **augmente** :

| Famille de comptes | Exemples | Augmente au… |
|---|---|---|
| Ce que l'entreprise **possède** (actif) | Banque, caisse, stock, **ce que les clients lui doivent** | **DÉBIT** (gauche) |
| Ce que l'entreprise **doit** (passif) | Dettes, **ce qu'elle doit aux fournisseurs**, capital | **CRÉDIT** (droite) |
| Ce qu'elle **dépense** (charges) | Achats, salaires, loyer, électricité | **DÉBIT** (gauche) |
| Ce qu'elle **gagne** (produits) | Ventes, prestations | **CRÉDIT** (droite) |

Et pour **diminuer** un compte, on écrit sur le **côté opposé**.

> **Moyen mnémotechnique :**
> « Ce que je **possède** ou ce que je **dépense** → à **gauche** (débit).
> Ce que je **dois** ou ce que je **gagne** → à **droite** (crédit). »

---

## 3. Le « compte en T » (l'outil visuel)

Les comptables dessinent chaque compte comme un **T** : gauche = débit, droite = crédit.

```
         Compte BANQUE
    Débit       |     Crédit
   (entrées)    |   (sorties)
   1 180 000    |
```
Quand l'argent entre en banque, on écrit à gauche (la banque, un actif, augmente). Quand il sort, à droite.

---

## 4. Les familles de comptes que tu croises tout le temps

Pas besoin de connaître les milliers de comptes. En pratique, tu reverras toujours les mêmes :

| Numéro | Nom | Famille | C'est quoi |
|---|---|---|---|
| **411** | Clients | Actif | Ce que les clients te doivent |
| **401** | Fournisseurs | Passif (dette) | Ce que tu dois aux fournisseurs |
| **52x** | Banque | Actif | Ton argent en banque |
| **57x** | Caisse | Actif | Ton argent en espèces |
| **70x** | Ventes | Produit | Ce que tu gagnes en vendant |
| **60x** | Achats | Charge | Ce que tu achètes |
| **44x** | État / TVA | Passif ou Actif | TVA à reverser ou à récupérer |
| **6xx** | Charges | Charge | Toutes tes dépenses |
| **7xx** | Produits | Produit | Tous tes revenus |

---

## 5. Les écritures de ton app, expliquées une par une

Voici ce qu'InvoiceHub crée **tout seul**, et **pourquoi** à chaque fois.

### a) Tu émets une facture (vente à crédit)

**Ce qui se passe en vrai :** tu vends pour 1 180 000 F TTC (1 000 000 HT + 180 000 de TVA). Le client paiera plus tard.

**Le raisonnement :**
- Le client te **doit** maintenant 1 180 000 → la créance client (actif) **augmente** → **Débit 411**.
- Tu as **gagné** 1 000 000 de revenu → **Crédit 701**.
- Tu as encaissé pour l'État 180 000 de TVA que tu lui **dois** → **Crédit 443**.

| Compte | Débit | Crédit |
|---|---|---|
| 411 Client | 1 180 000 | |
| 701 Ventes | | 1 000 000 |
| 443 TVA collectée | | 180 000 |
| **Total** | **1 180 000** | **1 180 000** |

✔️ Gauche = droite.

### b) Le client paie (encaissement)

**Ce qui se passe :** le client verse les 1 180 000 sur ton compte.

**Le raisonnement :**
- L'argent arrive → la banque (actif) **augmente** → **Débit 52x**.
- Le client ne te doit plus rien → la créance client **diminue** → **Crédit 411**.

| Compte | Débit | Crédit |
|---|---|---|
| 521 Banque | 1 180 000 | |
| 411 Client | | 1 180 000 |

> 👀 **Remarque clé :** le compte 411 a été mis au **débit** à la facture, puis au **crédit** au paiement. Les deux **s'annulent** → le client est « soldé ». C'est ça le **lettrage** : rapprocher la facture et son paiement pour voir qu'il ne reste rien à encaisser.

### c) Tu reçois une facture d'un fournisseur (achat à crédit)

- Tu as une **charge** d'achat → **Débit 60x**.
- La TVA payée, tu pourras la **récupérer** → **Débit 445** (TVA déductible).
- Tu **dois** payer le fournisseur plus tard → **Crédit 401**.

| Compte | Débit | Crédit |
|---|---|---|
| 601 Achats | 1 000 000 | |
| 445 TVA déductible | 180 000 | |
| 401 Fournisseur | | 1 180 000 |

### d) Tu paies le fournisseur

- Tu ne lui **dois plus** → la dette **diminue** → **Débit 401**.
- L'argent **sort** de la banque → la banque **diminue** → **Crédit 52x**.

| Compte | Débit | Crédit |
|---|---|---|
| 401 Fournisseur | 1 180 000 | |
| 521 Banque | | 1 180 000 |

### e) Tu paies une dépense (ex : loyer)

- C'est une **charge** → **Débit 6x**.
- L'argent sort → **Crédit 52x**.

| Compte | Débit | Crédit |
|---|---|---|
| 622 Loyer | 500 000 | |
| 521 Banque | | 500 000 |

### f) Tu annules une facture (avoir / contre-passation)

On **ne supprime jamais** une facture émise. On passe l'écriture **inverse** (on permute débit et crédit) :

| Compte | Débit | Crédit |
|---|---|---|
| 701 Ventes | 1 000 000 | |
| 443 TVA collectée | 180 000 | |
| 411 Client | | 1 180 000 |

Les deux écritures (la facture + son annulation) s'additionnent à **zéro** : tout est neutralisé, mais rien n'est effacé.

### g) Mouvement de stock (inventaire permanent)

Quand un produit entre ou sort du stock, l'app passe aussi une écriture (le stock est un actif) :
- **Réception** : le stock augmente → Débit 311 / Crédit 603
- **Vente** : le stock diminue → Débit 603 (coût) / Crédit 311

---

## 6. La règle d'or : Débit = Crédit

Dans **chaque** écriture, le total de la colonne Débit **est égal** au total de la colonne Crédit. Si ce n'est pas le cas, l'écriture est **fausse** — et InvoiceHub la **refuse** (« écriture non équilibrée »).

C'est ce qui garantit que la comptabilité « tombe juste » en permanence.

---

## 7. Mémo express (antisèche)

| Opération | Débit (gauche) | Crédit (droite) |
|---|---|---|
| **Vente** (facture) | 411 Client | 70x Ventes + 44 TVA collectée |
| **Encaissement** client | 52x Banque | 411 Client |
| **Achat** (facture fournisseur) | 60x Achats + 44 TVA déductible | 401 Fournisseur |
| **Paiement** fournisseur | 401 Fournisseur | 52x Banque |
| **Dépense** | 6x Charge | 52x Banque |
| **Annulation** (avoir) | inverse de la vente | inverse de la vente |

**Les 3 réflexes :**
1. L'argent qui **entre** en banque → **Débit** banque. Qui **sort** → **Crédit** banque.
2. Un client qui **doit** → **Débit** 411. Qui **paie** → **Crédit** 411.
3. Total **gauche** = total **droite**, toujours.

---

## 8. Questions que tu te poses sûrement

**Pourquoi « débit » ne veut pas dire « argent qui sort » ?**
Parce qu'en comptabilité, débit = simplement « colonne de gauche ». Pour le compte banque, une entrée d'argent est bien un débit (la banque, un actif, augmente). C'est l'inverse de la logique du relevé bancaire (qui est vu du point de vue de **la banque**, pas du tien).

**Pourquoi deux lignes minimum à chaque fois ?**
Parce que toute opération a une origine et une destination. Une seule ligne ne raconterait que la moitié de l'histoire.

**Qui écrit toutes ces écritures ?**
Dans InvoiceHub, **personne ne les saisit à la main** pour les opérations courantes : l'application les **génère automatiquement** à chaque facture, paiement, achat ou dépense. Un comptable les **vérifie et valide** ensuite.

**Est-ce que je dois savoir tout ça pour utiliser l'app ?**
Non. L'app fait le travail. Ce guide sert juste à **comprendre** ce qu'elle fait, pour expliquer et répondre aux questions.

**À quoi ça sert au final ?**
À produire, à partir de toutes ces écritures, la **balance** (où en est chaque compte), puis le **bilan** et le **compte de résultat** — la photo financière de l'entreprise.

---

*Guide pédagogique — InvoiceHub v2, Bridge Technologies Solutions. À lire avant le guide « Module Comptabilité » pour les détails des écrans.*
