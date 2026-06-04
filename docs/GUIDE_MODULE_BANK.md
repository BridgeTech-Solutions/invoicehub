# Guide utilisateur — Module Bancaire

## Vue d'ensemble

Le module bancaire regroupe 5 sections accessibles depuis le menu **Banque** :

| Section | Rôle |
|---|---|
| **Comptes** | Gérer vos comptes bancaires (création, soldes, statut) |
| **Importer** | Charger un relevé bancaire depuis votre banque |
| **Transactions** | Consulter et traiter toutes les opérations importées |
| **Rapprochements** | Vérifier que vos livres correspondent au relevé officiel |
| **Règles de matching** | Automatiser la reconnaissance des transactions récurrentes |

---

## 1. Comptes bancaires

### Accès
Menu **Banque → Comptes**

### Ce que vous voyez
Chaque compte s'affiche sous forme de fiche avec :
- Le **solde actuel** (rouge si négatif)
- Le **type de compte** : Courant, Épargne, Caisse, Mobile Money, Dépôt à terme
- La **devise** et le numéro masqué (4 derniers chiffres)
- Un badge **Défaut** sur le compte principal
- Un compteur de **transactions en attente** (si applicable)

En haut de page, 4 indicateurs clés résument l'ensemble de vos comptes : solde total, nombre de comptes actifs, transactions en attente, et dernier import.

### Actions disponibles sur chaque fiche
Cliquez sur les **3 points** (⋮) en haut à droite de la fiche pour :

| Action | Effet |
|---|---|
| **Modifier** | Changer le nom, la banque, la couleur, etc. |
| **Définir comme défaut** | Pré-sélectionner ce compte dans les formulaires |
| **Importer un relevé** | Accéder directement à la page d'import pour ce compte |
| **Transactions** | Voir les opérations de ce compte |
| **Rapprocher** | Démarrer une session de rapprochement |
| **Supprimer** | Supprimer le compte (action irréversible) |

Les boutons rapides en bas de fiche permettent d'accéder directement à **Importer**, **Transactions** ou **Rapprocher**.

### Créer un compte
Cliquez sur **+ Nouveau compte** en haut à droite. Renseignez :
- Nom du compte (ex : « Afriland Pro »)
- Nom de la banque
- Type de compte
- Devise (XAF par défaut)
- IBAN ou numéro de compte (optionnel)
- Solde initial actuel
- Couleur d'identification (pour distinguer vos comptes visuellement)

---

## 2. Importer un relevé bancaire

### Accès
Menu **Banque → Importer** ou bouton **Importer** sur une fiche compte

### Formats acceptés
- **CSV** — format tableur standard
- **OFX** — format bancaire Open Financial Exchange
- **MT940** — format Swift standard (relevé électronique)

Taille maximale : 5 Mo par fichier.

### Procédure en 3 étapes

**Étape 1 — Sélection**
1. Choisissez le **compte bancaire** concerné dans la liste déroulante
2. **Glissez-déposez** votre fichier dans la zone prévue, ou cliquez pour sélectionner
3. (Optionnel) Cliquez sur **Détecter le format** pour vérifier que le fichier est reconnu avant de continuer — le système affiche le format détecté et la période couverte
4. Cliquez sur **Prévisualiser**

**Étape 2 — Prévisualisation**
Le système analyse le fichier et affiche :
- Le nombre total de lignes trouvées
- Le nombre de **doublons ignorés** (transactions déjà importées, détectées par empreinte numérique)
- Le nombre de transactions **à importer** (nouvelles)
- Un aperçu des 10 premières lignes : date, libellé, débit, crédit, solde

Vérifiez que les données semblent correctes, puis cliquez sur **Confirmer l'import**.

**Étape 3 — Traitement**
Une barre de progression suit l'intégration des transactions. À la fin :
- **Import réussi** → vous pouvez consulter les transactions ou démarrer un rapprochement
- **Import échoué** → un message d'erreur s'affiche ; le bouton **Annuler l'import** permet de supprimer les transactions partiellement créées et de repartir de zéro

> Les doublons sont détectés automatiquement : si vous importez deux fois le même relevé, les transactions en commun seront ignorées sans erreur.

---

## 3. Transactions

### Accès
Menu **Banque → Transactions**

### Filtres disponibles
- **Onglets de statut** : Toutes / En attente / Rapprochées / Non reconnues / Ignorées
- **Compte** : filtrer par compte bancaire spécifique
- **Type** : Débit ou Crédit
- **Période** : date de début et de fin
- **Recherche** : par libellé ou référence

### Statuts d'une transaction

| Statut | Signification |
|---|---|
| **En attente** | Transaction importée, pas encore traitée |
| **Rapprochée** | Associée à un paiement, dépense ou facture dans le système |
| **Non reconnue** | Aucune correspondance trouvée automatiquement |
| **Ignorée** | Marquée manuellement pour ne pas être traitée (ex : virement interne) |

### Actions sur une transaction
Depuis la liste ou le panneau de suggestions, vous pouvez :
- **Rapprocher** : associer la transaction à un paiement client, fournisseur ou une dépense
- **Ignorer** : marquer comme non pertinente (n'affecte pas le solde)
- **Dé-rapprocher** : annuler un rapprochement erroné

### Panneau de suggestions
Lorsque vous cliquez sur une transaction en attente, le système affiche automatiquement les correspondances possibles dans vos livres, classées par **score de confiance** (en %) :

- **≥ 90%** — Verte : correspondance quasi certaine
- **70–89%** — Orange : bonne piste, à vérifier
- **< 70%** — Rouge : correspondance incertaine

Cliquez sur une suggestion pour rapprocher immédiatement.

---

## 4. Rapprochements bancaires

Le rapprochement consiste à vérifier que le solde dans le logiciel correspond exactement au solde du relevé officiel de votre banque, en associant chaque transaction bancaire à une écriture comptable.

### Accès
Menu **Banque → Rapprochements**

### Créer une session
Cliquez sur **+ Nouvelle session** et renseignez :
- **Compte** à rapprocher
- **Période** : date de début et de fin du relevé
- **Solde de clôture** indiqué sur votre relevé bancaire papier (en XAF)

### Interface de travail (vue fractionnée)

L'espace de travail est divisé en deux colonnes :

**Colonne gauche — Transactions bancaires**
Liste toutes les transactions de la période en attente de rapprochement. Cliquez sur une transaction pour voir ses correspondances possibles.

**Colonne droite — Correspondances**
Affiche les écritures du système (paiements clients, paiements fournisseurs, dépenses) qui correspondent à la transaction sélectionnée. Cliquez sur une correspondance pour rapprocher.

**Barre de balance (en haut)**
Affiche en temps réel :
- Solde relevé (officiel)
- Solde système (calculé)
- Écart (vert = équilibré, rouge = différence à résoudre)
- Progression : nombre de transactions rapprochées / total

### Auto-matching
Cliquez sur **Auto-matcher** (bouton violet avec ⚡) pour laisser le système rapprocher automatiquement les transactions les plus évidentes.

Deux modes disponibles :
- **Haute confiance uniquement (≥ 90%)** — recommandé : seules les correspondances quasi-certaines sont appliquées. Plus sûr.
- **Mode étendu (≥ 70%)** — applique aussi les correspondances moyennement certaines. Vérifiez le résultat après.

### Clôturer une session
Une fois toutes les transactions traitées (ou si vous acceptez un écart résiduel), cliquez sur **Terminer**.
- Si le solde est équilibré → clôture normale
- Si un écart subsiste → le système vous avertit ; vous pouvez clôturer quand même avec une note

Les sessions clôturées restent consultables mais ne peuvent plus être modifiées.

---

## 5. Règles de matching

Les règles permettent de reconnaître automatiquement les transactions récurrentes (frais bancaires, loyers, virements réguliers) sans avoir à les rapprocher manuellement à chaque fois.

### Accès
Menu **Banque → Règles de matching**

### Comment fonctionne une règle
La règle inspecte le **libellé** de chaque nouvelle transaction bancaire. Si le libellé correspond au pattern défini, la transaction est automatiquement associée au type d'entité spécifié.

### Créer une règle
Cliquez sur **+ Créer une règle** et renseignez :

| Champ | Description |
|---|---|
| **Compte** | Laisser vide pour appliquer à tous les comptes, ou choisir un compte spécifique |
| **Pattern libellé** | Texte à chercher dans le libellé, avec jokers : `*` = plusieurs caractères, `?` = un seul caractère. Ex : `VIREMENT AFRILAND*` ou `FRAIS TENUE*` |
| **Type d'entité** | Ce à quoi la transaction doit être associée : Paiement client, Paiement fournisseur ou Dépense |
| **Montant min / max** | (Optionnel) Restreindre la règle à une plage de montants |
| **Application automatique** | Si activé, la règle est appliquée automatiquement lors des prochains imports, sans action manuelle |
| **Notes** | Commentaire interne sur l'utilité de la règle |

### Tableau des règles
La liste affiche pour chaque règle :
- Le **pattern** (en police monospace)
- Le **type d'entité** ciblé
- Le **compte** concerné (« Tous » si global)
- La **confiance** : score calculé selon les utilisations passées (barre visuelle)
- Le **toggle Auto** : activez/désactivez l'application automatique en un clic
- Le nombre d'**utilisations** (combien de fois la règle a été appliquée)

> Les règles peuvent aussi s'apprendre automatiquement : chaque fois que vous rapprochez manuellement une transaction, le système peut créer ou renforcer la règle correspondante.

---

## Flux de travail recommandé (cycle mensuel)

1. **En début de mois** : téléchargez le relevé bancaire de chaque compte auprès de votre banque
2. **Importer** le relevé dans InvoiceHub (Banque → Importer)
3. **Vérifier les transactions** en attente (Banque → Transactions, onglet « En attente »)
4. **Lancer l'auto-matching** depuis une session de rapprochement pour traiter rapidement les transactions reconnues
5. **Rapprocher manuellement** les transactions restantes en cliquant dessus et en choisissant la correspondance
6. **Clôturer la session** une fois l'écart à zéro
7. **Créer des règles** pour les transactions récurrentes afin d'automatiser les prochains mois
