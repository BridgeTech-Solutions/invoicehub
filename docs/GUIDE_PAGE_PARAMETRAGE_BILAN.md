# Guide d'utilisation — Page « Paramétrage du bilan »

> Où : **Comptabilité → États financiers → Paramétrage du bilan**
> Pour qui : DAF, comptable, expert-comptable (droit d'écriture comptable requis)
> Pour la doc technique (modèle de données, API), voir [GUIDE_PARAMETRAGE_BILAN.md](GUIDE_PARAMETRAGE_BILAN.md).

---

## 1. À quoi sert cette page

Le bilan regroupe tes comptes dans des **postes** (Clients, Fournisseurs, Stocks, Banque…). Chaque poste additionne un ou plusieurs comptes du plan comptable.

Cette page te permet de **voir et de modifier quels comptes vont dans quel poste**, sans passer par un développeur. C'est l'équivalent des « états paramétrables » de Sage : le rattachement poste → comptes est de la **donnée éditable**.

**Exemple :** le poste « Clients » additionne les comptes `411`, `412`, `416`… Si tu crées un nouveau compte client, tu peux l'ajouter ici pour qu'il entre dans le bilan au bon endroit.

---

## 2. Comment lire la page

La page affiche **deux colonnes** : **Actif** (à gauche) et **Passif** (à droite), chacune découpée par **masse** (les grands regroupements, en en-têtes bleu marine).

```
ACTIF                                  PASSIF
┌─ AZ · ACTIF IMMOBILISÉ ───────┐      ┌─ CP · CAPITAUX PROPRES ──────┐
│ AA  Capital souscrit…  [Éditer]│      │ CA  Capital          [Éditer]│
│ AF  Immobilisations…   [Éditer]│      │ CH  Résultat net     [Éditer]│
├─ BK · ACTIF CIRCULANT ────────┤      ├─ DP · PASSIF CIRCULANT ──────┤
│ BI  Clients            [Éditer]│      │ DI  Fournisseurs     [Éditer]│
│     41 débiteurs · −491        │      │     40 créditeurs            │
│ BJ  Autres créances    [Éditer]│      │ DJ  Dettes fiscales  [Éditer]│
└────────────────────────────────┘      └──────────────────────────────┘
```

Chaque ligne = un **poste**, avec :

| Élément | Signification | Exemple |
|---|---|---|
| **Code** | L'identifiant SYSCOHADA du poste | `BI` |
| **Libellé** | Le nom affiché dans le bilan | Clients |
| **Résumé des comptes** | Les comptes rattachés (en petit, dessous) | `41 débiteurs · −491` |
| **Bouton Éditer** | Ouvre le panneau de modification | |

En haut de la page, un bouton **« Réinitialiser »** remet tout le modèle au standard SYSCOHADA.

### Comment lire le résumé des comptes
- `41` = tous les comptes commençant par 41 (411, 4111, 412…).
- `41 débiteurs` = on ne prend que ceux au solde **débiteur**.
- `− 491` = on **retranche** les comptes 491 (les dépréciations).
- `(hors 478, 479)` = on **exclut** ces comptes du groupe.

---

## 3. Modifier un poste

Clique **« Éditer »** sur un poste → un panneau (drawer) s'ouvre à droite.

### Le libellé
Le nom du poste tel qu'il apparaît dans le bilan. Modifiable librement.

### Les « sources »
Une **source** = un groupe de comptes + une règle d'agrégation. Un poste peut en avoir **plusieurs**. Pour chaque source :

| Champ | Ce que c'est |
|---|---|
| **Colonne** *(actif uniquement)* | Le montant alimente la colonne **Valeur brute** ou **Amort./Dépréciation** |
| **Règle de signe** | Comment agréger les soldes (voir §4) |
| **Comptes / préfixes** | Les comptes captés (ex. `41` capte tous les 41xx), séparés par des virgules |
| **Exclure** | Préfixes à retirer du groupe (ex. exclure `478`) — optionnel |

- **« Ajouter »** crée une nouvelle source.
- L'icône 🗑 supprime une source.
- **« Enregistrer »** applique les changements.

---

## 4. Les 4 règles de signe

C'est le point clé. Chaque source agrège les soldes selon une règle. *(Solde = débit − crédit ; positif = débiteur.)*

| Règle | Ce qu'elle prend | Pour quels comptes |
|---|---|---|
| **Débit (brut)** | Le solde tel quel | Comptes naturellement débiteurs : immobilisations, stocks |
| **Crédit** | Le solde inversé | Comptes créditeurs : capitaux, dettes, **amortissements** |
| **Débiteurs seulement** | Seulement les soldes **débiteurs** | Comptes **bifonctionnels** côté **Actif** (un client qui nous doit) |
| **Créditeurs seulement** | Seulement les soldes **créditeurs** | Comptes **bifonctionnels** côté **Passif** (un client qui a payé d'avance) |

### Pourquoi « Débiteurs / Créditeurs seulement » ?
Les comptes de **tiers** (clients 41, fournisseurs 40) sont **bifonctionnels** : le même compte peut être un actif **ou** un passif selon le sens de son solde.

> Le compte `411 Clients` :
> - **débiteur** → le client nous doit → **créance** (Actif, poste BI)
> - **créditeur** → le client a payé d'avance → **dette** (Passif, poste DH)

C'est pour ça que le compte `41` apparaît **deux fois** dans le modèle : « débiteurs seulement » côté Actif, « créditeurs seulement » côté Passif. Ainsi, rien n'est compté deux fois.

---

## 5. Exemple complet : le poste « Clients » (BI)

Il est composé de **2 sources** :

| Source | Colonne | Règle | Comptes |
|---|---|---|---|
| 1 | Brut | Débiteurs seulement | `41` |
| 2 | Amort. | Crédit | `491` (dépréciation clients) |

**Résultat : Net = Brut − Amortissements**
- Brut = ce que les clients nous doivent (41 débiteurs)
- Amort. = les dépréciations sur créances douteuses (491)

---

## 6. Cas particulier : le résultat net

Le poste **« Résultat net de l'exercice » (CH)** est **calculé automatiquement** à partir du compte de résultat (classes 6 & 7). Tu peux modifier son **libellé**, mais **pas ses comptes** — ils sont déterminés par le calcul.

---

## 7. Réinitialiser

Le bouton **« Réinitialiser »** (en haut) remet **tout** le modèle au standard SYSCOHADA d'origine. Toutes tes personnalisations sont perdues. Une confirmation est demandée.

C'est ton filet de sécurité : si tu casses quelque chose, un clic restaure le modèle de base.

---

## 8. Points importants à retenir

- ✅ Modifier un poste **recalcule immédiatement** le bilan et le détail des comptes.
- ⚠️ **Vérifie l'équilibre du bilan** après une modification : un compte oublié ou compté deux fois peut le déséquilibrer (le bandeau « Bilan équilibré / Déséquilibre » te le signale).
- ✅ Un **nouveau compte** apparaît automatiquement dans le bilan s'il commence par un préfixe déjà rattaché (ex. un nouveau `4118` est capté par la source `41`). Sinon, ajoute son préfixe ici.
- ↩️ En cas de doute, **Réinitialiser**.

---

## 9. Workflow type pour ajouter un compte à un poste

1. Tu crées un nouveau compte au **Plan comptable** (ex. `4750` Compte d'attente).
2. Il n'entre dans aucun poste ? Va sur **Paramétrage du bilan**.
3. Trouve le poste où il doit aller (ex. « Autres créances » BJ), clique **Éditer**.
4. Dans une source, ajoute son préfixe (ex. `475`) au champ **Comptes / préfixes**.
5. **Enregistre** → le compte entre désormais dans ce poste.
6. **Vérifie l'équilibre** du bilan.
