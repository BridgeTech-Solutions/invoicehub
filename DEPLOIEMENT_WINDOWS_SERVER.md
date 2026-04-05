# Déploiement InvoiceHub — Windows Server (réseau local)

Guide d'installation d'InvoiceHub sur un serveur Windows pour un accès partagé en réseau local (LAN).

---

## Prérequis

| Logiciel | Version minimale | Lien |
|----------|-----------------|------|
| Windows Server | 2019 ou 2022 | — |
| Docker Desktop | 4.x | [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop/) |
| Git | 2.x | [git-scm.com](https://git-scm.com/) |
| pnpm | 9.x | `npm install -g pnpm` |

> Docker Desktop nécessite **WSL 2** activé sur Windows Server. Lors de l'installation, cocher "Use WSL 2 based engine".

---

## 1. Récupérer le code

Ouvrir un terminal (PowerShell ou Git Bash) sur le serveur :

```bash
git clone <url-du-depot> C:\InvoiceHub
cd C:\InvoiceHub
```

---

## 2. Trouver l'adresse IP du serveur

Dans PowerShell :

```powershell
ipconfig
```

Repérer l'adresse IPv4 de la carte réseau locale, par exemple `192.168.1.10`.
Cette adresse est celle que les collègues utiliseront pour accéder à l'application.

---

## 3. Configurer le backend

```bash
cd C:\InvoiceHub\bridge-backend
copy .env.example .env
```

Ouvrir `.env` avec un éditeur de texte et renseigner les valeurs suivantes :

```env
NODE_ENV=production

# IP du serveur Windows sur le réseau local (ipconfig → Adresse IPv4)
SERVER_IP=192.168.1.10

# Secrets JWT — générer deux chaînes aléatoires d'au moins 32 caractères
JWT_ACCESS_SECRET=remplacer_par_une_chaine_aleatoire_longue
JWT_REFRESH_SECRET=remplacer_par_une_autre_chaine_aleatoire_longue

# Mot de passe de la base de données
DB_PASSWORD=choisir_un_mot_de_passe_fort

# SMTP — configurer avec votre fournisseur email
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=votre@email.cm
SMTP_PASS=votre_mot_de_passe_smtp
SMTP_FROM=noreply@bts.cm

# Assistant BTS (IA locale) — mettre true pour activer
OLLAMA_ENABLED=false
OLLAMA_MODEL=mistral
```

> `SERVER_IP` est la seule variable à configurer pour le réseau. Toutes les URLs (frontend, backend, CORS) sont construites automatiquement depuis cette valeur.

---

## 4. Premier déploiement

Double-cliquer sur `deploy.bat` à la racine du projet, ou l'exécuter depuis un terminal :

```bash
cd C:\InvoiceHub
deploy.bat
```

Le script effectue automatiquement dans l'ordre :

| Étape | Action |
|-------|--------|
| 1 | Vérifie Docker, Git, pnpm |
| 2 | `git pull` — récupère le code |
| 3 | `pnpm install` — met à jour les dépendances |
| 4 | TypeScript + lint + tests |
| 5 | `docker-compose build` + `up` |
| 6 | Attend que l'API réponde |
| 7 | Migrations Prisma |
| 8 | Télécharge Mistral si `OLLAMA_ENABLED=true` (demande confirmation) |

La première exécution prend environ **10 à 20 minutes** selon la connexion (téléchargement des images Docker + build).

---

## 5. Services démarrés

Après `deploy.bat`, 5 conteneurs tournent :

| Conteneur | Rôle | Accessible depuis le réseau |
|-----------|------|----------------------------|
| `db` | PostgreSQL 15 | Non — interne Docker uniquement |
| `redis` | Redis 7 (BullMQ) | Non — interne Docker uniquement |
| `ollama` | Moteur IA Mistral | Non — interne Docker uniquement |
| `api` | Backend Express | Oui — `http://192.168.1.10:3000` |
| `frontend` | Interface Next.js | Oui — `http://192.168.1.10:3001` |

---

## 6. Accès depuis les postes clients

Depuis n'importe quel poste du réseau local, ouvrir un navigateur :

```
http://192.168.1.10:3001
```

> Remplacer `192.168.1.10` par l'IP réelle du serveur.

---

## 7. Démarrage automatique au redémarrage du serveur

Les conteneurs redémarrent automatiquement grâce à `restart: unless-stopped` dans le docker-compose.

S'assurer que Docker Desktop démarre avec Windows :
- Docker Desktop → Settings → General → cocher **"Start Docker Desktop when you sign in to your computer"**

---

## 8. Mise à jour de l'application

Pour déployer une nouvelle version, relancer simplement :

```bash
deploy.bat
```

Le script détecte les changements, reconstruit uniquement ce qui a changé, et applique les migrations si nécessaire.

---

## 9. Assistant IA (Ollama + Mistral)

L'assistant BTS tourne entièrement en local dans Docker — aucune donnée n'est envoyée sur Internet.

### Activer

Dans `.env` :
```env
OLLAMA_ENABLED=true
OLLAMA_MODEL=mistral
```

Puis relancer `deploy.bat`. Le script proposera de télécharger Mistral (~4 Go) si ce n'est pas encore fait.

### Ressources recommandées

| Configuration | Expérience |
|--------------|------------|
| 8 Go RAM | Fonctionnel, réponses lentes (~30s) |
| 16 Go RAM | Confortable (~10s) |
| GPU NVIDIA | Réponses rapides (~2s) |

---

## 10. Sauvegardes

Les sauvegardes automatiques sont configurées dans `.env` :

```env
BACKUP_STORAGE_DISK=local
BACKUP_DIR=./uploads/backups
BACKUP_RETENTION_DAYS=30
BACKUP_CRON=0 0 * * *    # Tous les jours à minuit
```

Pour une sauvegarde manuelle immédiate : **Paramètres → Sauvegardes → Sauvegarder maintenant**.

---

## Commandes utiles

```bash
cd C:\InvoiceHub\bridge-backend

# Voir l'état des conteneurs
docker-compose ps

# Logs en temps réel
docker-compose logs -f
docker-compose logs -f api
docker-compose logs -f ollama

# Redémarrer un service
docker-compose restart api

# Arrêter l'application
docker-compose down

# Accéder à la base de données
docker-compose exec db psql -U postgres -d invoicehub
```

---

## Résolution de problèmes

| Problème | Cause probable | Solution |
|----------|---------------|----------|
| Page blanche / impossible de se connecter | `SERVER_IP` incorrect | Vérifier l'IP dans `.env` et relancer `deploy.bat` |
| "Identifiants incorrects" sur un autre poste | `SERVER_IP` pas encore configuré | Ajouter `SERVER_IP` dans `.env`, relancer `deploy.bat` |
| Conteneur `api` qui redémarre en boucle | Variable `.env` manquante ou invalide | `docker-compose logs api` pour voir l'erreur |
| Port déjà utilisé | Un autre service occupe 3000 ou 3001 | Changer les ports dans `docker-compose.yml` |
| Assistant IA ne répond pas | `OLLAMA_ENABLED=false` ou Mistral absent | Vérifier `.env` et relancer `deploy.bat` |
| Mistral lent à répondre | Pas assez de RAM | Normal sans GPU — prévoir 16 Go RAM minimum |
