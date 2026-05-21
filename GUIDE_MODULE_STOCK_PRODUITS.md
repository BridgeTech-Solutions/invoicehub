# Guide utilisateur — Produits & Gestion des stocks

## Vue d'ensemble

Le module se divise en deux parties complémentaires :

| Section | Rôle |
|---|---|
| **Produits & Services** | Gérer votre catalogue (articles vendus, prestations) |
| **Stock — Vue d'ensemble** | Tableau de bord : niveaux, valorisation, mouvements récents |
| **Stock — Niveaux** | Consulter et ajuster les quantités par produit |
| **Stock — Journal des mouvements** | Historique complet de toutes les entrées et sorties |
| **Stock — Alertes** | Liste des produits en rupture ou sous le seuil minimum |

---

## Partie 1 — Produits & Services

### Accès
Menu **Produits & Services**

### Catalogue de produits

Chaque produit s'affiche sous forme de fiche avec :
- Le **nom** et la **référence**
- La **catégorie** et le **type** (Produit physique ou Prestation de service)
- Le **prix HT** et le **taux de TVA**
- L'indicateur de **stock** si la gestion de stock est activée pour ce produit

### Filtres disponibles
- **Recherche** : par nom ou référence
- **Type** : Tous les types / Prestations (services) / Produits (physiques)
- **Catégorie** : onglets de couleur en bas de la barre de filtres — cliquez une catégorie pour afficher uniquement ses produits
- **Inclure inactifs** : afficher aussi les produits archivés

### Créer un produit
Cliquez sur **+ Nouveau produit** (en haut à droite). Le tiroir s'ouvre sur la droite avec les champs suivants :

| Champ | Description |
|---|---|
| **Nom** | Nom affiché sur les factures et proformas |
| **Référence** | Code interne optionnel (ex : ART-001) |
| **Type** | Produit (suivi en stock) ou Prestation (pas de stock) |
| **Catégorie** | Catégorie prédéfinie (voir ci-dessous) |
| **Description** | Texte libre optionnel |
| **Prix HT** | Prix de vente unitaire hors taxes |
| **Taux TVA** | Taux applicable (issu de la configuration fiscale) |
| **Unité** | Ex : pièce, kg, heure, mois |
| **Remise par défaut** | Remise pré-remplie lors de l'ajout sur un document |
| **Gestion de stock** | Activer pour suivre les quantités (uniquement pour les produits physiques) |
| **Seuil minimum** | Quantité en dessous de laquelle une alerte est déclenchée |
| **Seuil maximum** | Quantité cible (référence pour les commandes) |
| **Prix d'achat HT** | Coût unitaire d'acquisition (sert au calcul du CMUP) |
| **Actif** | Désactivez pour archiver sans supprimer |

### Modifier ou supprimer un produit
Cliquez sur les **3 points** (⋮) d'une fiche pour accéder aux options Modifier et Supprimer.

### Gérer les catégories
Cliquez sur **Catégories** (en haut à droite) pour ouvrir le gestionnaire de catégories :
- Créer une nouvelle catégorie (nom + couleur d'identification)
- Renommer ou supprimer une catégorie existante

Les catégories servent à organiser votre catalogue et à filtrer rapidement.

### Importer des produits depuis Excel
Pour ajouter plusieurs produits en une fois :

1. Cliquez sur **Modèle** pour télécharger le fichier Excel de référence — ne modifiez pas les colonnes
2. Remplissez le fichier avec vos produits
3. Cliquez sur **Importer**, glissez-déposez ou sélectionnez votre fichier
4. Choisissez la catégorie par défaut pour les lignes qui n'en ont pas
5. Validez l'import

---

## Partie 2 — Gestion des stocks

> La gestion de stock ne concerne que les produits de **type Produit** avec l'option **Gestion de stock activée**.

### Vue d'ensemble des stocks

#### Accès
Menu **Stock**

La page affiche :
- Des **indicateurs clés** en haut : nombre de produits suivis, valeur totale du stock, nombre de produits en rupture, nombre de produits en stock bas
- Les **mouvements récents** : les dernières entrées et sorties enregistrées
- Des **raccourcis rapides** vers Niveaux de stock, Journal des mouvements et Alertes

---

### Niveaux de stock

#### Accès
Menu **Stock → Niveaux de stock**

La table affiche pour chaque produit :

| Colonne | Description |
|---|---|
| **Produit** | Nom, référence et catégorie — cliquez le nom pour voir l'historique |
| **Statut** | Badge visuel (voir ci-dessous) |
| **Quantité** | Stock disponible actuel |
| **Seuils (min / max)** | Seuil d'alerte et seuil cible configurés sur le produit |
| **CMUP** | Coût Moyen Unitaire Pondéré — prix moyen d'acquisition |
| **Valeur stock** | Quantité × CMUP (valorisation totale) |

#### Statuts de stock

| Badge | Couleur | Signification |
|---|---|---|
| **Normal** | Vert | Stock au-dessus du seuil minimum |
| **Stock bas** | Orange | Stock en dessous du seuil minimum mais > 0 |
| **Rupture** | Rouge | Stock à zéro ou négatif |

#### Filtres disponibles
- **Recherche** par nom ou référence
- **Onglets** : Tous / Stock bas / Ruptures
- **Catégorie** : filtrer par catégorie de produit

#### Ajuster le stock manuellement
Cliquez sur les **3 points** (⋮) d'un produit, puis **Ajuster le stock**.

Le tiroir d'ajustement vous permet de :
- Choisir le **type de mouvement** : Entrée (réception, retour client) ou Sortie (correction, mise au rebut)
- Saisir la **quantité** à ajouter ou retirer
- Indiquer un **motif** (optionnel)

L'ajustement est immédiatement enregistré dans le journal des mouvements.

#### Voir l'historique d'un produit
Cliquez sur le nom du produit ou sur **Historique** dans le menu (⋮). La page affiche tous les mouvements passés de ce produit avec date, quantité, type et source.

---

### Journal des mouvements

#### Accès
Menu **Stock → Journal des mouvements**

Le journal est la trace complète de chaque entrée et sortie de stock, quelle qu'en soit l'origine.

#### Types de mouvements

| Type | Direction | Origine typique |
|---|---|---|
| **Réception achat** | ↑ Entrée | Commande fournisseur reçue |
| **Vente** | ↓ Sortie | Facture client émise |
| **Ajust. entrée** | ↑ Entrée | Correction manuelle positive |
| **Ajust. sortie** | ↓ Sortie | Correction manuelle négative |
| **Stock initial** | ↑ Entrée | Ouverture du stock au démarrage |
| **Mise au rebut** | ↓ Sortie | Produit endommagé ou périmé |
| **Retour client** | ↑ Entrée | Client retourne la marchandise |
| **Retour fournisseur** | ↓ Sortie | Renvoi de marchandise au fournisseur |
| **Transfert entrée** | ↑ Entrée | Transfert reçu d'un autre dépôt |
| **Transfert sortie** | ↓ Sortie | Transfert envoyé vers un autre dépôt |

#### Colonnes affichées
- **Produit** : nom et référence
- **Type** : badge coloré du type de mouvement
- **Quantité** : montant avec flèche verte (entrée) ou rouge (sortie)
- **Avant / Après** : stock avant et après le mouvement
- **Coût total HT** : valeur de la quantité déplacée (quantité × coût unitaire)
- **Date / Source** : date du mouvement et document ou opération à l'origine (ex : FAC-001, ajustement manuel)

#### Filtres disponibles
- **Type de mouvement** : liste déroulante avec tous les types
- **Période** : date de début et date de fin
- Bouton **Effacer les filtres** pour réinitialiser

---

### Alertes de stock

#### Accès
Menu **Stock → Alertes**

La page liste uniquement les produits qui nécessitent une attention immédiate :
- **Rupture de stock** (quantité = 0) — affiché en rouge
- **Stock bas** (quantité inférieure au seuil minimum) — affiché en orange

#### Colonnes affichées
- **Produit** : nom, référence, catégorie
- **Statut** : badge Rupture ou Stock bas
- **Stock actuel** : quantité disponible
- **Seuil min** : valeur configurée sur le produit
- **Déficit** : écart négatif par rapport au seuil (ex : -5 si le seuil est 10 et le stock est 5)

#### Actions rapides
Sur chaque ligne, deux boutons :
- **Historique** (icône horloge) : voir l'historique complet du produit
- **+** (ajuster) : ouvrir directement le tiroir d'ajustement de stock pour commander ou corriger

> Conseil : consultez les alertes régulièrement et ajustez les seuils minimum dans la fiche produit pour recevoir des alertes au bon moment, avant la rupture réelle.

---

## Flux de travail recommandé

### Mise en place initiale
1. **Créer les catégories** (Menu Produits → Catégories)
2. **Créer les produits** un par un ou via **Import Excel**
3. **Activer la gestion de stock** sur les produits physiques et définir les seuils min/max
4. **Saisir le stock initial** via un ajustement manuel de type "Stock initial" pour chaque produit

### Utilisation courante
- Les **ventes** (factures émises) déduisent automatiquement les quantités du stock
- Les **réceptions fournisseur** ajoutent les quantités
- Consultez les **alertes** régulièrement (hebdomadaire recommandé)
- Utilisez le **journal des mouvements** pour auditer et retrouver l'origine de toute variation de stock

### Inventaire périodique
1. Comparez les quantités dans InvoiceHub avec les quantités réelles (comptage physique)
2. Pour chaque écart, faites un **ajustement manuel** (entrée ou sortie) avec le motif « Inventaire »
3. Le journal conserve la trace de tous les ajustements d'inventaire
