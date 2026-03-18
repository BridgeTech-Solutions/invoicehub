# InvoiceHub v2.0 — BTS Assistant (IA Intégrée)

**Bridge Technologies Solutions — Douala, Cameroun**
**Version cible : InvoiceHub v2.1**

---

## Table des matières

1. [Vision — Un assistant de type ChatBot intégré](#vision)
2. [Pourquoi Ollama ?](#pourquoi-ollama)
3. [Modèle recommandé](#modèle-recommandé)
4. [Prérequis matériels](#prérequis-matériels)
5. [Installation](#installation)
6. [Architecture du chatbot](#architecture-du-chatbot)
7. [Ce que l'assistant peut faire](#ce-que-lassistant-peut-faire)
8. [Plan d'implémentation backend](#plan-dimplémentation-backend)
9. [Plan d'implémentation frontend](#plan-dimplémentation-frontend)
10. [Où le chatbot apparaît dans l'application](#où-le-chatbot-apparaît-dans-lapplication)
11. [Comparaison IA locale vs IA cloud](#comparaison-ia-locale-vs-ia-cloud)
12. [Ordre de déploiement recommandé](#ordre-de-déploiement-recommandé)

---

## Vision

L'objectif est d'intégrer dans InvoiceHub un **assistant conversationnel embarqué nommé BTS Assistant** — similaire à l'IA de Postman ou Docker Desktop — accessible depuis n'importe quelle page via un bouton flottant.

```
┌────────────────────────────────────────────────────────────┐
│  InvoiceHub                                          [👤]  │
│  ─────────────────────────────────────────────────────     │
│                                                            │
│   [Tableau de bord]  [Factures]  [Clients]  ...            │
│                                                            │
│   Contenu de la page...                                    │
│                                                            │
│                                        ┌────────────────┐  │
│                                        │  BTS Assistant │  │
│                                        │  ────────────  │  │
│                                        │  Bonjour !     │  │
│                                        │  Je peux vous  │  │
│                                        │  aider sur vos │  │
│                                        │  données BTS.  │  │
│                                        │  ────────────  │  │
│                                        │  [Écrire...]   │  │
│                                        └────────────────┘  │
│                                              [BTS 💬]      │
└────────────────────────────────────────────────────────────┘
```

L'assistant **n'a accès qu'aux données de l'application** (clients, factures, proformas, paiements, statistiques). Il ne répond pas aux questions générales — il est 100% focalisé sur les données BTS.

### Exemples d'interactions

```
Employé       : "Les factures impayées de Camtel"
BTS Assistant : "Voici 3 factures Camtel en attente de paiement :
                 · FAC018 — 1 450 000 XAF — en retard de 30 jours
                 · FAC024 — 890 000 XAF — échéance demain
                 · FAC031 — 340 000 XAF — émise il y a 5 jours"

Employé       : "Génère une proforma pour 3 jours de maintenance réseau
                 à 75 000 XAF le jour pour Camtel, paiement à 30 jours"
BTS Assistant : "Brouillon prêt. Voulez-vous l'ouvrir dans le formulaire ?"
                [Ouvrir le formulaire →]

Employé       : "Quel est notre CA du mois ?"
BTS Assistant : "En mars 2026 : 3 850 000 XAF facturés (↑12% vs février).
                 8 factures en retard pour 2,1M XAF."

Employé       : "C'est quoi une proforma ?"
BTS Assistant : "Une proforma est un devis formel envoyé au client avant
                 la prestation. Chez BTS, elle suit le cycle :
                 brouillon → envoyée → acceptée/refusée → convertie
                 en facture. Elle n'a pas de valeur comptable tant
                 qu'elle n'est pas convertie."

Employé       : "Rédige une relance pour la FAC018"
BTS Assistant : "Voici un email de relance adapté au profil de Camtel
                 (30 jours de retard, 2e relance) :
                 [email rédigé — copier / envoyer]"
```

---

## Pourquoi Ollama ?

Ollama est un moteur open-source (licence MIT) qui permet de faire tourner des modèles de langage (LLM) **directement sur le serveur BTS**, sans abonnement, sans connexion externe, sans que les données financières quittent l'entreprise.

```
Sans Ollama                          Avec Ollama
─────────────────────────────────    ──────────────────────────────────
InvoiceHub → OpenAI (Internet)       InvoiceHub → Ollama (serveur BTS)
Payant (100k–500k XAF/mois)          Gratuit
Données envoyées aux USA             Données restent chez BTS
Requiert Internet en permanence      Fonctionne hors-ligne
Dépendance fournisseur               Autonomie totale
```

**Résultat** : niveau de qualité comparable à ChatGPT, à coût zéro, avec confidentialité totale des données clients et financières.

---

## Modèle recommandé

### Mistral 7B — `mistral:latest`

| Critère | Détail |
|---|---|
| Langue française | Excellent — développé par Mistral AI (Paris), natif en français |
| Taille | 4,1 Go — tourne sur un PC de bureau avec 8 Go de RAM |
| Vitesse | 2–5 secondes de réponse sur hardware modeste |
| Licence | Apache 2.0 — usage commercial libre |
| Précision | Comparable à GPT-3.5 sur les tâches métier |
| Contexte Cameroun | Comprend XAF, SYSCOHADA, formulations professionnelles camerounaises |

### Alternatives selon le matériel disponible

| Serveur disponible | Modèle | RAM requise | Qualité |
|---|---|---|---|
| PC de bureau standard | `mistral:7b` | 8 Go | Très bonne |
| Serveur de bureau performant | `mistral-nemo:12b` | 16 Go | Excellente |
| Serveur dédié | `qwen2.5:14b` | 20 Go | Supérieure |

> **Recommandation BTS** : démarrer avec `mistral:7b`. Il tourne sur n'importe quel poste moderne.

---

## Prérequis matériels

| Composant | Minimum | Recommandé |
|---|---|---|
| CPU | Intel Core i5 / Ryzen 5 (gen récente) | Intel Core i7 / Ryzen 7 |
| RAM | 8 Go | 16 Go |
| Stockage | 10 Go libres | 20 Go libres |
| OS | Ubuntu 20.04+ / Debian 11+ / Windows (WSL2) | Ubuntu 22.04 LTS |
| GPU | Non requis | NVIDIA (accélère ×5–10) |

> Ollama peut tourner sur le **même serveur** que le backend InvoiceHub si la RAM est suffisante (≥ 16 Go recommandé en production).

---

## Installation

### 1. Installer Ollama sur le serveur

```bash
# Linux / WSL2
curl -fsSL https://ollama.ai/install.sh | sh

# Vérifier l'installation
ollama --version
```

Pour Windows natif (sans WSL), télécharger l'installeur sur [ollama.ai](https://ollama.ai).

---

### 2. Télécharger le modèle Mistral

```bash
# Téléchargement unique (~4,1 Go)
ollama pull mistral

# Vérifier que le modèle est disponible
ollama list
```

---

### 3. Démarrer le serveur Ollama

```bash
# Démarrage manuel (test)
ollama serve

# En production : service systemd (Linux)
sudo systemctl enable ollama
sudo systemctl start ollama

# Vérifier que l'API répond
curl http://localhost:11434/api/tags
```

L'API Ollama est accessible sur `http://localhost:11434`.

---

### 4. Test rapide

```bash
ollama run mistral "Bonjour, génère une ligne de facturation pour 2 jours de maintenance réseau à 85 000 XAF par jour."
```

---

### 5. Variables d'environnement dans InvoiceHub

Ajouter dans `bridge-backend/.env` :

```env
# Ollama — Assistant IA local
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=mistral
OLLAMA_ENABLED=true
```

En Docker, Ollama tourne sur le serveur hôte. Utiliser :

```env
OLLAMA_URL=http://host.docker.internal:11434
```

---

## Architecture du chatbot

### Vue d'ensemble

```
┌─────────────────────────────────────────────────────────────────────┐
│                           Serveur BTS                               │
│                                                                     │
│  ┌──────────────┐    ┌───────────────────────────────────────────┐  │
│  │   Next.js    │    │               Express (Backend)           │  │
│  │  (Frontend)  │    │                                           │  │
│  │              │    │  ┌─────────────────────────────────────┐  │  │
│  │  [💬 Chat]  │───▶│  │  POST /api/ai/chat                  │  │  │
│  │   Panel      │    │  │                                     │  │  │
│  │   flottant   │◀───│  │  1. Analyse l'intention             │  │  │
│  │              │    │  │  2. Choisit le(s) outil(s) DB       │  │  │
│  └──────────────┘    │  │  3. Exécute les requêtes Prisma     │  │  │
│                      │  │  4. Envoie prompt + données → Ollama│  │  │
│                      │  │  5. Stream la réponse               │  │  │
│                      │  └──────────┬──────────────────────────┘  │  │
│                      │             │                              │  │
│                      │   ┌─────────▼──────┐  ┌────────────────┐  │  │
│                      │   │  PostgreSQL    │  │  Ollama        │  │  │
│                      │   │  (Données BTS) │  │  mistral:7b    │  │  │
│                      │   └────────────────┘  │  Port 11434    │  │  │
│                      │                       └────────────────┘  │  │
│                      └───────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

### Flux d'une conversation

Le chatbot fonctionne en **deux appels Ollama successifs** pour chaque message :

```
Étape 1 — Analyse de l'intention
──────────────────────────────────────────────────────────────
Message utilisateur : "les factures impayées de Camtel"
  ↓
Backend → Ollama (appel rapide, ~1s)
Prompt : "Quel outil faut-il utiliser pour répondre à : '...' ?
          Réponds uniquement en JSON : { tool, params }"
Réponse Ollama : { "tool": "getInvoices",
                   "params": { "clientName": "Camtel",
                               "status": ["unpaid","overdue"] } }

Étape 2 — Récupération des données + génération de la réponse
──────────────────────────────────────────────────────────────
Backend exécute : prisma.invoice.findMany({ where: { ... } })
Résultat DB : [{ id, number, amount, dueDate, ... }, ...]
  ↓
Backend → Ollama (appel principal, ~3s)
Prompt : "Voici les données : [JSON].
          Réponds en français à : 'les factures impayées de Camtel'"
Réponse Ollama : "Voici 3 factures Camtel en attente : ..."
  ↓
Frontend reçoit la réponse en streaming et l'affiche mot par mot
```

### Outils disponibles (fonctions DB que l'IA peut utiliser)

| Outil | Ce qu'il fait |
|---|---|
| `getInvoices(filters)` | Récupère des factures avec filtres (client, statut, dates, montants) |
| `getProformas(filters)` | Récupère des proformas |
| `getClients(filters)` | Récupère des clients |
| `getPayments(filters)` | Récupère des paiements |
| `getDashboardKpis()` | Retourne les KPIs du tableau de bord (CA, impayés, taux recouvrement...) |
| `getClientSummary(clientId)` | Résumé financier complet d'un client |
| `generateDocumentDraft(description)` | Crée un brouillon de proforma/facture depuis une description |
| `draftReminderEmail(invoiceId)` | Rédige un email de relance adapté |
| `detectAnomalies()` | Détecte les anomalies dans les données récentes |

### Historique de conversation

L'historique de la conversation est maintenu **en mémoire côté client** (sessionStorage) et envoyé avec chaque message pour que l'IA garde le contexte :

```json
{
  "messages": [
    { "role": "user",      "content": "les factures de Camtel" },
    { "role": "assistant", "content": "Voici 3 factures Camtel..." },
    { "role": "user",      "content": "rédige une relance pour la première" }
  ]
}
```

L'IA comprend ainsi "la première" fait référence à FAC018 mentionnée dans le message précédent.

### Structure des fichiers à créer

```
bridge-backend/src/
├── modules/
│   └── ai/
│       ├── ai.routes.ts          # POST /api/ai/chat + GET /api/ai/status
│       ├── ai.controller.ts      # Réception req/res, streaming SSE
│       ├── ai.service.ts         # Orchestration : intention → outils → réponse
│       ├── ai.tools.ts           # Définition des outils DB (getInvoices, etc.)
│       └── ai.schema.ts          # Validation Zod { messages[], context? }
│
└── lib/
    └── ollama.ts                 # Client HTTP Ollama (generate + stream)

bridge-frontend/src/
├── features/
│   └── ai/
│       ├── api.ts                # POST /api/ai/chat avec streaming SSE
│       ├── useChat.ts            # Hook React : messages, send, isLoading
│       ├── ChatWidget.tsx        # Bouton flottant + panel slide-in
│       ├── ChatMessage.tsx       # Bulle de message (user / assistant)
│       └── ChatActions.tsx       # Boutons d'action inline (ouvrir formulaire, copier email...)
```

---

## Ce que l'assistant peut faire

### 1. Interroger les données en langage naturel

L'utilisateur pose n'importe quelle question sur les données BTS sans connaître les filtres de l'interface.

| Question posée | Données récupérées |
|---|---|
| "les factures impayées de Camtel" | Factures Camtel → statuts `unpaid`, `overdue` |
| "ce qu'on a facturé ce trimestre" | Factures du trimestre en cours, total CA |
| "les gros clients qui paient mal" | Clients avec taux de recouvrement < 60% |
| "combien Orange nous doit en ce moment" | Solde impayé client Orange en temps réel |
| "le devis envoyé à MTN le mois dernier" | Proformas MTN du mois précédent, statut `sent` |
| "mes 5 meilleurs clients cette année" | Classement clients par CA annuel |

---

### 2. Générer des documents par description

L'employé décrit ce qu'il veut créer en texte libre. L'IA génère un brouillon JSON, le backend le valide, et le frontend ouvre directement le formulaire pré-rempli.

**Exemple :**
> "Crée une proforma pour la maintenance mensuelle du réseau de Camtel, 3 jours de travail à 75 000 XAF le jour, conditions de paiement 30 jours."

L'assistant répond :
> "Brouillon prêt. Client : Camtel — 3 jours × 75 000 XAF = 225 000 HT (268 313 TTC). Validité 30 jours."
> `[Ouvrir dans le formulaire →]`

**Gain** : de 10 minutes de saisie à 30 secondes.

---

### 3. Rédiger les emails de relance

Pour n'importe quelle facture en retard, l'assistant génère un email adapté au contexte : niveau de retard, historique du client, nombre de relances déjà envoyées.

**Relance douce (J+7, bon payeur) :**
```
Madame, Monsieur,

Nous nous permettons de vous contacter au sujet de notre facture
N° BTS/DC/2026/02/FAC018 d'un montant de 1 450 000 XAF, émise le
12 février 2026 et arrivée à échéance le 14 mars 2026.

Sauf erreur de notre part, nous n'avons pas encore reçu le règlement
correspondant. Pourriez-vous nous confirmer la date de paiement prévue ?

Cordialement,
L'équipe commerciale — Bridge Technologies Solutions
```

**Relance ferme (J+30, retards répétés) :**
```
Madame, Monsieur,

Malgré nos précédentes relances, la facture N° BTS/DC/2026/02/FAC018
d'un montant de 1 450 000 XAF reste impayée depuis 30 jours.

Nous vous demandons de régulariser cette situation dans les 48 heures.
Sans retour de votre part, nous serons contraints de suspendre nos
prestations et d'engager les démarches de recouvrement.

Veuillez agréer nos salutations distinguées.
```

---

### 4. Synthèse financière à la demande

> "Fais-moi un résumé de la situation financière"

```
Synthèse au 18 mars 2026

CA mars : 3 850 000 XAF (↑12% vs février).
47 factures actives — 8 en retard pour 2,1M XAF.

Point d'attention : FAC018 (Camtel, 1,45M XAF) en retard de 30 jours.
Action de recouvrement recommandée.

Bonne nouvelle : MTN a réglé 750 000 XAF hier.

Taux de recouvrement 30j : 78% (↑ vs 71% le mois dernier).
```

---

### 5. Détection d'anomalies

> "Y a-t-il des anomalies dans mes données récentes ?"

Exemples d'alertes générées :
- `"FAC031 pour Orange : 12 500 XAF — 15× moins que vos factures habituelles. Doublon ou erreur de saisie ?"`
- `"3 factures Camtel ce mois — moyenne historique : 1/mois. Vérification recommandée."`
- `"SOCATEL : aucune commande depuis 4 mois. Risque de perte de client."`
- `"PFM039 : TVA à 0% sur une prestation normalement soumise à 19,25%."`

---

### 6. Suggestions à la création de produits

Quand l'utilisateur crée un nouveau produit dans le catalogue, l'assistant suggère automatiquement la catégorie, l'unité de facturation et une fourchette de prix cohérente avec l'existant.

---

### 7. Aide au paramétrage

Quand un administrateur configure InvoiceHub, il peut demander à l'assistant d'expliquer n'importe quel paramètre en français simple et de suggérer la valeur adaptée au contexte BTS.

---

## Plan d'implémentation backend

### `src/lib/ollama.ts` — Client HTTP Ollama

```typescript
import { env } from '../config/env';

export async function ollamaGenerate(prompt: string, system?: string): Promise<string> {
  const res = await fetch(`${env.OLLAMA_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: env.OLLAMA_MODEL,
      prompt,
      system,
      stream: false,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Ollama error: ${res.status}`);
  const data = await res.json();
  return data.response.trim();
}

// Version streaming (Server-Sent Events)
export async function* ollamaStream(prompt: string, system?: string): AsyncGenerator<string> {
  const res = await fetch(`${env.OLLAMA_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: env.OLLAMA_MODEL, prompt, system, stream: true }),
  });
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = JSON.parse(decoder.decode(value));
    if (chunk.response) yield chunk.response;
  }
}
```

---

### `src/modules/ai/ai.tools.ts` — Outils DB

```typescript
import prisma from '../../config/database';

export const tools = {
  async getInvoices(params: { clientName?: string; status?: string[]; limit?: number }) {
    return prisma.invoice.findMany({
      where: {
        deletedAt: null,
        client: params.clientName
          ? { name: { contains: params.clientName, mode: 'insensitive' } }
          : undefined,
        status: params.status ? { in: params.status as any } : undefined,
      },
      include: { client: true },
      orderBy: { createdAt: 'desc' },
      take: params.limit ?? 10,
    });
  },

  async getDashboardKpis() {
    const [revenue, unpaid, clients] = await Promise.all([
      prisma.$queryRaw`SELECT * FROM v_revenue_monthly LIMIT 3`,
      prisma.$queryRaw`SELECT * FROM v_unpaid_invoices`,
      prisma.$queryRaw`SELECT * FROM v_client_summary LIMIT 5`,
    ]);
    return { revenue, unpaid, clients };
  },

  // ... getClients, getProformas, getPayments, getClientSummary
};
```

---

### `src/modules/ai/ai.service.ts` — Orchestration

```typescript
export async function chat(messages: ChatMessage[]): Promise<string> {
  const lastMessage = messages[messages.length - 1].content;

  // Étape 1 : déterminer l'outil à utiliser
  const intentPrompt = `
    Tu es un dispatcher pour InvoiceHub, logiciel de facturation de BTS Douala.
    Outils disponibles : getInvoices, getProformas, getClients, getPayments,
                         getDashboardKpis, getClientSummary, generateDocumentDraft,
                         draftReminderEmail, detectAnomalies, none.
    Message : "${lastMessage}"
    Réponds UNIQUEMENT en JSON : { "tool": "nomOutil", "params": { ... } }
    Si aucun outil n'est nécessaire, utilise "none".
  `;
  const intentRaw = await ollamaGenerate(intentPrompt);
  const intent = JSON.parse(intentRaw);

  // Étape 2 : exécuter l'outil et construire le contexte
  let dataContext = '';
  if (intent.tool !== 'none' && tools[intent.tool]) {
    const data = await tools[intent.tool](intent.params ?? {});
    dataContext = `\n\nDonnées disponibles :\n${JSON.stringify(data, null, 2)}`;
  }

  // Étape 3 : générer la réponse finale
  const system = `
    Tu es BTS Assistant, l'assistant IA d'InvoiceHub pour Bridge Technologies Solutions,
    une entreprise de services IT à Douala, Cameroun.
    Tu peux répondre à deux types de questions :
    1. Questions sur les données de l'application (factures, clients, proformas, paiements,
       statistiques) — tu utilises les données fournies dans le prompt.
    2. Questions métier (définitions, règles comptables, cycle de vie des documents) —
       tu réponds depuis ta connaissance du domaine.
    Tu ne réponds PAS aux questions hors-sujet (actualité, culture générale, etc.).
    Monnaie : XAF (Franc CFA). TVA standard Cameroun : 19,25%. Norme : SYSCOHADA.
    Numérotation BTS : BTS/{BUREAU}/{AAAA}/{MM}/{TYPE}{SEQ} ex: BTS/DC/2026/03/FAC001.
    Réponds en français, de manière concise et professionnelle.
  `;
  const conversationHistory = messages
    .map(m => `${m.role === 'user' ? 'Utilisateur' : 'Assistant'} : ${m.content}`)
    .join('\n');

  return ollamaGenerate(conversationHistory + dataContext, system);
}
```

### Endpoint principal

| Méthode | Route | Description |
|---|---|---|
| `POST` | `/api/ai/chat` | Envoie un message, reçoit la réponse (streaming SSE ou JSON) |
| `GET` | `/api/ai/status` | Vérifie si Ollama est disponible (`OLLAMA_ENABLED` + ping) |

---

## Plan d'implémentation frontend

### `features/ai/useChat.ts` — Hook React

```typescript
export function useChat() {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: 'Bonjour ! Je suis BTS Assistant. Posez-moi une question sur vos factures, clients, proformas, ou sur le fonctionnement d\'InvoiceHub.' }
  ]);
  const [isLoading, setIsLoading] = useState(false);

  const send = async (content: string) => {
    const newMessages = [...messages, { role: 'user', content }];
    setMessages(newMessages);
    setIsLoading(true);
    const reply = await aiApi.chat(newMessages);
    setMessages([...newMessages, { role: 'assistant', content: reply }]);
    setIsLoading(false);
  };

  return { messages, send, isLoading };
}
```

### `features/ai/ChatWidget.tsx` — Bouton flottant + panel

- Bouton fixe en bas à droite (position `fixed`, z-index élevé)
- Clic → panel slide-in depuis la droite (largeur 380px)
- Historique de messages scrollable
- Zone de saisie fixe en bas du panel
- Indicateur de chargement (3 points animés) pendant la réponse
- Bouton de fermeture en haut du panel
- Badge rouge si l'IA a détecté des anomalies depuis la dernière ouverture

### Composants à créer

```
bridge-frontend/src/
├── features/
│   └── ai/
│       ├── api.ts             # POST /api/ai/chat, GET /api/ai/status
│       ├── useChat.ts         # Hook messages + send + isLoading
│       ├── ChatWidget.tsx     # Bouton flottant + panel complet
│       ├── ChatMessage.tsx    # Bulle message (user à droite, assistant à gauche)
│       └── ChatActions.tsx    # Boutons d'action inline dans les réponses
│                              # ex : [Ouvrir formulaire →] [Copier l'email]
```

Le `ChatWidget` est monté **une seule fois** dans le layout racine (`app/layout.tsx`), donc disponible sur toutes les pages sans rechargement.

---

## Où le chatbot apparaît dans l'application

Le widget est **global** — accessible depuis toutes les pages via le bouton flottant `💬` en bas à droite.

En plus du chat libre, certaines pages ont des **points d'entrée contextuels** :

| Page | Intégration contextuelle |
|---|---|
| **Tableau de bord** | Widget "Synthèse IA" qui affiche le résumé du jour au chargement |
| **Tableau de bord** | Bandeau d'anomalies détectées (montants suspects, TVA incorrecte, clients inactifs) |
| **Proformas / Factures — Nouveau** | Bouton `Générer avec l'IA` au-dessus du formulaire |
| **Factures en retard** | Bouton `Rédiger la relance` sur chaque ligne de facture en retard |
| **Produits — Nouveau** | Suggestion automatique de catégorie + fourchette de prix à la saisie du nom |
| **Paramètres** | Icône `?` sur les champs sensibles → explication IA du paramètre |

---

## Comparaison IA locale vs IA cloud

| Critère | Ollama (local) | OpenAI / ChatGPT |
|---|---|---|
| Coût mensuel | **0 XAF** | 100 000 – 500 000+ XAF |
| Confidentialité | Données restent chez BTS | Données envoyées aux USA |
| Connexion Internet | Non requise | Requise en permanence |
| Disponibilité | 100% locale | Dépend d'un service tiers |
| Langue française | Très bonne | Excellente |
| Personnalisation | Possible (fine-tuning) | Limitée |
| Conformité données | Totale | Partielle |
| Dépendance fournisseur | Aucune | Fort lock-in |

> **Conclusion** : Ollama offre 90% de la qualité de ChatGPT, à 0% du coût, avec 100% de confidentialité. Pour une entreprise traitant des données financières sensibles, c'est le choix le plus responsable.

---

## Ordre de déploiement recommandé

```
Étape 1 — Infrastructure
  a. Installer Ollama + pull mistral sur le serveur BTS
  b. Ajouter OLLAMA_URL, OLLAMA_MODEL, OLLAMA_ENABLED dans .env
  c. Configurer systemd (Linux) pour démarrage automatique

Étape 2 — Backend
  a. Créer src/lib/ollama.ts (client HTTP + streaming)
  b. Créer src/modules/ai/ai.tools.ts (outils DB)
  c. Créer src/modules/ai/ai.service.ts (orchestration 2 appels)
  d. Créer src/modules/ai/ai.routes.ts (POST /api/ai/chat)
  e. Tester les outils via Postman

Étape 3 — Frontend (widget global)
  a. Créer features/ai/api.ts + useChat.ts
  b. Créer ChatWidget.tsx (bouton flottant + panel)
  c. Monter le widget dans app/layout.tsx

Étape 4 — Intégrations contextuelles (par priorité métier)
  a. Widget synthèse dashboard — valeur immédiate pour la direction
  b. Bouton "Générer avec l'IA" sur proformas — gain de temps commercial
  c. Bouton "Rédiger la relance" sur factures — améliore le recouvrement
  d. Anomalies dashboard — conformité fiscale
  e. Suggestions produits — confort utilisateur
```

---

*Document préparé par Bridge Technologies Solutions — Mars 2026*
*InvoiceHub v2.0 — Assistant IA Ollama*
