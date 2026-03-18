# Guide Utilisateur — Module Proformas

> **Bridge Technologies Solutions (BTS)** — InvoiceHub v2.0
> Audience : Commerciaux, Administrateurs

---

## Qu'est-ce qu'une proforma ?

Une proforma (ou devis) est un document **non contractuel** envoyé au client avant facturation. Elle décrit les prestations proposées, les prix et les conditions. Elle n'a pas de valeur comptable tant qu'elle n'est pas convertie en facture.

---

## 1. Cycle de vie d'une proforma

```
Brouillon (draft)
     │
     ├─── [Envoyer] ──→ Envoyée (sent)
     │                       │
     │              ┌────────┴────────┐
     │              ▼                 ▼
     │         Acceptée           Rejetée
     │         (accepted)         (rejected)
     │              │                 │
     │         [Convertir]       [Re-envoyer]
     │              ▼                 │
     │           Facture ◄────────────┘
     │
     └─── [Supprimer] (uniquement en brouillon)
```

| Statut | Signification | Actions possibles |
|--------|--------------|-------------------|
| **Brouillon** | En cours de rédaction, non envoyée | Modifier, Envoyer, Dupliquer, Supprimer, PDF |
| **Envoyée** | Transmise au client | Accepter, Rejeter, Convertir, Dupliquer, PDF |
| **Acceptée** | Client a validé le devis | Convertir en facture, Dupliquer, PDF |
| **Rejetée** | Client a refusé | Re-envoyer (repasse en Envoyée), Dupliquer, PDF |
| **Expirée** | Date de validité dépassée | Dupliquer, PDF |

> **Note** : Une proforma **expirée** n'est pas supprimée automatiquement. Elle reste consultable. Seule sa date de validité est dépassée.

---

## 2. Créer une proforma

### Accès
`Menu lateral → Proformas → Nouvelle proforma`

### Champs obligatoires
| Champ | Description |
|-------|-------------|
| **Client** | Sélectionner dans la liste. Le formulaire propose une saisie rapide si le client n'existe pas encore. |
| **Date de validité** | Jusqu'à quand l'offre est valable. Par défaut : J+30 selon la configuration. |
| **Au moins une ligne** | Désignation, quantité, prix unitaire HT, TVA. |

### Champs optionnels
| Champ | Description |
|-------|-------------|
| **Objet** | Titre court du devis (ex : "Installation réseau LAN") |
| **Délai de livraison** | Ex : "15 jours ouvrés après acceptation" |
| **Garantie** | Ex : "12 mois pièces et main d'œuvre" |
| **Conditions de paiement** | Ex : "50% à la commande, 50% à la livraison" |
| **Notes internes** | Informations internes non visibles sur le PDF |
| **Remise globale** | Remise en % ou montant fixe appliquée sur le total HT après remises lignes |
| **Assigné à** | Collaborateur responsable du dossier |

### Ajouter des lignes
1. Cliquer **+ Ajouter une ligne**
2. Sélectionner un produit du catalogue **ou** saisir manuellement la désignation
3. Renseigner la quantité, le prix unitaire HT et le taux de TVA
4. Appliquer une remise ligne (%) ou (montant fixe) si nécessaire
5. Les montants HT, TVA et TTC se calculent automatiquement

> **Snapshot prix** : Le prix saisi est figé au moment de la création. Si le prix catalogue change ultérieurement, la proforma existante n'est **pas affectée**.

---

## 3. Numérotation SYSCOHADA

Le numéro est généré **automatiquement** selon le format :

```
BTS / {CODE_BUREAU} / {ANNÉE} / {MOIS} / PFM{XXX}
```

**Exemple** : `BTS/DC/2026/03/PFM001`

- Le numéro est attribué à la **sauvegarde** du brouillon, pas à l'envoi
- La séquence est **garantie sans trou** (atomique en base de données)
- Il est **impossible** de modifier un numéro manuellement

---

## 4. Envoyer une proforma au client

1. Ouvrir la proforma (statut Brouillon ou Rejetée)
2. Cliquer **Envoyer au client** (menu Actions ou bouton dans le détail)
3. La proforma passe en statut **Envoyée**
4. Un **email automatique** est envoyé au client avec le numéro et la date de validité
5. Une **notification in-app** est diffusée à toute l'équipe BTS

> **Prérequis** : Le client doit avoir une adresse email renseignée pour que l'email soit envoyé. Sans email, la proforma passe quand même en statut Envoyée.

---

## 5. Accepter / Rejeter

### Accepter
- Action réservée aux **admin** et **commercial**
- La proforma passe en statut **Acceptée**
- Déclenche une notification à l'équipe

### Rejeter
- Possibilité de saisir un **motif de rejet** (affiché dans l'historique)
- La proforma passe en statut **Rejetée**
- Il est possible de la **re-envoyer** après correction si nécessaire

---

## 6. Convertir en facture

Une proforma **Envoyée** ou **Acceptée** peut être convertie en facture.

### Conversion Standard
La facture reprend **toutes les lignes et tous les montants** de la proforma.

### Conversion en Acompte
La facture couvre un **pourcentage du total** de la proforma.
- Saisir le pourcentage (ex : 30%)
- La facture d'acompte est créée avec `Total TTC = Total proforma × 30%`
- Les lignes complètes du projet restent attachées (pour affichage sur le PDF)
- Une future facture de **solde** sera liée à cet acompte

> Lors de la conversion, si la proforma était en statut **Envoyée**, elle est automatiquement passée en **Acceptée**.

---

## 7. Dupliquer une proforma

Crée une **nouvelle proforma brouillon** avec :
- Les mêmes lignes, objet, conditions
- Une nouvelle date d'émission (aujourd'hui)
- Une nouvelle date de validité (J+30 par défaut)
- Un nouveau numéro SYSCOHADA

Utile pour proposer une offre similaire à un autre client ou retravailler un devis refusé.

---

## 8. Télécharger le PDF

Disponible depuis **n'importe quel statut** via le menu Actions → **Télécharger PDF**.

Le PDF généré inclut :
- En-tête BTS avec logo
- Informations client
- Tableau des lignes avec remises
- Totaux HT / TVA / TTC
- Date de validité
- Conditions de paiement, délai de livraison, garantie
- Pied de page BTS
- Cachet/tampon (si configuré dans Paramètres)

---

## 9. Supprimer une proforma

- Seules les proformas en **Brouillon** peuvent être supprimées
- La suppression est une **suppression douce** (soft delete) — le document reste en base de données mais n'est plus visible
- Les proformas Envoyées, Acceptées, Rejetées ou Expirées **ne peuvent pas** être supprimées

---

## 10. Filtrer et rechercher

### Barre de recherche
Recherche dans : numéro de proforma, nom du client, objet.

### Filtre par statut
Onglets : Tous / Brouillon / Envoyées / Acceptées / Rejetées / Expirées

### Filtre par dates
Filtre sur la **date d'émission** (Du … au …).

### Export CSV
Bouton **Exporter CSV** en haut de page — exporte la liste actuelle selon les filtres actifs.

Colonnes exportées : Numéro, Client, Statut, Date émission, Valide jusqu'au, Total TTC

---

## 11. Historique des statuts

Chaque changement de statut est tracé dans l'onglet **Historique** du détail d'une proforma :
- Date et heure du changement
- Statut précédent → nouveau statut
- Utilisateur ayant effectué l'action
- Motif (pour les rejets)

---

## 12. Droits et permissions

| Action | Employé | Commercial | Admin |
|--------|---------|------------|-------|
| Voir la liste | ✓ | ✓ | ✓ |
| Créer / Modifier | ✗ | ✓ | ✓ |
| Envoyer au client | ✗ | ✓ | ✓ |
| Accepter / Rejeter | ✗ | ✓ | ✓ |
| Convertir en facture | ✗ | ✓ | ✓ |
| Supprimer (brouillon) | ✗ | ✓ | ✓ |
| Dupliquer | ✗ | ✓ | ✓ |
| Télécharger PDF | ✓ | ✓ | ✓ |

---

## 13. Questions fréquentes

**Q : Peut-on modifier une proforma après l'avoir envoyée ?**
Non. Seules les proformas en **Brouillon** sont modifiables. Pour corriger une proforma envoyée, dupliquez-la et renvoyez la nouvelle version.

**Q : La proforma expirée est-elle encore visible ?**
Oui. Elle reste dans la liste (onglet "Expirées") et le PDF reste téléchargeable. Elle ne peut pas être convertie en facture sans être dupliquée au préalable.

**Q : Peut-on avoir plusieurs factures issues de la même proforma ?**
Oui. Il est possible de créer une facture d'acompte depuis une proforma, puis une autre facture (solde) liée à cet acompte.

**Q : Que se passe-t-il si le client n'a pas d'email ?**
La proforma passe quand même en statut Envoyée, mais aucun email n'est transmis. La notification in-app à l'équipe est envoyée dans tous les cas.
