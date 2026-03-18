# Guide Utilisateur — Module Factures

> **Bridge Technologies Solutions (BTS)** — InvoiceHub v2.0
> Audience : Commerciaux, Administrateurs

---

## 1. Types de factures

InvoiceHub gère **5 types** de factures, chacun avec un comportement distinct :

| Type | Code | Description |
|------|------|-------------|
| **Standard** | `standard` | Facture classique couvrant la totalité des prestations |
| **Acompte** | `acompte` | Facture partielle représentant un % du total du projet |
| **Solde** | `solde` | Facture finale déduisant les acomptes déjà encaissés |
| **Avoir** | `avoir` | Note de crédit annulant tout ou partie d'une facture |
| **Récurrente** | `recurring` | Facture générée automatiquement par un gabarit récurrent |

---

## 2. Cycle de vie d'une facture

```
Brouillon (draft)
     │
     └─── [Émettre] ──→ Émise (issued)
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
       Paiement partiel  Échéance dépassée  [Annuler]
       (partially_paid)  (overdue)           │
              │               │              ▼
              └───────────────┤          Annulée (cancelled)
                    Paiement  │          + Avoir auto généré
                    complet   │
                              ▼
                          Payée (paid)
```

| Statut | Signification | Actions possibles |
|--------|--------------|-------------------|
| **Brouillon** | Rédigée, non émise | Modifier, Émettre, Dupliquer, PDF |
| **Émise** | Envoyée au client, en attente de paiement | Enregistrer un paiement, Annuler, Dupliquer, PDF |
| **Part. payée** | Paiement partiel reçu | Enregistrer un paiement, Annuler, PDF |
| **En retard** | Émise, échéance dépassée, non payée | Enregistrer un paiement, Annuler, PDF |
| **Payée** | Solde intégralement réglé | Dupliquer, PDF |
| **Annulée** | Annulation définitive + avoir créé | Consulter uniquement |

> **Règle importante** : Une facture émise **ne peut plus être modifiée**. Seules les factures en **Brouillon** sont éditables.

---

## 3. Numérotation SYSCOHADA

Le numéro est généré **automatiquement** selon le format :

```
BTS / {CODE_BUREAU} / {ANNÉE} / {MOIS} / FAC{XXX}
```

**Exemple** : `BTS/DC/2026/03/FAC001`

- Attribution à la **création du brouillon**
- Séquence **sans trou** garantie (atomique PostgreSQL)
- **Impossible** de modifier ou de réutiliser un numéro

---

## 4. Créer une facture Standard

### Accès
`Menu lateral → Factures → Nouvelle facture`

### Champs obligatoires
| Champ | Description |
|-------|-------------|
| **Type** | Sélectionner "Standard" |
| **Client** | Sélectionner dans la liste |
| **Date d'échéance** | Date limite de paiement |
| **Au moins une ligne** | Désignation, quantité, prix HT, TVA |

### Champs optionnels
| Champ | Description |
|-------|-------------|
| **Objet** | Titre court de la facture |
| **Référence client** | Numéro de commande du client (ex: BC-2026-0045) |
| **Remise globale** | Remise en % ou montant fixe sur le total HT |
| **Conditions de paiement** | Ex: "Virement 30 jours fin de mois" |
| **Notes** | Informations complémentaires sur le PDF |
| **Assigné à** | Collaborateur responsable |

---

## 5. Facture d'Acompte

Une facture d'acompte représente un **versement partiel** (ex : 30%) du montant total du projet.

### Comment créer une facture d'acompte

**Option A — Depuis une proforma :**
Dans le détail de la proforma → **Convertir → Acompte** → saisir le pourcentage.

**Option B — Directement depuis Factures :**
1. Nouvelle facture → Type : **Acompte**
2. Saisir les lignes du projet complet (ou reprendre les lignes d'un acompte précédent)
3. Renseigner le **pourcentage d'acompte** (ex : 30)
4. Optionnel : lier à une proforma existante

### Ce qui est affiché sur le PDF d'acompte
- Tableau complet des lignes du projet
- Bloc récapitulatif :
  - Total HT du projet complet
  - TVA sur acompte (TVA × %)
  - **Montant acompte TTC** = Total TTC × %
  - Solde restant à facturer

### Acomptes multiples (2e, 3e versement)

Pour créer un **2ème acompte** sur le même projet :
1. Nouvelle facture → Type : **Acompte**
2. Saisir le client
3. Dans le panneau **"Lier à un acompte précédent"**, sélectionner la 1ère facture d'acompte
4. Cliquer **"Reprendre les lignes du 1er acompte"** pour copier les lignes
5. Ajuster le pourcentage du 2ème versement

> Le système lie automatiquement les acomptes en chaîne. Lors de la création du solde, **tous les acomptes encaissés** sont automatiquement déduits.

---

## 6. Facture de Solde

La facture de solde est la **facture finale** du projet. Elle déduit automatiquement tous les acomptes déjà encaissés.

### Comment créer une facture de solde
1. Nouvelle facture → Type : **Solde**
2. Sélectionner le client
3. Dans le panneau **"Acompte rattaché"**, sélectionner la facture d'acompte racine (le 1er acompte)
4. Les lignes du projet et les acomptes liés s'affichent automatiquement

### Ce qui est calculé automatiquement
Le système calcule `Solde dû = Total TTC projet − Somme de tous les acomptes encaissés`

Exemple :
```
Projet total     :  1 000 000 XAF
Acompte 1 (30%)  :   −300 000 XAF (encaissé)
Acompte 2 (20%)  :   −200 000 XAF (encaissé)
─────────────────────────────────
Solde dû         :    500 000 XAF
```

### Garde-fou
Le système **refuse** de créer un 2ème solde sur le même acompte (erreur 400). Un seul solde par cycle d'acompte est autorisé.

---

## 7. Avoir (Note de crédit)

Un avoir annule tout ou partie d'une facture déjà émise.

### Avoir automatique (annulation)
Lors de l'**annulation** d'une facture émise, un avoir est **créé automatiquement** avec :
- Les mêmes lignes que la facture annulée
- Montant dû = 0 (la dette est soldée)
- Référence vers la facture annulée

### Avoir manuel (partiel)
Pour créer un avoir partiel sur une facture encore active :
1. Ouvrir le détail de la facture
2. Menu Actions → **Créer un avoir**
3. Saisir le motif et les lignes à créditer (ou copier les lignes originales)

> Un avoir ne peut être créé que sur une facture de type `standard`, `acompte` ou `solde`. Il est **impossible** de créer un avoir d'un avoir.

---

## 8. Émettre une facture

L'émission est l'action qui **valide et envoie** la facture.

1. Depuis la liste ou le détail → **Émettre** (icône ⚡)
2. La facture passe en statut **Émise**
3. Un **email automatique** est envoyé au client avec le montant et la date d'échéance
4. Une **notification in-app** est diffusée à toute l'équipe BTS
5. La facture est **verrouillée** (plus modifiable)

---

## 9. Enregistrer un paiement

### Accès
Détail de la facture → Onglet **Paiements** → **+ Nouveau paiement**

ou depuis la liste : menu Actions → **Paiement**

### Champs
| Champ | Description |
|-------|-------------|
| **Montant** | Montant encaissé (peut être partiel) |
| **Date de paiement** | Date effective de réception des fonds |
| **Mode de paiement** | Espèces, Virement, Chèque, Mobile Money, Carte |
| **Référence** | N° de virement, N° de chèque, Transaction Mobile Money… |
| **Notes** | Informations complémentaires |

### Mise à jour automatique
Après enregistrement d'un paiement :
- `Montant payé` et `Solde dû` sont recalculés instantanément
- Le statut passe automatiquement à **Partiellement payée** ou **Payée** selon le solde restant
- Le niveau de relance (`reminderEscalationLevel`) est remis à 0

### Supprimer un paiement
Possible uniquement si la facture n'est pas encore entièrement payée. La suppression recalcule le solde.

---

## 10. Système de relances automatiques

Les factures impayées font l'objet de **relances escaladées** envoyées à l'équipe BTS (pas au client) :

| Niveau | Délai | Destinataire | Objet |
|--------|-------|--------------|-------|
| 1 | J+0 (émission) | Équipe | Facture émise — suivi requis |
| 2 | J+7 | Commercial responsable | Relance J+7 |
| 3 | J+15 | Commercial + Admin | Relance J+15 — escalade |
| 4 | J+30 | Direction | Relance J+30 — impayé critique |

> Ces délais sont configurables dans **Paramètres → Relances**. Le niveau est remis à zéro dès qu'un paiement est enregistré.

---

## 11. Factures en retard (overdue)

Une facture est marquée **En retard** automatiquement chaque nuit (00h05 UTC) si :
- Statut = `issued` ou `partially_paid`
- Date d'échéance < date du jour

Elles sont visibles dans l'onglet **"En retard"** de la liste des factures et dans le tableau de bord.

---

## 12. Dupliquer une facture

Crée un **nouveau brouillon** avec :
- Toutes les lignes et conditions identiques
- Nouveau numéro SYSCOHADA
- Date d'émission = aujourd'hui
- Statut = Brouillon (non émise)

Utile pour facturer régulièrement les mêmes prestations à un client.

---

## 13. Télécharger le PDF

Disponible depuis n'importe quel statut via **Menu Actions → Télécharger PDF**.

Le PDF inclut :
- En-tête et pied de page BTS
- Tableau des lignes avec remises individuelles
- Récapitulatif HT / TVA / TTC
- Pour un **acompte** : bloc "Acompte HT × %" + "Solde restant"
- Pour un **solde** : bloc "Total projet" + "Acomptes déduits" + "Solde dû"
- Pour un **avoir** : mention "NOTE DE CRÉDIT" + référence à la facture créditée
- Cachet/tampon BTS si configuré

---

## 14. Filtrer et rechercher

### Barre de recherche
Recherche dans : numéro, objet, nom du client.

### Filtre par type
Sélecteur : Tous les types / Standard / Acompte / Solde / Avoir / Récurrente

### Filtre par statut
Onglets : Tous / Brouillon / Émise / Part. payée / En retard / Payée / Annulée

### Filtre par dates
Filtre sur la **date d'émission** (Du … au …).

### Export CSV
Bouton **Exporter CSV** — exporte la liste filtrée (tous les statuts inclus).

Colonnes exportées : Numéro, Client, Type, Statut, Date émission, Échéance, Total TTC, Payé, Solde

---

## 15. Calcul des montants — Formule SYSCOHADA

Pour chaque ligne :
```
Sous-total HT   = Quantité × Prix unitaire HT
Remise ligne    = Sous-total HT × Taux remise (ou montant fixe)
Net HT          = Sous-total HT − Remise ligne
Montant TVA     = Net HT × Taux TVA
Total TTC ligne = Net HT + Montant TVA
```

Pour le document :
```
Sous-total HT   = Somme des nets HT des lignes
Remise globale  = Sous-total HT × Taux remise globale (ou montant fixe)
Total HT        = Sous-total HT − Remise globale
Total TVA       = Somme des TVA de chaque ligne
Total TTC       = Total HT + Total TVA
```

> La TVA est toujours calculée sur le **Net HT de chaque ligne** (avant remise globale), conformément aux règles SYSCOHADA.

---

## 16. Historique des statuts

Chaque changement est tracé dans l'onglet **Historique** du détail :
- Date et heure
- Statut précédent → nouveau statut
- Utilisateur ayant effectué l'action
- Motif (pour les annulations)

---

## 17. Droits et permissions

| Action | Employé | Commercial | Admin |
|--------|---------|------------|-------|
| Voir la liste et le détail | ✓ | ✓ | ✓ |
| Créer / Modifier (brouillon) | ✗ | ✓ | ✓ |
| Émettre | ✗ | ✓ | ✓ |
| Enregistrer un paiement | ✗ | ✓ | ✓ |
| Annuler | ✗ | ✗ | ✓ |
| Créer un avoir manuel | ✗ | ✗ | ✓ |
| Dupliquer | ✗ | ✓ | ✓ |
| Télécharger PDF | ✓ | ✓ | ✓ |
| Export CSV | ✗ | ✓ | ✓ |

---

## 18. Questions fréquentes

**Q : Peut-on modifier une facture après émission ?**
Non. Seules les factures **Brouillon** sont modifiables. Pour corriger une facture émise, annulez-la (un avoir est créé automatiquement) puis créez une nouvelle facture.

**Q : L'annulation supprime-t-elle la facture ?**
Non. La facture reste visible avec le statut **Annulée**. Un avoir est créé automatiquement dans la même opération. Aucune donnée n'est perdue.

**Q : Peut-on enregistrer plusieurs paiements sur une même facture ?**
Oui. Tant que le solde restant est > 0, vous pouvez enregistrer autant de paiements partiels que nécessaire. Le statut passe à **Payée** automatiquement quand le solde atteint 0.

**Q : Comment créer une facture d'avoir sans annuler la facture d'origine ?**
Via le menu Actions → **Créer un avoir** dans le détail de la facture. Cela crée un avoir partiel sans changer le statut de la facture originale.

**Q : Pourquoi la facture de solde affiche un montant inférieur au total du projet ?**
C'est normal. Le solde déduit automatiquement les acomptes **encaissés** (paiements réels reçus), pas les acomptes simplement émis. Si un acompte a été émis mais pas encore payé, il n'est pas déduit.

**Q : Les factures récurrentes sont-elles créées manuellement ?**
Non. Elles sont générées automatiquement chaque nuit par le moteur de planification (cron 00h10 UTC) selon les gabarits définis dans le module **Récurrentes**.
