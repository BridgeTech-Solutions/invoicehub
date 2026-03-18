# InvoiceHub v2.0 — Intégration IA Locale avec Ollama
### Proposition de valeur pour Bridge Technologies Solutions (BTS) · Douala, Cameroun

---

## Résumé Exécutif

Cette proposition décrit l'intégration d'une **intelligence artificielle locale** dans InvoiceHub v2.0 via **Ollama**, un moteur d'IA open-source tournant entièrement sur les serveurs de BTS, sans connexion à un service externe payant.

L'objectif : transformer InvoiceHub d'un outil de saisie en un **assistant intelligent** qui aide les équipes à travailler plus vite, à éviter les erreurs et à prendre de meilleures décisions financières — le tout **gratuitement**, **en français**, et **sans envoyer les données de BTS sur Internet**.

---

## Qu'est-ce qu'Ollama ?

**Ollama** est un logiciel open-source (gratuit, licence MIT) qui permet de faire tourner des modèles d'intelligence artificielle (LLM — Large Language Models) **directement sur un serveur local**, sans abonnement ni connexion à un service cloud (ChatGPT, Gemini, Claude...).

```
Situation sans Ollama :              Situation avec Ollama :
─────────────────────────            ─────────────────────────
InvoiceHub ──→ OpenAI API            InvoiceHub ──→ Ollama (serveur BTS)
               (Internet)                           (réseau local)
               (payant)                             (gratuit)
               (données hors BTS)                   (données restent chez BTS)
```

**En résumé :** Ollama apporte la puissance d'une IA de niveau professionnel — comparable à ChatGPT — entièrement hébergée chez BTS, sans coût récurrent, sans risque de fuite de données confidentielles.

---

## Modèle Recommandé : Mistral 7B

### Pourquoi Mistral 7B ?

Parmi tous les modèles disponibles sur Ollama, **Mistral 7B** (`mistral:latest`) est le meilleur choix pour le contexte de BTS Douala.

| Critère | Mistral 7B | Raison du choix |
|---|---|---|
| **Langue française** | Excellent | Développé par une entreprise française (Mistral AI, Paris) — natif en français |
| **Taille du modèle** | 4,1 Go | Tourne sur un simple PC de bureau avec 8 Go de RAM |
| **Vitesse** | Rapide | Réponse en 2-5 secondes sur hardware modeste |
| **Licence** | Apache 2.0 | Usage commercial libre, sans restriction |
| **Précision** | Très bonne | Comparable à GPT-3.5 sur les tâches métier |
| **Contexte Cameroun** | Adapté | Comprend le Franc CFA, SYSCOHADA, les formulations camerounaises |

### Alternative recommandée selon le matériel disponible

| Serveur disponible | Modèle recommandé | RAM requise | Qualité |
|---|---|---|---|
| PC de bureau standard | `mistral:7b` | 8 Go | Très bonne |
| Serveur de bureau performant | `mistral-nemo:12b` | 16 Go | Excellente |
| Serveur dédié | `qwen2.5:14b` | 20 Go | Supérieure |

> **Recommandation pour BTS :** commencer avec `mistral:7b`. Il tourne sur n'importe quel poste moderne et offre des résultats plus que suffisants pour toutes les fonctionnalités décrites ci-dessous.

### Installation en une commande

```bash
# Installer Ollama (une seule fois sur le serveur BTS)
curl -fsSL https://ollama.ai/install.sh | sh

# Télécharger le modèle Mistral 7B (~4 Go)
ollama pull mistral

# Vérifier que ça tourne
ollama run mistral "Bonjour, es-tu opérationnel ?"
```

---

## Ce que l'IA apporte concrètement à InvoiceHub

### Fonctionnalité 1 — Recherche en Langage Naturel Avancée

**Situation actuelle :** InvoiceHub dispose déjà d'un parser de recherche intelligent (mots-clés, montants, dates). Mais ce parser ne comprend que des patterns prédéfinis — il ne "comprend" pas le sens d'une phrase.

**Avec Ollama :** L'IA interprète n'importe quelle question posée en français naturel, même ambiguë ou mal formulée.

| Ce que l'employé tape | Ce que le système trouve |
|---|---|
| `"les factures de Camtel qu'on n'a toujours pas encaissées"` | Factures Camtel → statuts `issued`, `partially_paid`, `overdue` |
| `"ce qu'on a facturé ce trimestre"` | Factures du trimestre en cours |
| `"les gros clients qui paient mal"` | Clients avec taux de recouvrement < 60% et CA > seuil |
| `"combien ORANGE nous doit en ce moment"` | Solde impayé client ORANGE en temps réel |
| `"le devis qu'on a envoyé à MTN le mois dernier"` | Proformas MTN du mois précédent, statut `sent` |

**Comment ça marche :** L'IA reçoit la question, l'analyse, et traduit l'intention en filtres structurés qui interrogent la base de données.

---

### Fonctionnalité 2 — Assistant de Rédaction de Documents

**Situation actuelle :** La création d'une proforma ou d'une facture nécessite de saisir manuellement toutes les lignes, descriptions, conditions de paiement.

**Avec Ollama :** L'employé décrit en quelques mots ce qu'il veut créer, et l'IA prépare le brouillon.

**Exemple concret :**

> L'employé écrit : *"Crée une proforma pour la maintenance mensuelle du réseau de Camtel, 3 jours de travail à 75 000 XAF le jour, avec les conditions habituelles de 30 jours."*

L'IA génère automatiquement :

```
PROFORMA — BTS/DC/2026/03/PFM042

Client      : CAMTEL
Date        : 18/03/2026
Validité    : 18/04/2026 (30 jours)
Conditions  : Paiement à 30 jours

Désignation                          Qté   PU (XAF)    Total HT
──────────────────────────────────────────────────────────────
Maintenance réseau — intervention     3     75 000      225 000
  Ingénieur réseau (journée)

                              Total HT :    225 000 XAF
                              TVA 19,25% :   43 313 XAF
                              Total TTC :   268 313 XAF
```

L'employé n'a plus qu'à vérifier et valider. **La saisie passe de 10 minutes à 30 secondes.**

---

### Fonctionnalité 3 — Rédaction Automatique des Emails de Relance

**Situation actuelle :** Les relances internes sont des alertes automatiques, mais les emails envoyés aux clients doivent être rédigés manuellement.

**Avec Ollama :** Pour chaque facture en retard, l'IA propose un email de relance personnalisé, adapté au niveau de retard et à l'historique du client.

**Exemple — Relance douce (J+7) pour un bon client :**

> *"Madame, Monsieur,*
>
> *Nous nous permettons de vous contacter au sujet de notre facture N° BTS/DC/2026/02/FAC018 d'un montant de 1 450 000 XAF, émise le 12 février 2026 et arrivée à échéance le 14 mars 2026.*
>
> *Sauf erreur de notre part, nous n'avons pas encore reçu le règlement correspondant. Pourriez-vous nous confirmer la bonne réception de cette facture et nous indiquer la date de paiement prévue ?*
>
> *Nous restons à votre disposition pour tout renseignement complémentaire.*
>
> *Cordialement,*
> *L'équipe commerciale Bridge Technologies Solutions*"

**Exemple — Relance ferme (J+30) pour un client mauvais payeur :**

> *"Madame, Monsieur,*
>
> *Malgré nos précédentes relances, nous constatons que la facture N° BTS/DC/2026/02/FAC018 d'un montant de 1 450 000 XAF reste impayée depuis 30 jours.*
>
> *Nous vous demandons de régulariser cette situation dans les plus brefs délais. Sans retour de votre part dans les 48 heures, nous serons contraints de suspendre nos prestations et d'engager les démarches de recouvrement prévues par notre contrat.*
>
> *Veuillez agréer nos salutations distinguées.*"

L'IA adapte automatiquement le ton selon : le nombre de jours de retard, les relances déjà envoyées, et l'historique de paiement du client.

---

### Fonctionnalité 4 — Analyse Financière Intelligente du Tableau de Bord

**Situation actuelle :** Le tableau de bord affiche des chiffres et des graphiques. L'interprétation est laissée à l'utilisateur.

**Avec Ollama :** Chaque matin, l'IA génère un **résumé exécutif** en français, lisible en 30 secondes.

**Exemple de résumé généré automatiquement :**

> **Synthèse financière du 18 mars 2026**
>
> Le chiffre d'affaires de mars est de **3 850 000 XAF**, en hausse de 12% par rapport à février. Sur les 47 factures actives, **8 sont en retard** pour un total de 2,1M XAF.
>
> ⚠️ **Point d'attention :** La facture FAC018 (Camtel, 1,45M XAF) est en retard de 30 jours. C'est votre créance la plus ancienne. Une action de recouvrement est recommandée.
>
> ✅ **Bonne nouvelle :** MTN a réglé 750 000 XAF hier, soldant intégralement son compte.
>
> 📈 **Tendance :** Le taux de recouvrement sur 30 jours est de 78%, en amélioration par rapport aux 71% du mois dernier.

---

### Fonctionnalité 5 — Détection d'Anomalies et Alertes Intelligentes

L'IA analyse en continu les données et détecte des situations inhabituelles que les indicateurs classiques ne capturent pas.

**Exemples d'alertes générées automatiquement :**

- *"La facture FAC031 pour Orange a un montant de 12 500 XAF — soit 15 fois moins que vos factures habituelles pour ce client. Vérification recommandée avant émission."*

- *"Vous avez créé 3 factures pour Camtel ce mois-ci, alors que la moyenne historique est de 1 par mois. Y a-t-il une erreur de doublon ?"*

- *"Le client SOCATEL n'a passé aucune commande depuis 4 mois, alors qu'il commandait habituellement tous les 6 semaines. Risque de perte de client à surveiller."*

- *"Le taux de TVA appliqué sur la proforma PFM039 est de 0% alors que ce type de prestation est normalement soumis à TVA. Vérification nécessaire."*

---

### Fonctionnalité 6 — Catégorisation Automatique des Produits et Services

Quand un nouveau produit ou service est ajouté au catalogue, l'IA suggère automatiquement :
- La catégorie la plus appropriée
- L'unité de facturation (jour, heure, forfait, licence...)
- Une fourchette de prix cohérente avec les autres produits de la même catégorie

---

### Fonctionnalité 7 — Assistant de Paramétrage

Quand un administrateur configure InvoiceHub (taux de TVA, conditions de paiement, niveaux de relance...), l'IA explique chaque paramètre en langage simple et suggère les valeurs les plus adaptées au contexte BTS.

---

## Bénéfices concrets par employé

### La Direction
- Reçoit chaque matin un résumé financier intelligible sans ouvrir le tableau de bord
- L'IA signale proactivement les situations à risque (gros impayés, baisse de CA, perte de client)
- Les rapports générés sont rédigés en français professionnel, directement partageables avec des partenaires ou la banque

### Le Commercial
- Crée une proforma en dictant son besoin au lieu de tout saisir manuellement
- Recherche n'importe quelle information en posant une question naturelle
- Reçoit des suggestions de prix basées sur l'historique du client
- Les emails de relance sont rédigés automatiquement — il n'a plus qu'à relire et envoyer

### Le Comptable / Gestionnaire
- L'IA détecte automatiquement les incohérences fiscales (mauvais taux TVA, montants suspects)
- La réconciliation bancaire est assistée : l'IA suggère le rapprochement entre paiements reçus et factures
- Le récapitulatif TVA est commenté et préparé pour la déclaration

### L'Employé Standard
- Peut poser des questions sur l'état des dossiers en langage naturel sans connaître les filtres
- Reçoit des suggestions lors de la saisie d'un document

---

## Comparaison : IA Locale (Ollama) vs IA Cloud (OpenAI / ChatGPT)

| Critère | Ollama (local) | OpenAI / ChatGPT |
|---|---|---|
| **Coût** | **0 XAF / mois** | 100 000 – 500 000+ XAF / mois |
| **Confidentialité** | **Données restent chez BTS** | Données envoyées aux USA |
| **Connexion Internet** | **Non requise** | Requise en permanence |
| **Disponibilité** | **100%** (local) | Dépend d'un service tiers |
| **Langue française** | Très bonne | Excellente |
| **Personnalisation** | Possible (fine-tuning) | Limitée |
| **Conformité RGPD / données** | **Totale** | Partielle |
| **Dépendance fournisseur** | **Aucune** | Fort lock-in |

> **Conclusion :** Ollama offre 90% de la qualité de ChatGPT, à 0% du coût, avec 100% de confidentialité. Pour un cabinet ou une entreprise traitant des données financières sensibles, c'est le choix le plus responsable.

---

## Configuration matérielle requise

### Configuration minimale (recommandée pour démarrer)

| Composant | Spécification minimale |
|---|---|
| CPU | Intel Core i5 / AMD Ryzen 5 (génération récente) |
| RAM | **8 Go** (Mistral 7B utilise ~5 Go) |
| Stockage | 10 Go libres pour le modèle + données |
| OS | Windows 10/11, Linux Ubuntu 20+, macOS 12+ |
| GPU | **Non requis** (le CPU suffit) |

> Sur cette configuration, Mistral 7B répond en **3 à 8 secondes** — suffisant pour un usage professionnel.

### Configuration optimale (si serveur dédié)

| Composant | Spécification optimale |
|---|---|
| CPU | 8+ cœurs |
| RAM | 16-32 Go |
| GPU | NVIDIA avec 8+ Go VRAM (optionnel mais x5-10 plus rapide) |
| Stockage | SSD 50 Go |

> Avec GPU, les réponses passent à **< 1 seconde**.

---

## Architecture d'intégration dans InvoiceHub

L'intégration est conçue pour être **non-intrusive** : Ollama s'ajoute comme un service optionnel. Si Ollama n'est pas disponible, InvoiceHub fonctionne exactement comme avant.

```
┌─────────────────────────────────────────────────────────────────┐
│                        Réseau BTS (local)                       │
│                                                                 │
│  Interface Web                API InvoiceHub      Ollama        │
│  (bridge-frontend)            (bridge-backend)    (port 11434)  │
│       │                            │                   │        │
│       │  "Trouve les              │                   │        │
│       │   impayés Camtel"         │                   │        │
│       │─────────────────────────→ │                   │        │
│       │                           │  POST /api/chat   │        │
│       │                           │──────────────────→│        │
│       │                           │  { "intent":      │        │
│       │                           │    "search",      │        │
│       │                           │    "filters": {   │        │
│       │                           │      client:"Camtel",       │
│       │                           │      status:"overdue"}}     │
│       │                           │←──────────────────│        │
│       │                           │                   │        │
│       │    Résultats +            │  Requête DB       │        │
│       │    résumé IA              │───→ PostgreSQL     │        │
│       │←─────────────────────────│                   │        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Ce qui est ajouté au backend InvoiceHub

Un nouveau module `src/modules/ai/` contenant :

```
src/modules/ai/
├── ai.service.ts        # Client Ollama + prompts métier
├── ai.routes.ts         # Routes /api/ai/*
└── prompts/
    ├── search.prompt.ts      # Interprétation de requête
    ├── draft.prompt.ts       # Génération de brouillon document
    ├── reminder.prompt.ts    # Rédaction email de relance
    ├── analysis.prompt.ts    # Synthèse financière quotidienne
    └── anomaly.prompt.ts     # Détection d'anomalies
```

**Endpoints ajoutés :**

```
POST /api/ai/search        — Interprète une question en filtres structurés
POST /api/ai/draft         — Génère le brouillon d'un document
POST /api/ai/reminder      — Rédige un email de relance client
GET  /api/ai/daily-summary — Synthèse financière du jour
GET  /api/ai/anomalies     — Liste les anomalies détectées
GET  /api/ai/status        — Vérifie si Ollama est disponible
```

---

## Plan de déploiement

### Phase 1 — Installation (Semaine 1)
- [ ] Installer Ollama sur le serveur BTS
- [ ] Télécharger et tester le modèle Mistral 7B
- [ ] Vérifier les performances sur le matériel disponible
- [ ] Intégrer le module `ai/` dans InvoiceHub backend

### Phase 2 — Fonctionnalités prioritaires (Semaine 2-3)
- [ ] Recherche en langage naturel avancée
- [ ] Synthèse financière quotidienne automatique
- [ ] Détection d'anomalies sur les factures

### Phase 3 — Fonctionnalités avancées (Semaine 4-5)
- [ ] Assistant de rédaction de proformas/factures
- [ ] Génération automatique des emails de relance
- [ ] Intégration dans l'interface frontend (bouton "Demander à l'IA")

### Phase 4 — Amélioration continue
- [ ] Ajustement des prompts selon les retours des équipes
- [ ] Évaluation du passage à un modèle plus grand si nécessaire

---

## Estimation du retour sur investissement

### Temps gagné par semaine (estimation conservatrice)

| Tâche | Temps actuel | Avec l'IA | Gain / semaine |
|---|---|---|---|
| Création d'une proforma (5/sem.) | 10 min × 5 = 50 min | 2 min × 5 = 10 min | **40 min** |
| Recherche dans les factures | 8 min / jour × 5 = 40 min | 1 min × 5 = 5 min | **35 min** |
| Rédaction emails relance | 20 min / relance × 3 = 60 min | 2 min × 3 = 6 min | **54 min** |
| Lecture dashboard + rapport | 30 min | 5 min (synthèse IA) | **25 min** |
| **Total** | | | **~2h30 / semaine** |

> **Sur 1 an :** 2h30 × 48 semaines = **120 heures par employé** récupérées pour des tâches à valeur ajoutée.

### Coût de déploiement vs économies

| Poste | Coût unique | Coût mensuel |
|---|---|---|
| Mise en place technique | (inclus dans le développement) | — |
| Abonnement Ollama | 0 XAF | **0 XAF** |
| Abonnement ChatGPT (équivalent) | — | 100 000+ XAF |
| **Économie sur 12 mois** | | **1 200 000+ XAF** |

---

## Questions Fréquentes

**Q : L'IA peut-elle faire des erreurs ?**
> Oui, comme tout assistant humain. C'est pourquoi l'IA génère des *suggestions* que l'employé vérifie avant de valider — elle ne prend aucune décision de manière autonome. L'employé reste toujours maître de l'action finale.

**Q : Les données de BTS sont-elles en sécurité ?**
> Absolument. Ollama tourne entièrement sur les serveurs de BTS. Aucune donnée (nom de client, montant de facture, etc.) ne quitte le réseau interne. C'est la principale raison de choisir Ollama plutôt que ChatGPT.

**Q : Faut-il une connexion Internet pour que l'IA fonctionne ?**
> Non. Une fois installé et le modèle téléchargé (opération unique), Ollama fonctionne en totalement hors-ligne. Coupures Internet, lenteurs réseau — l'IA n'est pas affectée.

**Q : L'IA comprend-elle le français camerounais ?**
> Mistral 7B comprend parfaitement le français standard utilisé dans les contextes professionnels camerounais (courriers, factures, relances). Il connaît également le Franc CFA (XAF), la TVA camerounaise (19,25%), et les usages comptables SYSCOHADA.

**Q : Que se passe-t-il si Ollama est arrêté ?**
> InvoiceHub continue de fonctionner normalement — les fonctionnalités IA deviennent simplement indisponibles. L'IA est un module additionnel, pas un composant critique du système.

**Q : Peut-on améliorer le modèle avec le temps ?**
> Oui. Il est possible de former le modèle sur les données spécifiques de BTS (historique de factures, vocabulaire métier) pour améliorer encore la précision. C'est une étape optionnelle et progressive.

---

## Conclusion

L'intégration d'Ollama avec Mistral 7B dans InvoiceHub représente une **opportunité sans équivalent** pour BTS :

**Techniquement :** Un modèle d'IA de niveau professionnel, gratuit, local, sécurisé, en français, opérationnel en moins d'une semaine sur le matériel existant.

**Pour les équipes :** Moins de saisie manuelle, moins d'erreurs, moins de temps passé à chercher des informations — plus de temps pour le travail à valeur ajoutée et la relation client.

**Financièrement :** Aucun coût récurrent. L'économie par rapport à un abonnement cloud équivalent dépasse **1 200 000 XAF par an**.

**Stratégiquement :** BTS se dote d'un outil de facturation intelligent que très peu d'entreprises de la région possèdent — un avantage concurrentiel réel pour attirer et fidéliser les clients exigeants.

---

*InvoiceHub v2.0 + Ollama (Mistral 7B) — Bridge Technologies Solutions · Douala, Cameroun*
*Développé en 2026 · Conformité SYSCOHADA · IA 100% locale · Données confidentielles protégées*
