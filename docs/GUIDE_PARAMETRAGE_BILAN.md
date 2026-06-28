# Guide — Paramétrage du bilan (« façon Sage »)

> Module : Comptabilité → États financiers → **Paramétrage du bilan**
> Public : Directeur Administratif & Financier (DAF), expert-comptable, développeurs.
> Statut : opérationnel (Bilan). Le compte de résultat reste calculé en interne (voir [Limites](#limites)).

---

## 1. À quoi ça sert

En SYSCOHADA, le **bilan** ne liste pas les comptes un par un : il les regroupe dans des **postes** normalisés (codes `BA`, `BI`, `DJ`, `DZ`…). Chaque poste agrège un ou plusieurs comptes du plan comptable.

Avant, ce rattachement **poste → comptes** était écrit « en dur » dans le code : seul un développeur pouvait le changer. Désormais, c'est **de la donnée éditable** — exactement le principe des *états paramétrables* de Sage :

- la DAF **voit** quels comptes composent chaque poste ;
- elle peut **modifier** ce rattachement (ajouter un compte, changer une règle) **sans développeur** ;
- le bilan se **recalcule immédiatement**.

---

## 2. Les concepts

| Terme | Définition | Exemple |
|---|---|---|
| **Poste (rubrique)** | Une ligne du bilan, identifiée par un code SYSCOHADA | `BI` = Clients |
| **Masse** | Un grand regroupement de postes, avec son sous-total | `BK` = Actif circulant |
| **Source** | Un groupe de comptes rattaché à un poste, avec sa règle | comptes `41` en débiteurs |
| **Préfixe** | Un début de numéro de compte qui capte tous ses sous-comptes | `41` capte `411`, `4111`, `418`… |
| **Règle de signe** | Comment on agrège les soldes de la source | « débiteurs seulement » |
| **Colonne** | Pour l'actif : la valeur va en *Brut* ou en *Amort./Dépréciation* | `491` (dépréc. clients) → Amort. |

Un poste peut combiner **plusieurs sources**. Exemple, le poste **`BI` Clients** :
1. comptes `41` retenus **uniquement s'ils sont débiteurs** → colonne *Brut* ;
2. comptes `491` (dépréciation des clients) → colonne *Amort./Dépréc.*

→ **Net du poste = Brut − Amortissements**.

---

## 3. Les 4 règles de signe

C'est le cœur du modèle. Chaque source agrège les soldes des comptes captés selon une règle. *(Convention : solde = débit − crédit ; positif = débiteur.)*

| Règle | Ce qu'elle fait | Quand l'utiliser |
|---|---|---|
| **Débit (brut)** | Somme des soldes, tels quels | Comptes naturellement débiteurs : immobilisations (`22`), stocks (`31`) |
| **Crédit** | Somme des soldes, signe inversé | Comptes naturellement créditeurs : capitaux (`101`), dettes (`16`), **amortissements** (`28`) |
| **Débiteurs seulement** | Ne retient que les comptes au **solde débiteur** | Comptes **bifonctionnels** côté **Actif** : un client qui nous doit de l'argent (`41` débiteur) |
| **Créditeurs seulement** | Ne retient que les comptes au **solde créditeur** | Comptes **bifonctionnels** côté **Passif** : un client qui nous a payé d'avance (`41` créditeur) |

### Pourquoi « débiteurs / créditeurs seulement » ?

Les comptes de **tiers** (classe 4) et de **trésorerie** (classe 5) sont **bifonctionnels** : le **même** compte peut être un actif **ou** un passif selon le sens de son solde.

> Le compte `411 Clients` :
> - s'il est **débiteur** → le client nous doit → c'est une **créance** (Actif, poste `BI`) ;
> - s'il est **créditeur** → le client a payé d'avance → c'est une **dette** (Passif, poste `DH`).

Le même groupe de comptes (`41`) apparaît donc **deux fois** dans le modèle : une fois en « débiteurs seulement » côté Actif, une fois en « créditeurs seulement » côté Passif. C'est ce qui garantit que **rien n'est compté deux fois** et que le bilan reste équilibré.

---

## 4. Utilisation (DAF)

### Accéder à l'écran
**Comptabilité → États financiers → Paramétrage du bilan**
(visible uniquement avec le droit d'écriture comptable).

L'écran affiche tous les postes, en deux colonnes **Actif / Passif**, groupés par masse. Chaque ligne montre le code, le libellé et un **résumé des comptes** rattachés.

### Modifier un poste
1. Cliquer **« Éditer »** sur la ligne du poste → un panneau (*drawer*) s'ouvre à droite.
2. On peut changer :
   - le **libellé** du poste ;
   - les **sources** : pour chacune, la *colonne* (actif), la *règle de signe*, les *comptes/préfixes* (séparés par des virgules) et d'éventuels comptes à *exclure*.
3. **« Ajouter »** crée une nouvelle source ; l'icône corbeille en supprime une.
4. **« Enregistrer »** → le bilan et son détail sont recalculés immédiatement.

> ⚠️ **Vérifiez l'équilibre** après une modification : déplacer ou oublier un compte peut déséquilibrer le bilan. Le bandeau « Bilan équilibré / Déséquilibre » en haut du bilan le signale.

### Réinitialiser
Le bouton **« Réinitialiser »** remet **tout** le modèle au standard SYSCOHADA d'origine (toutes les personnalisations sont perdues). Une confirmation est demandée.

### Le résultat net
Le poste **`CH` Résultat net de l'exercice** est **calculé automatiquement** depuis le compte de résultat (classes 6 & 7). Ses comptes ne se paramètrent pas — seul son libellé est modifiable.

---

## 5. Voir le détail dans le bilan

Indépendamment du paramétrage, le **bilan** dispose d'un interrupteur **« Détaillé (comptes par poste) »** : une fois coché, chaque poste déplie les comptes qui le composent, avec leur montant. Pratique pour pointer / justifier un poste.

---

## 6. Architecture technique (développeurs)

### Fichiers clés

| Fichier | Rôle |
|---|---|
| `invoicehub-api/src/lib/statement-rubriques.ts` | Types + moteur `computeBilanFromRubriques` (+ détail comptes) |
| `invoicehub-api/src/lib/statement-rubriques.seed.ts` | Modèle SYSCOHADA d'origine (seed), dérivé du calcul historique |
| `invoicehub-api/src/lib/syscohada-statements.ts` | Ancien calcul en dur, conservé comme **référence / repli** |
| `invoicehub-api/prisma/add_statement_rubriques.sql` | Migration : création table + seed (idempotent) |
| `bridge-frontend/src/app/(dashboard)/accounting/statement-config/page.tsx` | Écran de paramétrage |
| `bridge-frontend/src/features/accounting/components/RubriqueDrawer.tsx` | Drawer d'édition |

### Modèle de données — `statement_rubriques`

| Colonne | Type | Description |
|---|---|---|
| `code` | varchar (unique) | Code de poste SYSCOHADA (`BI`, `DZ`…) |
| `side` | varchar | `actif` \| `passif` |
| `masse_code` / `masse_label` / `masse_order` | | Masse de rattachement et ordre |
| `label` / `line_order` | | Libellé et ordre dans la masse |
| `is_result` | bool | `true` pour le résultat net (calculé) |
| `sources` | **jsonb** | Tableau de sources (voir ci-dessous) |

Une **source** (JSON) :
```json
{ "column": "brut", "prefixes": ["41"], "mode": "debitSign", "exclude": ["478","479"] }
```
- `column` : `brut` \| `amort`
- `mode` : `debitRaw` \| `creditRaw` \| `debitSign` \| `creditSign`
  (= les 4 règles : Débit / Crédit / Débiteurs seulement / Créditeurs seulement)
- `exclude` : préfixes à retirer (optionnel)

### Calcul d'un poste
```
brut  = Σ sources(colonne=brut)
amort = Σ sources(colonne=amort)
net   = brut − amort
```
Contribution d'un compte de solde `bal` selon le mode :
`debitRaw → bal` · `creditRaw → −bal` · `debitSign → bal si bal>0` · `creditSign → −bal si bal<0`.

### Repli de sécurité
Si la table `statement_rubriques` est **vide**, le service retombe automatiquement sur l'ancien calcul en dur (`computeBilan`). Aucune régression possible.

### API

| Méthode | Route | Droit | Rôle |
|---|---|---|---|
| `GET` | `/accounting/statement-rubriques` | `accounting:read` | Liste les postes |
| `PUT` | `/accounting/statement-rubriques/:code` | `accounting:write` | Modifie libellé / sources |
| `POST` | `/accounting/statement-rubriques/reset` | `accounting:write` | Réinitialise au seed |
| `GET` | `/accounting/reports/bilan?detailed=true` | `accounting:read` | Bilan + détail des comptes |

---

## 7. Garanties & vérifications

- **Équivalence prouvée** : le moteur piloté par la base reproduit **exactement** l'ancien calcul audité (test d'équivalence sur balance synthétique exhaustive + re-audit sur données réelles : équilibre, totaux et détail tous identiques).
- **Cohérence détail** : pour chaque poste, la somme des comptes affichés = le net du poste.
- **Idempotence** de la migration (`ON CONFLICT (code) DO NOTHING`) : ne réécrit pas les rubriques déjà personnalisées en production.

---

## 8. Déploiement

Sur le serveur, dans `invoicehub-api/` :
```bash
npx prisma db execute --file prisma/add_statement_rubriques.sql --schema prisma/schema.prisma
npx prisma generate           # nouvelle table dans le schéma
pnpm build && pm2 restart invoicehub-api
```
Puis rebuild + restart du frontend.

---

## 9. Limites

- **Bilan uniquement.** Le **compte de résultat** n'est pas paramétrable par cet écran : sa structure est une *cascade* de soldes intermédiaires (Marge → VA → EBE → …) qui ne s'exprime pas avec un simple modèle « comptes + signe ». Il reste calculé en interne (`computeCompteResultat`).
- **L'équilibre n'est pas garanti automatiquement** après édition : c'est à l'utilisateur de vérifier le bandeau d'équilibre. Un mauvais rattachement (compte oublié ou compté deux fois) déséquilibre le bilan.
- Pas de moteur de **formules texte** (`SD(411..418)` à la Sage) : on utilise un modèle structuré `{préfixes, règle}`, volontairement plus simple et plus sûr, qui couvre les besoins SYSCOHADA.

---

## 10. FAQ

**Un nouveau compte que je crée apparaîtra-t-il dans le bilan ?**
Oui automatiquement, s'il commence par un préfixe déjà rattaché à un poste (ex. un nouveau `4118` est capté par la source `41`). Sinon, ajoutez son préfixe à la source du bon poste.

**Puis-je casser le bilan ?**
Vous pouvez le déséquilibrer (le bandeau vous le dira), mais jamais le perdre : le bouton **Réinitialiser** restaure le standard SYSCOHADA en un clic.

**Où sont les numéros de compte sur le bilan officiel ?**
Nulle part — le bilan officiel (DSF) n'affiche que les codes de poste. Les numéros de compte sont dans la **balance** et le **grand livre**. Cet écran de paramétrage est l'endroit où l'on voit le lien entre les deux.
