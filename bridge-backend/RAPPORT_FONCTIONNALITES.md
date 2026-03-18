# Rapport Fonctionnel — InvoiceHub v2.0
## Plateforme de Gestion de Facturation et Devis

**Projet** : InvoiceHub v2.0
**Entreprise** : Bridge Technologies Solutions (BTS) — Douala, Cameroun
**Type** : API REST — Application de gestion de facturation d'entreprise
**Conformité** : SYSCOHADA (Système Comptable OHADA)
**Date du rapport** : Mars 2026

---

## 1. Présentation Générale

InvoiceHub v2.0 est une plateforme de gestion de facturation et de devis conçue pour une entreprise de services informatiques basée à Douala. Elle couvre l'intégralité du cycle de vie commercial : de la création d'un devis jusqu'à l'encaissement du paiement, en passant par l'émission des factures, le suivi des relances et la génération des documents PDF officiels.

La plateforme respecte les normes comptables SYSCOHADA en vigueur en Afrique Centrale, notamment en ce qui concerne la numérotation séquentielle et continue des documents officiels (aucun saut de numéro autorisé).

Elle est accessible exclusivement via une API REST sécurisée, destinée à être consommée par une application web ou mobile front-end.

---

## 2. Architecture Fonctionnelle

La plateforme est organisée en **13 modules fonctionnels** interconnectés :

1. Authentification et sécurité
2. Gestion des utilisateurs
3. Gestion des clients
4. Catalogue de produits et services
5. Gestion des devis (proformas)
6. Gestion des factures
7. Enregistrement des paiements
8. Facturation récurrente automatique
9. Notifications
10. Tableau de bord (KPIs)
11. Recherche intelligente
12. Paramètres de l'entreprise
13. Journal d'audit

---

## 3. Module Authentification et Sécurité

Ce module gère l'ensemble des accès à la plateforme. Il constitue le point d'entrée obligatoire pour tout utilisateur.

### 3.1 Connexion et gestion de session
Un utilisateur s'authentifie avec son adresse email et son mot de passe. Après vérification, la plateforme émet deux jetons : un **jeton d'accès** (valide 15 minutes) et un **jeton de renouvellement** (valide 7 jours). Ce mécanisme à double jeton garantit que les sessions restent actives sans exposer les identifiants de manière permanente.

Chaque renouvellement de session génère une nouvelle paire de jetons, invalidant les précédents. L'historique de connexion (adresse IP, navigateur, date) est conservé pour chaque utilisateur.

### 3.2 Authentification à deux facteurs (2FA)
Les utilisateurs peuvent activer une couche de sécurité supplémentaire via l'authentification à deux facteurs de type TOTP (Time-based One-Time Password), compatible avec les applications Google Authenticator, Authy, et tout autre gestionnaire TOTP standard.

Lors de l'activation, la plateforme génère **8 codes de secours à usage unique**. Ces codes permettent à l'utilisateur de se connecter même s'il n'a plus accès à son application TOTP (perte de téléphone). Chaque code de secours est consommé dès son utilisation et ne peut plus être réutilisé. L'utilisateur peut regénérer un nouveau jeu de codes à tout moment.

### 3.3 Gestion des sessions actives
Un utilisateur peut consulter la liste de toutes ses sessions actives sur différents appareils, avec les informations d'identification (appareil, adresse IP, date de connexion). Il peut révoquer une session spécifique à distance ou déconnecter l'ensemble de ses autres sessions simultanément.

### 3.4 Réinitialisation du mot de passe
En cas d'oubli de mot de passe, l'utilisateur reçoit par email un lien de réinitialisation sécurisé à durée de vie limitée.

### 3.5 Protection contre les attaques
Le système intègre une protection automatique contre les tentatives de connexion répétées (brute-force). Après un nombre configurable d'échecs, le compte est temporairement verrouillé.

---

## 4. Module Gestion des Utilisateurs

Ce module permet à l'administrateur de gérer les comptes du personnel de l'entreprise.

### 4.1 Système de rôles (RBAC)
La plateforme distingue trois niveaux d'accès :
- **Administrateur** : accès complet à toutes les fonctionnalités, y compris la configuration, la suppression de données et la consultation des journaux d'audit.
- **Commercial** : gestion des clients, création et émission de factures et devis, enregistrement de paiements.
- **Employé** : consultation des données, accès restreint aux actions de modification.

### 4.2 Gestion des comptes
L'administrateur peut créer, modifier et désactiver des comptes utilisateurs. La désactivation est réversible (suppression douce) : aucun compte n'est définitivement effacé, ce qui préserve l'intégrité de l'historique.

Chaque utilisateur peut mettre à jour son propre profil (nom, téléphone, préférences de langue et de thème visuel) et changer son mot de passe de manière autonome.

---

## 5. Module Gestion des Clients

Ce module centralise toutes les informations relatives aux clients de l'entreprise.

### 5.1 Fiche client complète
Chaque fiche client enregistre les informations légales et commerciales : raison sociale, coordonnées, numéro de contribuable, numéro RCCM, type de client (entreprise ou particulier), délai de paiement habituel (en jours).

### 5.2 Résumé financier
Pour chaque client, la plateforme calcule automatiquement une synthèse financière : montant total facturé, montant encaissé, solde restant dû, nombre de factures par statut.

### 5.3 Pré-remplissage intelligent du formulaire (Quick-fill)
Lors de la création d'une nouvelle facture pour un client existant, la plateforme propose automatiquement des informations pré-remplies basées sur l'historique commercial. Cela inclut :
- Les conditions de paiement appliquées lors de la dernière commande
- La remise habituelle accordée à ce client
- Le solde des factures impayées en cours (avec alerte si des impayés existent)
- Le comportement de paiement du client : délai moyen de règlement, taux de paiement à temps
- La liste des 5 produits ou services les plus fréquemment commandés par ce client, avec le dernier prix pratiqué

Cette fonctionnalité réduit significativement le temps de saisie et aide le commercial à adapter ses conditions en connaissance de cause.

---

## 6. Module Catalogue Produits et Services

Ce module gère les références commerciales de l'entreprise.

### 6.1 Organisation par catégories
Les produits et services sont organisés en catégories personnalisables (exemples : Maintenance, Développement, Formation, Matériel).

### 6.2 Fiche produit
Chaque fiche contient la désignation, la description, la référence interne, le type (produit physique ou service), l'unité de mesure, et le prix unitaire hors taxes du catalogue.

### 6.3 Liste intelligente par client
Lorsqu'un commercial sélectionne un client avant de rechercher un produit, la liste des produits est enrichie et triée différemment : les articles les plus fréquemment commandés par ce client apparaissent en tête de liste, annotés avec le nombre de commandes passées et le dernier prix qui lui a été appliqué.

### 6.4 Défauts de ligne automatiques
Lors de la sélection d'un produit dans une ligne de devis ou de facture, la plateforme renseigne automatiquement tous les champs de la ligne : désignation, description, unité, prix, taux de TVA, quantité par défaut. Si le client a déjà commandé ce produit, le dernier prix pratiqué et la dernière quantité sont également proposés. Un indicateur visuel signale si le prix du catalogue a changé depuis la dernière commande.

---

## 7. Module Gestion des Devis (Proformas)

Ce module couvre la phase commerciale avant facturation.

### 7.1 Création d'un devis
Un devis regroupe les informations du client, un objet, une date de validité, une remise globale éventuelle, des notes et un ensemble de lignes de prestation. Chaque ligne capture le prix au moment de la création, indépendamment des éventuelles modifications ultérieures du catalogue.

Le numéro de devis est généré automatiquement et de manière séquentielle par la base de données, selon le format SYSCOHADA : `BTS/DC/2026/03/PFM001`. Aucun saut de numéro n'est possible.

### 7.2 Cycle de vie d'un devis
Un devis traverse les statuts suivants :
- **Brouillon** : en cours de rédaction, modifiable.
- **Envoyé** : transmis au client par email avec le PDF en pièce jointe, plus modifiable.
- **Accepté** : le client a donné son accord.
- **Rejeté** : le client a refusé (avec motif enregistré).
- **Expiré** : la date de validité est dépassée (mis à jour automatiquement chaque nuit).

### 7.3 Conversion en facture
Un devis accepté peut être converti en facture en un clic. La conversion peut générer une **facture standard** ou une **facture d'acompte** (avec un pourcentage du montant total). Toutes les lignes et conditions sont reprises automatiquement.

### 7.4 Duplication
N'importe quel devis peut être dupliqué pour créer un nouveau brouillon avec les mêmes informations. Ceci est utile pour les commandes récurrentes similaires.

### 7.5 Génération PDF
Le devis peut être téléchargé au format PDF à tout moment. Le document intègre l'en-tête, le pied de page et le cachet officiel de l'entreprise, ainsi que les coordonnées légales du client.

---

## 8. Module Gestion des Factures

C'est le module central de la plateforme. Il gère l'ensemble des documents de facturation officiels.

### 8.1 Types de factures
La plateforme gère cinq types de factures, chacun répondant à un cas d'usage comptable distinct :

- **Facture standard** : facture classique pour une prestation ou une vente.
- **Facture d'acompte** : demande de règlement partiel (exemple : 30% à la commande). Elle est liée au projet global mais ne facture qu'une fraction du montant.
- **Facture de solde** : règlement du solde restant dû après un ou plusieurs acomptes. Le montant est calculé automatiquement par déduction des acomptes déjà encaissés.
- **Avoir (note de crédit)** : document généré automatiquement lors de l'annulation d'une facture déjà émise. L'avoir annule comptablement la créance correspondante.
- **Facture récurrente** : facture générée automatiquement selon un modèle programmé (voir Module 10).

### 8.2 Numérotation SYSCOHADA
La numérotation est assurée par un mécanisme atomique au niveau de la base de données qui garantit l'absence de trou dans la séquence, même en cas d'accès simultanés multiples. Format : `BTS/DC/2026/03/FAC001`.

### 8.3 Calcul à sec avant création (Dry-Run)
Avant de créer une facture, le commercial peut soumettre les lignes et les conditions pour obtenir une simulation complète : totaux HT, TVA par taux, remises, net TTC. Cette simulation retourne également des **avertissements intelligents** :
- Solde impayé existant chez le client
- Montant inhabituel par rapport à l'historique de ce client
- Risque de doublon (facture similaire créée récemment pour le même client)
- Référence client déjà utilisée sur une autre facture

### 8.4 Cycle de vie d'une facture
- **Brouillon** : en cours de rédaction, modifiable.
- **Émise** : envoyée officiellement au client par email, numéro définitivement assigné, plus modifiable.
- **Partiellement payée** : un ou plusieurs paiements reçus mais le solde n'est pas apuré.
- **Payée** : solde intégralement réglé.
- **En retard** : la date d'échéance est dépassée (mise à jour automatique chaque nuit).
- **Annulée** : facture annulée avec génération automatique d'un avoir.

### 8.5 Annulation et avoir automatique
Lorsqu'une facture déjà émise est annulée (avec saisie obligatoire du motif), la plateforme génère automatiquement et dans la même opération un avoir correspondant. Ce mécanisme garantit la traçabilité comptable sans rupture.

### 8.6 Duplication
Une facture peut être dupliquée pour créer un nouveau brouillon. Ceci est utile pour refacturer les mêmes prestations à un client.

### 8.7 Export CSV
L'ensemble des factures (avec les filtres appliqués : statut, type, client, période) peut être exporté au format CSV, compatible avec Excel et Google Sheets, pour traitement comptable externe.

### 8.8 Génération PDF
Chaque facture peut être téléchargée au format PDF, avec un rendu graphique propre aux couleurs de BTS. Quatre mises en page distinctes selon le type de document : standard, acompte, solde, avoir.

---

## 9. Module Enregistrement des Paiements

Ce module gère les encaissements liés aux factures.

### 9.1 Enregistrement d'un paiement
Un paiement peut être enregistré à tout moment sur une facture émise. Les informations saisies comprennent le montant, la méthode de règlement (virement bancaire, espèces, chèque, mobile money), la référence de transaction, la date effective d'encaissement et d'éventuelles notes.

### 9.2 Mise à jour automatique du solde
À chaque enregistrement, la plateforme recalcule automatiquement le montant restant dû et met à jour le statut de la facture : si le solde est partiellement couvert, le statut passe à "partiellement payée" ; si le solde est intégralement couvert, le statut passe à "payée".

### 9.3 Historique des encaissements
L'ensemble des paiements enregistrés est consultable avec des filtres par facture, méthode, ou période.

### 9.4 Suppression d'un paiement
En cas d'erreur, un administrateur peut supprimer un paiement. Le solde de la facture est recalculé automatiquement.

---

## 10. Module Facturation Récurrente

Ce module automatise la génération de factures pour des prestations contractuelles répétitives (maintenance mensuelle, abonnement, etc.).

### 10.1 Modèle de facturation récurrente
Un modèle définit les lignes de prestation, le client, la fréquence (mensuelle, trimestrielle, semestrielle, annuelle) et le jour de génération. Il peut être configuré pour émettre la facture automatiquement (mode automatique) ou pour la créer en brouillon pour validation manuelle.

### 10.2 Génération automatique
Chaque nuit, un processus automatique vérifie les modèles dont la date de prochaine génération est atteinte et crée les factures correspondantes.

### 10.3 Génération manuelle
Un commercial peut déclencher manuellement la génération d'une facture depuis un modèle, sans attendre la date programmée.

---

## 11. Module Notifications

Ce module informe les utilisateurs des événements importants survenant dans la plateforme.

### 11.1 Notifications en temps réel
Les notifications sont transmises instantanément aux utilisateurs connectés via une connexion permanente (WebSocket). Aucun rechargement de page n'est nécessaire pour recevoir une alerte.

### 11.2 Types d'événements notifiés
Onze types d'événements déclenchent des notifications :
- Devis envoyé, accepté, rejeté ou expiré
- Facture émise, payée, partiellement payée ou passée en retard
- Paiement enregistré
- Rappel de paiement interne
- Notifications système (maintenance, mises à jour)

### 11.3 Canaux de notification
Chaque utilisateur choisit, par type d'événement, le canal de notification souhaité :
- **In-app uniquement** : la notification apparaît dans l'interface.
- **Email uniquement** : un email est envoyé à l'adresse de l'utilisateur.
- **Les deux** : notification in-app et email simultanément.
- **Désactivé** : aucune notification pour ce type d'événement.

---

## 12. Module Relances Automatiques d'Escalade

Ce module gère les alertes internes auprès de l'équipe BTS lorsque des factures restent impayées après leur date d'échéance. Les relances sont envoyées **à l'équipe interne uniquement**, jamais directement au client.

### 12.1 Quatre niveaux d'escalade
Le système distingue quatre niveaux de relance, déclenchés progressivement en fonction du nombre de jours de retard :

- **Niveau 1 — Douce (J+0)** : alerte in-app au commercial responsable de la facture, dès le premier jour de retard. Ton informatif.
- **Niveau 2 — Ferme (J+7)** : alerte in-app et email au commercial responsable, après 7 jours de retard.
- **Niveau 3 — Urgente (J+15)** : alerte in-app et email au commercial responsable et aux managers, après 15 jours de retard.
- **Niveau 4 — Critique (J+30)** : alerte in-app et email à toute l'équipe concernée, après 30 jours de retard. Ton de mise en demeure.

### 12.2 Robustesse du système
Le niveau d'escalade atteint est mémorisé sur chaque facture. Si le processus automatique ne s'exécute pas un jour donné (maintenance, panne), il reprend exactement là où il devait en être lors de sa prochaine exécution, sans jamais répéter un niveau déjà envoyé.

### 12.3 Réinitialisation automatique
Dès qu'un paiement est enregistré et que la facture est soldée, le compteur d'escalade est réinitialisé à zéro.

### 12.4 Configuration
Les niveaux d'escalade, les délais et les destinataires sont entièrement configurables par l'administrateur depuis le module Paramètres.

---

## 13. Module Tableau de Bord (KPIs)

Ce module fournit une vue synthétique de la santé financière de l'entreprise.

### 13.1 Indicateurs disponibles
- **Chiffre d'affaires** : mois en cours vs mois précédent, avec taux de croissance
- **Répartition des factures** : nombre total par statut (brouillon, émises, payées, en retard, annulées)
- **Top clients** : classement des clients par chiffre d'affaires généré
- **Évolution mensuelle** : courbe du chiffre d'affaires sur les 12 derniers mois, HT et TTC

### 13.2 Performances
Les données du tableau de bord sont mises en cache pendant 5 minutes. Ce cache est automatiquement invalidé dès qu'un événement financier significatif survient (paiement enregistré, facture émise ou annulée), garantissant à la fois la réactivité et les performances.

---

## 14. Module Recherche Intelligente

Ce module permet de retrouver n'importe quelle information dans la plateforme via une barre de recherche unifiée, en langage naturel.

### 14.1 Analyse de la requête
Avant d'interroger la base de données, la plateforme analyse automatiquement la requête saisie pour en extraire les intentions de l'utilisateur : filtres de montant, de période, de statut, ou référence directe à un numéro de document.

### 14.2 Navigation directe
Si la requête contient un numéro de document reconnu (format `FAC-031` ou `BTS/DC/2026/03/FAC001`), la plateforme retourne directement le document correspondant avec un lien de navigation.

### 14.3 Filtres par langage naturel
La recherche reconnaît les expressions suivantes, combinables entre elles :

| Ce que l'utilisateur tape | Ce que le système comprend |
|---|---|
| `impayé`, `en retard` | Factures avec statut "overdue" |
| `brouillon` | Documents en statut "draft" |
| `envoyé`, `émis` | Proformas envoyées ou factures émises |
| `payé`, `accepté` | Statuts finaux positifs |
| `annulé` | Statuts annulés |
| `> 500000`, `>= 1M`, `< 200K` | Filtre sur le montant |
| `janvier`, `mars`, `décembre` | Filtre sur le mois |
| `2025`, `2026` | Filtre sur l'année |

### 14.4 Résultats multi-entités
Une seule requête interroge simultanément les factures, les proformas, les clients, les produits et (pour les administrateurs) les utilisateurs.

---

## 15. Module Paramètres de l'Entreprise

Ce module centralise la configuration générale de la plateforme, accessible uniquement à l'administrateur.

### 15.1 Identité légale
Raison sociale, adresse, téléphone, email, numéro de contribuable, RCCM, devise (XAF par défaut), taux de TVA par défaut.

### 15.2 Configuration de la numérotation
Préfixes des séquences de documents (ex: `FAC` pour les factures, `PFM` pour les proformas), bureau de rattachement (utilisé dans le format SYSCOHADA).

### 15.3 Règles commerciales
Délai de paiement par défaut (en jours), nombre de jours avant relance automatique.

### 15.4 Configuration des relances d'escalade
Personnalisation complète des 4 niveaux de relance : délai de déclenchement, intitulé, destinataires (créateur, managers), canal (in-app et/ou email).

---

## 16. Module Journal d'Audit

Ce module enregistre de manière permanente et immuable toutes les actions effectuées sur la plateforme.

### 16.1 Traçabilité complète
Chaque création, modification ou suppression de données génère automatiquement une entrée dans le journal. Chaque entrée contient : l'utilisateur auteur de l'action, la nature de l'action, la table concernée, l'identifiant de l'enregistrement, l'état avant et après modification, l'adresse IP et le navigateur utilisés, la date et l'heure exactes.

### 16.2 Immutabilité garantie
Une règle au niveau de la base de données interdit toute modification ou suppression des entrées du journal, même par un administrateur. L'historique est donc inaltérable, ce qui est une exigence de conformité comptable SYSCOHADA.

### 16.3 Consultation filtrée
L'administrateur peut consulter le journal en filtrant par table concernée, type d'action, utilisateur, ou plage de dates.

---

## 17. Processus Automatiques (Tâches de Fond)

Cinq processus s'exécutent automatiquement en arrière-plan, indépendamment des actions des utilisateurs :

| Processus | Fréquence | Description |
|---|---|---|
| Envoi d'emails | À la demande | Envoi des emails transactionnels avec 3 tentatives automatiques en cas d'échec |
| Notifications | À la demande | Création et diffusion des notifications in-app et emails selon les préférences |
| Mise à jour des retards | Chaque nuit à 00h05 | Identifie les factures dont l'échéance est dépassée et les proformas expirées |
| Facturation récurrente | Chaque nuit à 00h10 | Génère les factures des modèles récurrents arrivés à échéance |
| Relances d'escalade | Chaque nuit à 00h15 | Évalue le niveau de relance à envoyer pour chaque facture en retard |

---

## 18. Règles Métier et Conformité SYSCOHADA

| Règle | Application dans la plateforme |
|---|---|
| Numérotation continue sans trou | Mécanisme de séquençage atomique en base de données |
| Conservation des prix | Les lignes de devis et factures capturent les prix au moment de la création. Une modification ultérieure du catalogue n'affecte pas les documents existants |
| Génération automatique d'avoir | Tout annulation d'une facture émise génère un avoir dans la même opération |
| Suppression douce | Les utilisateurs, clients et documents ne sont jamais effacés physiquement. Ils sont archivés avec une date de désactivation |
| Audit immuable | Le journal d'audit ne peut être ni modifié ni supprimé |
| Cycle acompte-solde | La facture de solde déduit automatiquement les acomptes déjà encaissés |

---

## 19. Sécurité de la Plateforme

| Mécanisme | Description |
|---|---|
| Authentification par jetons | Jeton d'accès de courte durée (15 min) + jeton de renouvellement de longue durée (7 jours) |
| Stockage sécurisé | Les jetons de renouvellement et les mots de passe sont stockés sous forme hachée (SHA-256 et bcrypt). Jamais en clair |
| Authentification à deux facteurs | TOTP standard + 8 codes de secours à usage unique |
| Gestion des sessions | Consultation et révocation à distance des sessions actives |
| Protection brute-force | Verrouillage automatique du compte après plusieurs échecs de connexion |
| Contrôle d'accès par rôle | Chaque route vérifie les droits de l'utilisateur avant d'exécuter toute action |
| Limitation du débit | Maximum 300 requêtes par 15 minutes par adresse IP · Maximum 10 connexions par 15 minutes · Maximum 10 téléchargements PDF par minute par utilisateur |
| En-têtes de sécurité HTTP | Activation des protections standard du navigateur (XSS, clickjacking, MIME sniffing) |
| Cloisonnement CORS | L'API n'accepte que les requêtes provenant du domaine de l'application front-end |

---

## 20. Synthèse des Fonctionnalités

### Fonctionnalités Standard
- Authentification sécurisée avec gestion de sessions
- Gestion complète du personnel (CRUD + rôles)
- Gestion complète des clients avec historique financier
- Catalogue produits et services avec catégories
- Devis avec cycle de vie complet et génération PDF
- Factures (5 types) avec cycle de vie complet et génération PDF
- Enregistrement et suivi des paiements
- Facturation récurrente automatisée
- Notifications multi-canaux configurables
- Tableau de bord avec indicateurs financiers clés
- Paramétrage complet de l'entreprise
- Journal d'audit immuable

### Fonctionnalités Intelligentes (Valeur Ajoutée)
- **Authentification à deux facteurs avec codes de secours** : sécurité renforcée sans perte d'accès
- **Pré-remplissage intelligent** : analyse de l'historique client pour accélérer la saisie
- **Suggestion de produits par client** : tri et annotation selon la fréquence d'utilisation
- **Défauts de ligne automatiques** : remplissage automatique des champs lors de la sélection d'un produit
- **Simulation financière avant création** : calcul de devis/facture avec alertes avant toute validation
- **Relances d'escalade progressives** : alertes internes graduées selon l'ancienneté du retard
- **Recherche en langage naturel** : interprétation de requêtes textuelles sur toutes les entités
- **Navigation directe par numéro** : accès immédiat à un document depuis la barre de recherche
- **Avoir automatique à l'annulation** : conformité comptable sans action manuelle supplémentaire
- **Cache intelligent du tableau de bord** : performances optimisées avec invalidation automatique

---

*Rapport établi dans le cadre du projet InvoiceHub v2.0 — Bridge Technologies Solutions — Douala, Cameroun*
*Mars 2026*
