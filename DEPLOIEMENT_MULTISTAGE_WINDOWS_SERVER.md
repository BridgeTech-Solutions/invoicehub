# 📋 Guide Complet : Déploiement InvoiceHub v2.0 + Multi-Apps sur Windows Server (A à Z)

**Objectif** : Déployer InvoiceHub avec domaine local `invoicehub.bridgetech-solutions` et support de multiples applications sur le même serveur.

**Architecture cible** : 
- Docker Desktop sur Windows Server
- Reverse Proxy (Nginx) pour le routage par domaine
- Réseau Docker bridge network pour isolation multi-apps
- DNS local via fichier `hosts` Windows
- SSL/TLS auto-signé pour sécurité interne

**Durée estimée** : 45 minutes (première installation)

---

## 🔧 PHASE 1 : Préparation du serveur Windows

### Étape 1A : Vérifier les prérequis système

**Exigences minimales** :
- Windows Server 2019 (ou 2022) — Édition Standard/Datacenter
- CPU : 4 cœurs minimum (8 recommandé)
- RAM : 16 Go (8 Go minimum, mais lent)
- Disque : 100 Go libres (SSD recommandé)
- Virtualisation activée (Hyper-V ou VMX) — vérifiable dans le BIOS

**Vérifier la configuration actuelle** (PowerShell administrateur) :
```powershell
# Voir la RAM
Get-WmiObject Win32_OperatingSystem | Select-Object TotalVisibleMemorySize

# Voir l'espace disque C:\
Get-PSDrive C | Select-Object @{Name="Size (GB)"; Expression={$_.Used / 1GB -as [int]}}, @{Name="Free (GB)"; Expression={$_.Free / 1GB -as [int]}}

# Vérifier la virtualisation
Get-WmiObject Win32_Processor | Select-Object VirtualizationFirmwareEnabled
```

### Étape 1B : Installer Docker Desktop

1. **Télécharger** Docker Desktop from https://www.docker.com/products/docker-desktop
2. **Exécuter l'installeur** et suivre les étapes
3. **Options d'installation** :
   - ✅ Cocher "Use WSL 2 based engine" (obligation)
   - ✅ Cocher "Install required Windows components for WSL 2"
   - ✅ Cocher "Add Docker Compose v2"
4. **Redémarrer** le serveur après l'installation
5. **Vérifier** l'installation (PowerShell) :
```powershell
docker --version
docker-compose --version
```

**Résultat attendu** :
```
Docker version 27.x.x, build xxxxxxx
Docker Compose version v2.x.x
```

### Étape 1C : Installer les outils nécessaires

**PowerShell administrateur** :

```powershell
# 1. Installer Git
winget install Git.Git

# 2. Installer Node.js LTS (v20)
winget install OpenJS.NodeJS.LTS

# 3. Installer pnpm globalement
npm install -g pnpm

# 4. Installer OpenSSL (pour générer les certificats SSL)
winget install OpenSSL.Light

# Vérifier les installations
git --version
node --version
pnpm --version
openssl version
```

### Étape 1D : Configurer Docker Desktop (Ressources)

1. Ouvrir **Docker Desktop** → **Settings** → **Resources**
2. Paramètres recommandés :
   - **CPUs** : 4 (ou 8 si disponible)
   - **Memory** : 8000 Mo (ou 12000 Mo)
   - **Swap** : 2000 Mo
   - **Disk image size** : 100 Go

3. Activer **Hyper-V** dans WSL2 (si proposé)
4. Cliquer **Apply & Restart**
5. Vérifier que Docker Desktop redémarre sans erreur

---

## 🌐 PHASE 2 : Configuration DNS et Domaine Local

**Trois options disponibles. Choisis selon ton contexte** :
- **Option A** : Fichier hosts (rapide, petit réseau, tests)
- **Option B** : DNS Server rôle Windows (professionnel, centralisé, PME/LAN)
- **Option C** : Active Directory + DNS (entreprise, AD existant)

---

### Étape 2A : Option A — Fichier `hosts` (Simple)

**Meilleur pour** : Tests, POC, petits réseaux sans infrastructure DNS

Le fichier `hosts` permet de mapper des noms de domaine à des adresses IP locales.

1. **Ouvrir Notepad en administrateur** :
   - Appuyer sur `Win + R`
   - Taper : `notepad C:\Windows\System32\drivers\etc\hosts`
   - Cliquer OK

2. **Ajouter les lignes suivantes** à la fin du fichier :
```
# ============================================================
# Bridge Technologies Solutions — Applications Locales
# ============================================================

127.0.0.1       localhost

# InvoiceHub v2.0
127.0.0.1       invoicehub.bridgetech-solutions
127.0.0.1       api.invoicehub.bridgetech-solutions
127.0.0.1       www.invoicehub.bridgetech-solutions

# Espace pour futures applications
# 127.0.0.1       app2.bridgetech-solutions
# 127.0.0.1       app3.bridgetech-solutions
```

3. **Sauvegarder** et **fermer** Notepad

4. **Vérifier** que la résolution fonctionne (PowerShell) :
```powershell
ping invoicehub.bridgetech-solutions
```

**Résultat attendu** :
```
Réponse de 127.0.0.1 : octets=32 temps<1ms TTL=64
```

**⚠️ Limitation** : Le fichier `hosts` doit être édité sur **chaque PC client** qui veut accéder au domaine.

---

### Étape 2B : Option B — DNS Server Rôle Windows (🏢 Recommandé)

**Meilleur pour** : Réseau d'entreprise, PME, gestion centralisée

Cette option utilise le **rôle DNS Server** de Windows Server.

#### 2B-1 : Installer le rôle DNS Server

**PowerShell (admin)** :

```powershell
# Installer le rôle DNS Server
Install-WindowsFeature -Name DNS -IncludeManagementTools

# Redémarrer (optionnel)
# Restart-Computer -Force
```

Après installation :
- **Gestionnaire DNS** accessible via `dnsmgmt.msc`
- Service DNS démarre automatiquement

#### 2B-2 : Créer une Zone DNS Primaire

1. **Ouvrir le Gestionnaire DNS** :
   - Appuyer sur `Win + R`
   - Taper `dnsmgmt.msc`
   - Cliquer OK

2. **Navigation** :
   - Développer **Nom du serveur** (ex: SERVER)
   - Clique-droit sur **Zones de recherche directe**
   - Sélectionner **Nouvelle zone...**

3. **Créer la zone** :
   - **Type de zone** : "Zone primaire"
   - **Nom de la zone** : `bridgetech-solutions`
   - **Fichier de zone** : Créer un nouveau fichier (défaut)
   - Terminer

#### 2B-3 : Ajouter les enregistrements A (DNS)

1. **Développer la zone** `bridgetech-solutions` dans le Gestionnaire DNS
2. **Clique-droit sur le dossier blanc** → **Nouvel hôte (A ou AAAA)**
3. **Ajouter chaque enregistrement** :

| Nom d'hôte | Adresse IP |
|----------|-----------|
| invoicehub | 127.0.0.1 |
| api.invoicehub | 127.0.0.1 |
| www.invoicehub | 127.0.0.1 |
| app2 | 127.0.0.1 |
| app3 | 127.0.0.1 |

**Exemple pour invoicehub** :
```
Nom : invoicehub
FQDN : invoicehub.bridgetech-solutions
IP : 127.0.0.1
```

#### 2B-4 : Configurer les clients pour utiliser ce DNS

**Sur les PC clients** :

1. **Ouvrir Settings** → **Network & Internet** → **Advanced network settings**
2. **Changer les options de l'adaptateur** → Sélectionner votre connexion
3. **Properties** → **Internet Protocol Version 4 (TCP/IPv4)**
4. **Preferred DNS server** : `<IP_DU_SERVEUR_DNS>`
   - Exemple : `192.168.1.10`

**Ou via PowerShell (admin)** :
```powershell
# Sur le PC client
Set-DnsClientServerAddress `
  -InterfaceAlias "Ethernet" `
  -ServerAddresses ("192.168.1.10")

# Vérifier
Get-DnsClientServerAddress -InterfaceAlias "Ethernet"
```

#### 2B-5 : Tester la résolution DNS

**Depuis un PC client** :
```powershell
nslookup invoicehub.bridgetech-solutions
```

**Résultat attendu** :
```
Server: dns-server.bridgetech-solutions
Address: 192.168.1.10

Name:    invoicehub.bridgetech-solutions
Address: 127.0.0.1
```

---

### Étape 2C : Option C — Active Directory + DNS (🏛️ Entreprise)

**Meilleur pour** : Grandes organisations, AD existant, gestion centralisée

#### 2C-1 : Prérequis

- Windows Server 2019+ avec **rôle Active Directory Domain Services** installé
- Serveur configuré en **Domain Controller**

#### 2C-2 : Créer une Zone DNS Intégrée à AD

**PowerShell (admin)** :

```powershell
# Créer une zone DNS intégrée à Active Directory
Add-DnsServerPrimaryZone `
  -Name "bridgetech-solutions" `
  -ReplicationScope "Forest"

# Vérifier
Get-DnsServerZone
```

#### 2C-3 : Ajouter les enregistrements A via PowerShell

```powershell
# Ajouter invoicehub.bridgetech-solutions
Add-DnsServerResourceRecordA `
  -ZoneName "bridgetech-solutions" `
  -Name "invoicehub" `
  -IPv4Address "127.0.0.1"

# Ajouter api.invoicehub.bridgetech-solutions
Add-DnsServerResourceRecordA `
  -ZoneName "bridgetech-solutions" `
  -Name "api.invoicehub" `
  -IPv4Address "127.0.0.1"

# Ajouter www.invoicehub.bridgetech-solutions
Add-DnsServerResourceRecordA `
  -ZoneName "bridgetech-solutions" `
  -Name "www.invoicehub" `
  -IPv4Address "127.0.0.1"

# Vérifier tous les enregistrements
Get-DnsServerResourceRecord -ZoneName "bridgetech-solutions"
```

#### 2C-4 : Configuration automatique des clients (AD)

Les ordinateurs **domaine-connectés** récupèrent automatiquement la configuration DNS du serveur AD via **DHCP** ou **Group Policy**.

**Pour forcer une mise à jour** sur les clients :
```powershell
# Sur le client (membre du domaine)
ipconfig /registerdns
```

---

### Étape 2D : Architecture DNS Multi-Apps (Toutes Options)

Structure pour supporter plusieurs applications :

```
bridgetech-solutions (Zone DNS)
├── invoicehub
│   ├── à invoicehub.bridgetech-solutions (A record → 127.0.0.1)
│   ├── api.invoicehub
│   │   └── à api.invoicehub.bridgetech-solutions (A record → 127.0.0.1)
│   └── www.invoicehub
│       └── à www.invoicehub.bridgetech-solutions (A record → 127.0.0.1)
├── app2
│   └── à app2.bridgetech-solutions (A record → 127.0.0.1)
└── app3
    └── à app3.bridgetech-solutions (A record → 127.0.0.1)

Reverse Proxy (Nginx:80/443)
├── invoicehub.bridgetech-solutions → Port 3001 (Frontend)
├── api.invoicehub.bridgetech-solutions → Port 3000 (API)
├── app2.bridgetech-solutions → Port 4001 (App 2)
└── app3.bridgetech-solutions → Port 5001 (App 3)
```

Tous les domaines pointent vers **127.0.0.1** (le serveur local), et **Nginx** décide quel port interne expose à chaque domaine.

---

### Étape 2E : Comparaison Rapide

| Critère | Fichier hosts | DNS Server | Active Directory |
|---------|---------------|-----------|-------------------|
| **Installation** | ✅ Aucune | 1 cmd PowerShell | Déjà en place |
| **Gestion** | 📝 Manuel sur chaque PC | 🖱️ GUI (dnsmgmt.msc) | 🔐 Group Policy |
| **Scalabilité** | ❌ Très limité | ✅ Bon | ✅✅ Excellent |
| **Professionnel** | ❌ Non | ✅ Oui | ✅✅ Oui |
| **Pour devs/POC** | ✅ Idéal | 😐 Overkill | 😐 Overkill |
| **Pour réseau LAN** | 😐 Moyen | ✅✅ Idéal | ✅✅ Idéal |
| **Pour entreprise** | ❌ Non | ✅ Bon | ✅✅ Idéal |

---

## 🐳 PHASE 3 : Récupérer et Structurer le Code

### Étape 3A : Cloner le repository

**PowerShell** :
```powershell
# Créer le dossier racine pour les applications
mkdir C:\BTS-Apps
cd C:\BTS-Apps

# Cloner InvoiceHub
git clone <URL_DU_DEPOT> invoicehub
cd invoicehub
```

### Étape 3B : Explorer la structure du projet

```
C:\BTS-Apps\invoicehub\
├── bridge-backend\       (API Express + Prisma)
├── bridge-frontend\      (Frontend Next.js)
├── docker-compose.yml    (5 services : db, redis, ollama, api, frontend)
├── deploy.bat
└── DEPLOIEMENT_WINDOWS_SERVER.md

# Pour les futures apps :
C:\BTS-Apps\app2\
└── docker-compose.yml

C:\BTS-Apps\app3\
└── docker-compose.yml
```

### Étape 3C : Créer la structure pour multi-apps

```powershell
# Structure de base
C:\BTS-Apps\
├── invoicehub\          (Application principale)
├── app2/                (Future app 2)
├── app3/                (Future app 3)
├── nginx/               (Reverse Proxy centralisé)
│   ├── Dockerfile
│   ├── nginx.conf
│   └── certs/           (Certificats SSL auto-signés)
└── docker-compose-global.yml  (Orchestration multi-apps)
```

Créer les dossiers :
```powershell
mkdir C:\BTS-Apps\nginx\certs
```

---

## 🔐 PHASE 4 : Générer les Certificats SSL/TLS Auto-signés

### Étape 4A : Générer le certificat pour invoicehub.bridgetech-solutions

**PowerShell** (dans `C:\BTS-Apps\nginx\certs`) :

```powershell
cd C:\BTS-Apps\nginx\certs

# Générer Private Key (2048 bits, valable 365 jours)
openssl genrsa -out invoicehub.key 2048

# Générer Certificate Request (CSR)
openssl req -new `
  -key invoicehub.key `
  -out invoicehub.csr `
  -subj "/C=CM/ST=Littoral/L=Douala/O=Bridge Technologies Solutions/OU=IT/CN=invoicehub.bridgetech-solutions"

# Générer le Certificat Auto-signé (365 jours)
openssl x509 -req `
  -days 365 `
  -in invoicehub.csr `
  -signkey invoicehub.key `
  -out invoicehub.crt
```

**Ajouter les domaines alternatifs** (Subject Alternative Names) :

Créer un fichier `openssl.ext` :
```
subjectAltName = DNS:invoicehub.bridgetech-solutions,DNS:api.invoicehub.bridgetech-solutions,DNS:www.invoicehub.bridgetech-solutions
```

Puis régénérer avec SAN :
```powershell
openssl x509 -req `
  -days 365 `
  -in invoicehub.csr `
  -signkey invoicehub.key `
  -out invoicehub.crt `
  -extfile openssl.ext
```

**Vérifier les certificats** :
```powershell
openssl x509 -in invoicehub.crt -text -noout | Select-String "Subject|DNS"
```

**Résultat** : Vous avez maintenant :
- `invoicehub.key` — Clé privée
- `invoicehub.crt` — Certificat public
- Valables 365 jours

### Étape 4B : Importer le certificat dans le système Windows (optionnel mais recommandé)

Pour éviter les avertissements SSL dans les navigateurs :

```powershell
# Importer dans le magasin "Trusted Root Certification Authorities"
Import-Certificate `
  -FilePath C:\BTS-Apps\nginx\certs\invoicehub.crt `
  -CertStoreLocation Cert:\LocalMachine\Root
```

---

## 🔄 PHASE 5 : Configuration du Reverse Proxy (Nginx)

### Étape 5A : Créer la configuration Nginx

Créer `C:\BTS-Apps\nginx\nginx.conf` :

```nginx
# Upstream (services backend)
upstream invoicehub_frontend {
    server 127.0.0.1:3001;
}

upstream invoicehub_api {
    server 127.0.0.1:3000;
}

upstream app2_frontend {
    server 127.0.0.1:4001;
}

upstream app3_frontend {
    server 127.0.0.1:5001;
}

# ============================================================
# Serveur HTTP (redirection vers HTTPS)
# ============================================================
server {
    listen 80;
    server_name invoicehub.bridgetech-solutions api.invoicehub.bridgetech-solutions app2.bridgetech-solutions app3.bridgetech-solutions;

    # Rediriger tout en HTTPS
    return 301 https://$server_name$request_uri;
}

# ============================================================
# Serveur HTTPS — InvoiceHub Frontend
# ============================================================
server {
    listen 443 ssl;
    server_name invoicehub.bridgetech-solutions www.invoicehub.bridgetech-solutions;

    # Certificats SSL
    ssl_certificate /etc/nginx/certs/invoicehub.crt;
    ssl_certificate_key /etc/nginx/certs/invoicehub.key;

    # Configuration SSL sécurisée
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Proxy vers Frontend Next.js
    location / {
        proxy_pass http://invoicehub_frontend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
    }
}

# ============================================================
# Serveur HTTPS — InvoiceHub API
# ============================================================
server {
    listen 443 ssl;
    server_name api.invoicehub.bridgetech-solutions;

    ssl_certificate /etc/nginx/certs/invoicehub.crt;
    ssl_certificate_key /etc/nginx/certs/invoicehub.key;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Proxy vers Backend Express
    location / {
        proxy_pass http://invoicehub_api;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Timeouts pour requêtes longues (uploads, exports PDF)
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}

# ============================================================
# Serveur HTTPS — Application 2 (réservée)
# ============================================================
server {
    listen 443 ssl;
    server_name app2.bridgetech-solutions;

    ssl_certificate /etc/nginx/certs/invoicehub.crt;
    ssl_certificate_key /etc/nginx/certs/invoicehub.key;

    ssl_protocols TLSv1.2 TLSv1.3;

    location / {
        proxy_pass http://app2_frontend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# ============================================================
# Serveur HTTPS — Application 3 (réservée)
# ============================================================
server {
    listen 443 ssl;
    server_name app3.bridgetech-solutions;

    ssl_certificate /etc/nginx/certs/invoicehub.crt;
    ssl_certificate_key /etc/nginx/certs/invoicehub.key;

    ssl_protocols TLSv1.2 TLSv1.3;

    location / {
        proxy_pass http://app3_frontend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Étape 5B : Créer le Dockerfile pour Nginx

Créer `C:\BTS-Apps\nginx\Dockerfile` :

```dockerfile
FROM nginx:latest

# Copier la configuration Nginx
COPY nginx.conf /etc/nginx/nginx.conf

# Copier les certificats SSL
COPY certs/ /etc/nginx/certs/

# Exposer les ports
EXPOSE 80 443

# Démarrer Nginx
CMD ["nginx", "-g", "daemon off;"]
```

---

## 📦 PHASE 6 : Configuration InvoiceHub

### Étape 6A : Configurer les variables d'environnement

**Créer** `C:\BTS-Apps\invoicehub\bridge-backend\.env` :

```env
# ============================================================
# ENVIRONNEMENT
# ============================================================
NODE_ENV=production
PORT=3000
FRONTEND_PORT=3001

# ============================================================
# DOMAINE ET RÉSEAU (Nginx fait le routage HTTPS)
# ============================================================
# EN INTERNE (Docker), l'API écoute sur http://localhost:3000
# Le Frontend appelle l'API via http://api:3000 (réseau Docker)
# Nginx ajoute le SSL et redirige via https://api.invoicehub.bridgetech-solutions

APP_URL=https://invoicehub.bridgetech-solutions
API_URL=https://api.invoicehub.bridgetech-solutions
CORS_ORIGINS=https://invoicehub.bridgetech-solutions,https://www.invoicehub.bridgetech-solutions

# ============================================================
# BASE DE DONNÉES (PostgreSQL en Docker)
# ============================================================
DATABASE_URL=postgresql://postgres:ChoosingAStrongPassword123@db:5432/invoicehub?schema=public
DB_HOST=db
DB_PORT=5432
DB_NAME=invoicehub
DB_USER=postgres
DB_PASSWORD=ChoosingAStrongPassword123

# ============================================================
# CACHE ET QUEUES (Redis en Docker)
# ============================================================
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=

# ============================================================
# JWT SECRETS (Générer deux chaînes aléatoires)
# ============================================================
# Générer avec : node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
JWT_ACCESS_SECRET=a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0
JWT_REFRESH_SECRET=f0e9d8c7b6a5f4e3d2c1b0a9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c3b2a1

# ============================================================
# EMAIL (SMTP)
# ============================================================
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=noreply@bridgetech-solutions.cm
SMTP_SECURE=false

# ============================================================
# ASSISTANT IA (Ollama en Docker)
# ============================================================
OLLAMA_ENABLED=false
OLLAMA_MODEL=mistral
OLLAMA_HOST=http://ollama:11434

# ============================================================
# SAUVEGARDES
# ============================================================
BACKUP_STORAGE_DISK=local
BACKUP_DIR=./uploads/backups
BACKUP_RETENTION_DAYS=30
BACKUP_CRON=0 0 * * *

# ============================================================
# JOBS (Schedulers)
# ============================================================
# Overdue, recurring, reminders à 08:15 UTC
# Backups à 16:30 UTC
JOBS_ENABLED=true

# ============================================================
# LOGGING
# ============================================================
LOG_LEVEL=info
LOG_FORMAT=json
```

### Étape 6B : Créer le fichier `.env` pour le Frontend

**Créer** `C:\BTS-Apps\invoicehub\bridge-frontend\.env.local` :

```env
# Frontend appelle l'API via Nginx (HTTPS)
NEXT_PUBLIC_API_URL=https://api.invoicehub.bridgetech-solutions

# URL d'accès principal
NEXT_PUBLIC_APP_URL=https://invoicehub.bridgetech-solutions

# Environment
NEXT_PUBLIC_ENV=production
```

### Étape 6C : Adapter le docker-compose.yml pour multi-apps

Le docker-compose.yml d'InvoiceHub reste inchangé (les conteneurs tournent en interne).

**À vérifier** dans `C:\BTS-Apps\invoicehub\docker-compose.yml` :
- Réseau : `networks: default` ou `networks: invoicehub`
- Ports api : `3000:3000` (interne Docker uniquement)
- Ports frontend : `3001:3001` (interne Docker uniquement)
- Service `db` : volume persistant `postgres_data:/var/lib/postgresql/data`
- Service `redis` : volume persistant `redis_data:/data`

**Important** : Les ports 3000 et 3001 ne sont accessibles que depuis le Nginx (localhost:3000/3001 en interne).

---

## 🚀 PHASE 7 : Déploiement (Lancer les conteneurs)

### Étape 7A : Construire les images Docker

**PowerShell** (C:\BTS-Apps\invoicehub) :

```powershell
# 1. Installer les dépendances backend
cd bridge-backend
pnpm install

# 2. Générer Prisma Client
pnpm exec prisma generate

# 3. Construire les images Docker
cd ..
docker-compose build

# Vérifier les images
docker images | Select-String invoicehub
```

**Temps estimé** : 5 à 10 minutes

### Étape 7B : Démarrer InvoiceHub

**PowerShell** (C:\BTS-Apps\invoicehub) :

```powershell
# Démarrer les conteneurs en arrière-plan
docker-compose up -d

# Vérifier le démarrage
docker-compose ps
docker-compose logs -f api

# Attendre que l'API soit prête (voir "Server running on http://0.0.0.0:3000")
```

**Vérifier l'API** :
```powershell
Invoke-WebRequest http://localhost:3000/api/health
```

**Résultat attendu** :
```
StatusCode : 200
Content    : {"success":true,"status":"ok","timestamp":"2026-04-07T..."}
```

### Étape 7C : Construire et démarrer Nginx

**PowerShell** (C:\BTS-Apps) :

```powershell
# Créer le réseau Docker global (pour la communication multi-apps)
docker network create bridge-network

# Reconnecter les conteneurs InvoiceHub au réseau global
# (optionnel mais recommandé pour l'extensibilité)

# Construire l'image Nginx
docker build -t nginx-proxy ./nginx

# Démarrer Nginx
docker run -d `
  --name nginx-proxy `
  --network host `
  -p 80:80 `
  -p 443:443 `
  --restart unless-stopped `
  nginx-proxy
```

**Vérifier Nginx** :
```powershell
docker ps | Select-String nginx
docker logs nginx-proxy
```

---

## 🌍 PHASE 8 : Tester l'Accès

### Étape 8A : Tester depuis le serveur local

**Navigateur web** :

```
https://invoicehub.bridgetech-solutions
```

**Résultats attendus** :
- ✅ Redirection HTTP → HTTPS automatique
- ✅ Affichage de la page de connexion (avertissement SSL possible, cocher "Continuer malgré tout")
- ✅ Identifiants par défaut :
  - Email : `admin@bridgetech-solutions.cm`
  - Mot de passe : `Admin@123456`

### Étape 8B : Tester l'API depuis un autre ordinateur du réseau

1. **Depuis un autre PC, ouvrir PowerShell** :
```powershell
# Tester la résolution DNS
nslookup invoicehub.bridgetech-solutions

# Si DNS Server ou AD est utilisé :
# → Server: <IP_DNS_SERVER>
# → Address: 127.0.0.1

# Tester la connexion HTTPS
$serverIP = "192.168.1.10"
Invoke-WebRequest https://invoicehub.bridgetech-solutions/api/health -SkipCertificateCheck
```

2. **Configuration supplémentaire selon l'option DNS** :

**Si Option A (fichier hosts)** :
   - Éditer `C:\Windows\System32\drivers\etc\hosts` sur le PC client
   - Ajouter :
   ```
   192.168.1.10    invoicehub.bridgetech-solutions
   192.168.1.10    api.invoicehub.bridgetech-solutions
   ```

**Si Option B (DNS Server)** :
   - Le PC client doit avoir en DNS : `192.168.1.10` (le serveur DNS)
   - Configurable via Settings → Network → DNS ou PowerShell (voir Étape 2B-4)

**Si Option C (Active Directory)** :
   - Configuration automatique si le PC est membre du domaine
   - Ou forcer : `ipconfig /registerdns` sur le client

3. **Puis tester dans le navigateur** :
```
https://invoicehub.bridgetech-solutions
```

### Étape 8C : Tester les différentes routes

**Routes disponibles** :

| URL | Destination | Rôle |
|-----|-------------|------|
| `https://invoicehub.bridgetech-solutions` | Frontend (Next.js port 3001) | Accès utilisateurs |
| `https://www.invoicehub.bridgetech-solutions` | Frontend (Next.js port 3001) | Alias (redirect) |
| `https://api.invoicehub.bridgetech-solutions/api/health` | Backend API (Express port 3000) | Health check |
| `https://api.invoicehub.bridgetech-solutions/api/auth/login` | Backend API | Authentification |

---

## 🔄 PHASE 9 : Démarrage Automatique (Au Reboot du Serveur)

### Étape 9A : Configurer le démarrage automatique Docker Desktop

1. **Ouvrir Docker Desktop Settings** (icône Docker → Settings)
2. Aller à **General**
3. Cocher ✅ **"Start Docker Desktop when you sign in to your computer"**
4. Cliquer **Apply & Restart**

### Étape 9B : Créer un script PowerShell d'auto-démarrage

Créer `C:\BTS-Apps\start-all-apps.ps1` :

```powershell
# Script : Démarrer toutes les applications au reboot du serveur

# Attendre que Docker soit prêt (30 sec)
Write-Host "Attente du démarrage de Docker..."
Start-Sleep -Seconds 30

# Démarrer InvoiceHub
Write-Host "Démarrage d'InvoiceHub..."
Push-Location C:\BTS-Apps\invoicehub
docker-compose up -d

# Attendre que l'API soit prête (30 sec)
Start-Sleep -Seconds 30

# Démarrer Nginx
Write-Host "Démarrage du Reverse Proxy (Nginx)..."
docker run -d `
  --name nginx-proxy `
  --network host `
  -p 80:80 `
  -p 443:443 `
  --restart unless-stopped `
  nginx-proxy

Write-Host "✅ Toutes les applications sont démarrées."
```

**Enregistrer ce script en tant que tâche planifiée** (PowerShell admin) :

```powershell
# Créer une tâche si l'utilisateur se connecte
$taskName = "Start-BTS-Apps"
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -WindowStyle Hidden -File C:\BTS-Apps\start-all-apps.ps1"
$trigger = New-ScheduledTaskTrigger -AtLogon
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -RunLevel Highest

Register-ScheduledTask `
  -TaskName $taskName `
  -Action $action `
  -Trigger $trigger `
  -Principal $principal `
  -Force

Write-Host "✅ Tâche planifiée créée : $taskName"
```

### Étape 9C : Vérifier l'auto-démarrage

**Redémarrer le serveur** :
```powershell
Restart-Computer -Force
```

**Attendre 2 minutes**, puis tester :
```powershell
# Après réboot
docker ps
docker-compose ps
```

Les conteneurs doivent être en état "Up".

---

## 📊 PHASE 10 : Ajouter une Deuxième Application (App 2)

### Étape 10A : Structure pour App 2

```
C:\BTS-Apps\app2\
├── docker-compose.yml
├── Dockerfile
├── .env
└── src/
    └── (code de l'application)
```

### Étape 10B : Configurer App 2

**Créer** `C:\BTS-Apps\app2\docker-compose.yml` :

```yaml
version: '3.9'

services:
  app2:
    build: .
    container_name: app2
    ports:
      - "4001:4001"
    environment:
      - NODE_ENV=production
      - PORT=4001
    restart: unless-stopped
```

### Étape 10C : Ajouter App 2 au Nginx

Éditer `C:\BTS-Apps\nginx\nginx.conf` et ajouter :

```nginx
upstream app2_frontend {
    server 127.0.0.1:4001;
}

server {
    listen 443 ssl;
    server_name app2.bridgetech-solutions;

    ssl_certificate /etc/nginx/certs/invoicehub.crt;
    ssl_certificate_key /etc/nginx/certs/invoicehub.key;

    location / {
        proxy_pass http://app2_frontend;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto https;
    }
}
```

Ajouter au fichier `hosts` Windows :
```
127.0.0.1    app2.bridgetech-solutions
```

Redémarrer Nginx :
```powershell
docker restart nginx-proxy
```

---

## 🛠️ PHASE 11 : Commandes de Maintenance

### Étape 11A : Vérification l'état des services

```powershell
# Voir tous les conteneurs
docker ps -a

# Voir les logs d'InvoiceHub
docker-compose -f C:\BTS-Apps\invoicehub\docker-compose.yml logs -f

# Voir les logs du Reverse Proxy
docker logs -f nginx-proxy

# Voir les statistiques de ressources
docker stats
```

### Étape 11B : Mise à jour du code

```powershell
cd C:\BTS-Apps\invoicehub

# Récupérer les derniers changements
git pull

# Mettre à jour les dépendances
pnpm install

# Reconstruire et redémarrer
docker-compose build
docker-compose up -d

# Vérifier les migrations
docker-compose logs api | Select-String -Pattern "migration|Migration"
```

### Étape 11C : Redémarrer un service spécifique

```powershell
# Redémarrer l'API
docker-compose -f C:\BTS-Apps\invoicehub\docker-compose.yml restart api

# Redémarrer le Nginx
docker restart nginx-proxy

# Redémarrer la base de données
docker-compose -f C:\BTS-Apps\invoicehub\docker-compose.yml restart db
```

### Étape 11D : Générer une sauvegarde de la base de données

```powershell
# Créer un backup manuel
docker-compose -f C:\BTS-Apps\invoicehub\docker-compose.yml exec db pg_dump -U postgres invoicehub > C:\BTS-Apps\backups\invoicehub_$(Get-Date -Format 'yyyyMMdd_HHmmss').sql

# Vérifier les backups
ls C:\BTS-Apps\backups\
```

### Étape 11E : Arrêter l'application (maintenance)

```powershell
cd C:\BTS-Apps\invoicehub

# Arrêter TOUS les services
docker-compose down

# Arrêter aussi le Nginx
docker stop nginx-proxy

# Vérifier qu'aucun conteneur ne tourne
docker ps
```

### Étape 11F : Redémarrer complètement

```powershell
# Démarrer InvoiceHub
docker-compose -f C:\BTS-Apps\invoicehub\docker-compose.yml up -d

# Attendre 30 sec
Start-Sleep -Seconds 30

# Redémarrer Nginx
docker start nginx-proxy

# Vérifier
docker ps
```

---

## ⚠️ PHASE 12 : Dépannage

### Erreur : Impossible d'accéder à invoicehub.bridgetech-solutions

**Cause probable** : DNS non configuré

**Solution** :
```powershell
# Vérifier le fichier hosts
Get-Content C:\Windows\System32\drivers\etc\hosts | Select-String invoicehub

# Tester la résolution
ping invoicehub.bridgetech-solutions

# Si la résolution échoue, redémarrer le DNS
ipconfig /flushdns
```

### Erreur : "Page blanche" ou erreur de connexion

**Cause probable** : Nginx ou à un conteneur non démarré

**Solution** :
```powershell
# Vérifier l'état des conteneurs
docker ps

# Redémarrer Nginx
docker stop nginx-proxy
docker rm nginx-proxy
docker run -d --name nginx-proxy --network host -p 80:80 -p 443:443 --restart unless-stopped nginx-proxy

# Redémarrer l'API
docker-compose -f C:\BTS-Apps\invoicehub\docker-compose.yml restart api
```

### Erreur : "Certificat SSL non approuvé"

**Cause** : Certificat auto-signé

**Solution** :
1. Au premier accès, cliquer : **Paramètres avancés** → **Continuer malgré tout**
2. Pour éviter cet avertissement, importer le certificat dans le système :
```powershell
Import-Certificate -FilePath C:\BTS-Apps\nginx\certs\invoicehub.crt -CertStoreLocation Cert:\LocalMachine\Root
```

### Erreur : Port 80 ou 443 déjà utilisé

**Cause** : Un autre service utilise ces ports

**Solution** :
```powershell
# Voir quel processus utilise le port 80
netstat -ano | Select-String ":80 " | Select-String LISTENING

# Tuer le processus (remplacer PID par le numéro)
taskkill /PID <PID> /F
```

### Erreur : "Connection refused" sur localhost:3000

**Cause** : L'API n'a pas fini de démarrer

**Solution** :
```powershell
# Vérifier les logs
docker-compose -f C:\BTS-Apps\invoicehub\docker-compose.yml logs api

# Attendre 30 secondes, puis retester
Start-Sleep -Seconds 30
Invoke-WebRequest http://localhost:3000/api/health
```

---

## 📋 Checklist de Déploiement

- [ ] **Prérequis vérifiés** : RAM, disque, VirtualisationFirmwareEnabled
- [ ] **Docker Desktop installé** et démarrage automatique configuré
- [ ] **Git, Node.js, pnpm, OpenSSL installés**
- [ ] **Fichier `hosts` Windows** configuré avec invoicehub.bridgetech-solutions
- [ ] **Certificats SSL** générés dans C:\BTS-Apps\nginx\certs\
- [ ] **Configuration Nginx** créée (nginx.conf + Dockerfile)
- [ ] **Variables `.env`** renseignées (JWT secrets, SMTP, DB password)
- [ ] **Images Docker construites** : docker build + docker-compose build
- [ ] **InvoiceHub démarré** : docker-compose up -d
- [ ] **Nginx démarré** : docker run ... nginx-proxy
- [ ] **Test local** : https://invoicehub.bridgetech-solutions → Page de connexion
- [ ] **Test API** : https://api.invoicehub.bridgetech-solutions/api/health → 200 OK
- [ ] **Auto-démarrage** configuré en tâche planifiée PowerShell
- [ ] **Redémarrage du serveur** testé — toutes les apps redémarrent
- [ ] **Sauvegarde DB** testée
- [ ] **Documentation** mise à jour

---

## 📝 Résumé de l'Architecture

```
┌─────────────────────────────────────────────────────────────┐
│              Windows Server (192.168.1.10)                  │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │      Docker Desktop (WSL 2)                          │  │
│  │                                                      │  │
│  │  ┌──────────────────────────────────────────────┐   │  │
│  │  │  Nginx Reverse Proxy (Port 80/443)           │   │  │
│  │  │  - HTTPS termination                         │   │  │
│  │  │  - Routage par domaine                       │   │  │
│  │  │  - Certificats SSL auto-signés              │   │  │
│  │  └──────────────────────────────────────────────┘   │  │
│  │         ↓ HTTP proxy                                │  │
│  │  ┌──────────────────────────────────────────────┐   │  │
│  │  │  InvoiceHub (docker-compose)                 │   │  │
│  │  │                                              │   │  │
│  │  │  ┌─────────┐  ┌─────────┐  ┌──────────────┐ │   │  │
│  │  │  │ Frontend │  │   API   │  │  PostgreSQL  │ │   │  │
│  │  │  │ Next.js  │  │ Express │  │  + Redis     │ │   │  │
│  │  │  │ 3001     │  │ 3000    │  │ + Ollama     │ │   │  │
│  │  │  └─────────┘  └─────────┘  └──────────────┘ │   │  │
│  │  └──────────────────────────────────────────────┘   │  │
│  │                                                      │  │
│  │  ┌──────────────────────────────────────────────┐   │  │
│  │  │  App 2 (docker-compose) [réservée]           │   │  │
│  │  │  Port 4001                                   │   │  │
│  │  └──────────────────────────────────────────────┘   │  │
│  │                                                      │  │
│  │  ┌──────────────────────────────────────────────┐   │  │
│  │  │  App 3 (docker-compose) [réservée]           │   │  │
│  │  │  Port 5001                                   │   │  │
│  │  └──────────────────────────────────────────────┘   │  │
│  │                                                      │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  DNS local (Hosts file)                                    │
│  127.0.0.1 invoicehub.bridgetech-solutions                │
│  127.0.0.1 api.invoicehub.bridgetech-solutions            │
│  127.0.0.1 app2.bridgetech-solutions                      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
     ↓ Accès réseau LAN
┌─────────────────────────────┐
│   Autres PC du réseau       │
│   (192.168.1.20, etc.)      │
│                             │
│   Browser :                 │
│   https://invoicehub.       │
│   bridgetech-solutions      │
└─────────────────────────────┘
```

---

## 🎯 Points Clés à Retenir

1. **Nginx gère tous les noms de domaine** — à lui seul il redirige HTTPS vers les bons ports internes
2. **Docker compose ne part qu'InvoiceHub** — les conteneurs tournent en interne sur les ports 3000/3001
3. **Multi-apps = multi-docker-compose** — chaque app a son propre docker-compose.yml, Nginx les rend accessibles
4. **Certificats SSL auto-signés** — suffisants pour un réseau local, importables dans Windows Root CA
5. **Auto-restart** — les conteneurs redémarrent si Docker Desktop redémarre grâce à `restart: unless-stopped`
6. **Power of Domaines locaux** — invoicehub.bridgetech-solutions est plus mémorable qu'une IP

---

**Fin du guide. À toi de valider! 🚀**
