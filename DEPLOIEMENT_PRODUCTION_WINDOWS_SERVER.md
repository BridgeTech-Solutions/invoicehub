# 📋 Guide Complet : Déploiement InvoiceHub v2.0 + Multi-Apps sur Windows Server (Production)

**Objectif** : Déployer InvoiceHub avec domaine local `invoicehub.bridgetech-solutions` sur un réseau d'entreprise avec support multi-applications et reverse proxy centralisé.

**Architecture cible** : 
- Docker Desktop sur Windows Server (WSL 2)
- **Reverse Proxy isolé** (Nginx) dans `.\nginx` — gère HTTPS + routage par domaine
- **Réseau Docker `bridge-net`** — Communication sécurisée entre services
- **DNS Server rôle Windows** — Résolution de noms centralisée
- **SSL/TLS auto-signé** — Sécurité interne réseau
- **Séparation des services** — L'application et Nginx ont chacun leur propre `docker-compose.yml`

**Durée estimée** : 45-60 minutes (première installation)

**Avantages de cette architecture** :
- ✅ **Production-ready** — Aucun port applicatif exposé au host
- ✅ **Sécurisé** — Seul Nginx écoute 80/443
- ✅ **Scalable** — Ajouter App2, App3 = juste modifier nginx.conf
- ✅ **Zéro config client** — Si DNS Server configuré
- ✅ **Isolation réseau** — Les apps ne se voient que via proxy

---

## 🔧 PHASE 1 : Préparation du serveur Windows

### Étape 1A : Vérifier les prérequis système

**Exigences minimales** :
- Windows Server 2019 (ou 2022) — Édition Standard/Datacenter
- CPU : 4 cœurs minimum (8 recommandé)
- RAM : 16 Go (8 Go minimum, mais performance limitée)
- Disque : 100 Go libres (SSD recommandé)
- Virtualisation activée (Hyper-V ou VMX) dans le BIOS

**Vérifier la configuration** (PowerShell administrateur) :
```powershell
# Voir la RAM disponible
Get-WmiObject Win32_OperatingSystem | Select-Object TotalVisibleMemorySize

# Voir l'espace disque C:\
Get-PSDrive C | Format-List @{Name="Used (GB)"; Expression={$_.Used / 1GB -as [int]}}, @{Name="Free (GB)"; Expression={$_.Free / 1GB -as [int]}}

# Vérifier la virtualisation activée
Get-WmiObject Win32_Processor | Select-Object VirtualizationFirmwareEnabled
```

### Étape 1B : Installer Docker Desktop

1. **Télécharger** Docker Desktop depuis https://www.docker.com/products/docker-desktop
2. **Exécuter l'installeur** et suivre les étapes
3. **Options critiques** :
   - ✅ Cocher **"Use WSL 2 based engine"** (obligatoire)
   - ✅ Cocher **"Install required Windows components for WSL 2"**
   - ✅ Cocher **"Add Docker Compose v2"**
4. **Redémarrer** le serveur après l'installation
5. **Vérifier** (PowerShell) :
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

# 4. Installer OpenSSL (pour certificats SSL)
winget install OpenSSL.Light

# Vérifier
git --version
node --version
pnpm --version
openssl version
```

### Étape 1D : Configurer Docker Desktop (Ressources)

1. Ouvrir **Docker Desktop** → **Settings** → **Resources**
2. **CPUs** : 4 (ou 8 si disponible)
3. **Memory** : 8000 Mo (ou 12000 Mo minimum pour production)
4. **Swap** : 2000 Mo
5. **Disk image size** : 100 Go
6. Cliquer **Apply & Restart**

---

## 🌐 PHASE 2 : Configuration DNS (Résolution de noms)

**Cette phase configure le serveur pour que tous les noms de domaine (invoicehub.bridgetech-solutions, app2.bridgetech-solutions, etc.) pointent vers le serveur.**

### 📌 Comment ça fonctionne (Architecture Nginx)

```
PC Client                      Windows Server (192.168.1.10)
   ↓                                      ↓
   1. Tape : https://invoicehub.bridgetech-solutions
   ↓
   2. DNS Query : "invoicehub.bridgetech-solutions = ?"
   ↓                   (DNS Server répond : 192.168.1.10)
   ↓────────────────────→ Nginx port 443 (Nginx écoute 80/443)
   ↓                           ↓
   ↓                  3. Nginx reçoit la requête
   ↓                  4. Examine le hostname : invoicehub.bridgetech-solutions
   ↓                  5. Redirige vers invoicehub-frontend:3001 (conteneur Docker)
   ↓←────────────────── Réponse HTML s'affiche ↓
   ✅ Page InvoiceHub chargée
```

**Points clés** :
- ✅ **DNS pointe vers 192.168.1.10** (IP du serveur Windows avec Nginx)
- ✅ **Nginx écoute 80/443** sur le serveur (uniquement)
- ✅ **Nginx redirige vers les conteneurs** (invoicehub-frontend:3001, invoicehub-api:3005)
- ✅ **Pas de ports applicatifs exposés** — Sécurité ✓
- ✅ **Multi-apps sur même serveur** — Scalable ✓

### Choisis une option selon ton contexte :

| Option | Effort | Config client | Pour qui |
|--------|--------|---------------|----------|
| **Option A** | 1 cmd PowerShell | Automatique (DHCP) | PME/Réseau LAN |
| **Option B** | Déjà existant | Automatique (AD) | Grandes organisations |

---

### ⭐ Option A : DNS Server rôle Windows (RECOMMANDÉ)

**Meilleur pour** : Réseau d'entreprise, PME, réseau local avec gestion centralisée

#### 2A-1 : Installer le rôle DNS Server

**PowerShell (admin)** :

```powershell
# Installer le rôle DNS Server avec outils de gestion
Install-WindowsFeature -Name DNS -IncludeManagementTools

# Le service DNS démarre automatiquement
```

#### 2A-2 : Créer une Zone DNS Primaire

1. **Ouvrir le Gestionnaire DNS** :
   - `Win + R` → `dnsmgmt.msc` → OK

2. **Créer la zone** :
   - Clique-droit sur **"Zones de recherche directe"** → **Nouvelle zone**
   - Type : **"Zone primaire"**
   - Nom : **`bridgetech-solutions`**
   - Fichier : Créer un nouveau fichier (défaut)
   - Terminer

#### 2A-3 : Ajouter les enregistrements DNS

**Dans le Gestionnaire DNS**, développer **`bridgetech-solutions`** et clique-droit → **Nouvel hôte (A ou AAAA)**.

Ajouter les enregistrements suivants (**remplacer `192.168.1.10` par l'IP réelle de votre serveur Windows**) :

| Nom | Type | IP |
|-----|------|-----|
| invoicehub | A | 192.168.1.10 |
| api.invoicehub | A | 192.168.1.10 |
| www.invoicehub | A | 192.168.1.10 |
| app2 | A | 192.168.1.10 |
| app3 | A | 192.168.1.10 |

**Exemple pour `invoicehub`** :
- Nom : `invoicehub`
- FQDN : `invoicehub.bridgetech-solutions`
- IP : `192.168.1.10` ← **IP réelle du serveur Windows (pas 127.0.0.1)**

#### 2A-4 : Configuration des PC clients (Automatique avec DHCP)

**Si votre réseau utilise DHCP** :
- ✅ Les PC clients reçoivent **automatiquement** le serveur DNS du DHCP
- ✅ **Aucune configuration manuelle requise**
- ✅ Il suffit de configurer le serveur DHCP pour envoyer `192.168.1.10` comme serveur DNS

**Si vous avez besoin de configuration manuelle** (réseau statique ou pour test) :

**Option 1 : GUI** (Windows Settings)
1. Settings → Network & Internet → Advanced network settings
2. Changer les options de l'adaptateur → Sélectionner la connexion
3. Properties → Internet Protocol Version 4 (TCP/IPv4)
4. **Preferred DNS server** : `192.168.1.10` (remplacer par l'IP réelle du serveur)

**Option 2 : PowerShell (admin)** :
```powershell
# Configurer le DNS server
Set-DnsClientServerAddress `
  -InterfaceAlias "Ethernet" `
  -ServerAddresses ("192.168.1.10")

# Vérifier
Get-DnsClientServerAddress -InterfaceAlias "Ethernet"
```

#### 2A-5 : Tester la résolution DNS

**Depuis un PC client** :
```powershell
nslookup invoicehub.bridgetech-solutions
```

**Résultat attendu** :
```
Server: dns-server
Address: 192.168.1.10

Name:    invoicehub.bridgetech-solutions
Address: 192.168.1.10
```

**Puis vérifier que Nginx reçoit la requête** :
```powershell
Invoke-WebRequest https://invoicehub.bridgetech-solutions -SkipCertificateCheck | Select-Object StatusCode
```

**Résultat attendu** : `StatusCode : 200` ✅

---

### ⭐⭐ Option B : Active Directory + DNS (Entreprise — Zéro config client)

**Si tu as déjà Active Directory** : C'est l'option **la plus simple** — zéro config client ✅

```powershell
# Créer une zone DNS intégrée à AD
Add-DnsServerPrimaryZone `
  -Name "bridgetech-solutions" `
  -ReplicationScope "Forest"

# Ajouter les enregistrements (remplacer 192.168.1.10 par l'IP réelle du serveur Windows)
Add-DnsServerResourceRecordA -ZoneName "bridgetech-solutions" -Name "invoicehub" -IPv4Address "192.168.1.10"
Add-DnsServerResourceRecordA -ZoneName "bridgetech-solutions" -Name "api.invoicehub" -IPv4Address "192.168.1.10"
Add-DnsServerResourceRecordA -ZoneName "bridgetech-solutions" -Name "www.invoicehub" -IPv4Address "192.168.1.10"
Add-DnsServerResourceRecordA -ZoneName "bridgetech-solutions" -Name "app2" -IPv4Address "192.168.1.10"
```

**Avantage** :
- ✅ Les PC domaine-connectés reçoivent **automatiquement** la configuration DNS
- ✅ **Zéro configuration manuelle** requise sur les clients
- ✅ Gestion centralisée via Active Directory

---

## 🐳 PHASE 3 : Structure du projet et Réseau Docker

### Étape 3A : Créer la structure des dossiers

```powershell
# Créer la structure multi-applications
mkdir C:\BTS-Apps
mkdir C:\BTS-Apps\ReverseProxy
mkdir C:\BTS-Apps\ReverseProxy\certs
mkdir C:\BTS-Apps\invoicehub
mkdir C:\BTS-Apps\app2
mkdir C:\BTS-Apps\app3
mkdir C:\BTS-Apps\backups
```

**Structure finale** :
```
C:\BTS-Apps\
├── ReverseProxy\         (Nginx centralisé)
│   ├── docker-compose.yml
│   ├── nginx.conf
│   ├── Dockerfile
│   └── certs\            (Certificats SSL)
│       ├── invoicehub.crt
│       └── invoicehub.key
│
├── invoicehub\           (Application principale)
│   ├── docker-compose.yml
│   ├── bridge-backend\
│   ├── bridge-frontend\
│   └── .env
│
├── app2\                 (Future app 2)
│   └── docker-compose.yml
│
├── app3\                 (Future app 3)
│   └── docker-compose.yml
│
└── backups\              (Sauvegardes DB)
```

### Étape 3B : Créer le réseau Docker centralisé

**PowerShell** :

```powershell
# Créer le réseau partagé
docker network create bridge-net

# Vérifier
docker network ls | Select-String bridge-net
```

**Ce réseau sera utilisé par** :
- Reverse Proxy (Nginx)
- InvoiceHub (Frontend + API)
- App 2, App 3 (futures)

---

## 🔐 PHASE 4 : Générer les Certificats SSL/TLS

### Étape 4A : Générer le certificat

**PowerShell** (dans `C:\BTS-Apps\ReverseProxy`) :

```powershell
cd C:\BTS-Apps\ReverseProxy
.\generate-certs.ps1
```

*Vérifiez que `invoicehub.crt` et `invoicehub.key` sont bien présents dans `C:\BTS-Apps\ReverseProxy\certs\` après l'exécution.*

### Étape 4B : Importer le certificat (optionnel mais recommandé)

Pour éviter les avertissements SSL dans les navigateurs :

```powershell
Import-Certificate `
  -FilePath C:\Users\Administrateur\Documents\Appli Bridge\nginx\certs\invoicehub.crt `
  -CertStoreLocation Cert:\LocalMachine\Root
```

---

## 🔄 PHASE 5 : Configuration du Reverse Proxy Centralisé

### Étape 5A : Créer nginx.conf

**Créer** `C:\BTS-Apps\ReverseProxy\nginx.conf` :

```nginx
user nginx;
worker_processes auto;
error_log /var/log/nginx/error.log warn;
pid /var/run/nginx.pid;

events {
    worker_connections 1024;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent" "$http_x_forwarded_for"';

    access_log /var/log/nginx/access.log main;
    sendfile on;
    tcp_nopush on;
    keepalive_timeout 65;
    gzip on;

    # ============================================================
    # Upstream : Services backend (noms de conteneurs Docker)
    # ============================================================
    upstream invoicehub_frontend {
        server invoicehub-frontend:3001;
    }

    upstream invoicehub_api {
        server invoicehub-api:3005;
    }

    upstream app2_frontend {
        server app2:4001;
    }

    upstream app3_frontend {
        server app3:5001;
    }

    # ============================================================
    # HTTP → HTTPS Redirect
    # ============================================================
    server {
        listen 80;
        server_name invoicehub.bridgetech-solutions api.invoicehub.bridgetech-solutions app2.bridgetech-solutions app3.bridgetech-solutions;

        location / {
            return 301 https://$server_name$request_uri;
        }
    }

    # ============================================================
    # HTTPS : InvoiceHub Frontend
    # ============================================================
    server {
        listen 443 ssl;
        server_name invoicehub.bridgetech-solutions www.invoicehub.bridgetech-solutions;

        ssl_certificate /etc/nginx/certs/invoicehub.crt;
        ssl_certificate_key /etc/nginx/certs/invoicehub.key;

        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers HIGH:!aNULL:!MD5;
        ssl_prefer_server_ciphers on;

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
    # HTTPS : InvoiceHub API
    # ============================================================
    server {
        listen 443 ssl;
        server_name api.invoicehub.bridgetech-solutions;

        ssl_certificate /etc/nginx/certs/invoicehub.crt;
        ssl_certificate_key /etc/nginx/certs/invoicehub.key;

        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers HIGH:!aNULL:!MD5;

        location / {
            proxy_pass http://invoicehub_api;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto https;
            proxy_connect_timeout 60s;
            proxy_send_timeout 60s;
            proxy_read_timeout 60s;
        }
    }

    # ============================================================
    # HTTPS : App 2
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
            proxy_set_header X-Forwarded-Proto https;
        }
    }

    # ============================================================
    # HTTPS : App 3
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
            proxy_set_header X-Forwarded-Proto https;
        }
    }
}
```

### Étape 5B : Créer le Dockerfile pour Nginx

**Créer** `C:\BTS-Apps\ReverseProxy\Dockerfile` :

```dockerfile
FROM nginx:alpine

# Copier la configuration Nginx
COPY nginx.conf /etc/nginx/nginx.conf

# Copier les certificats SSL
COPY certs/ /etc/nginx/certs/

# Exposer les ports
EXPOSE 80 443

# Démarrer Nginx
CMD ["nginx", "-g", "daemon off;"]
```

### Étape 5C : Créer le docker-compose du Reverse Proxy

**Créer** `C:\BTS-Apps\ReverseProxy\docker-compose.yml` :

```yaml
version: '3.9'

services:
  nginx-proxy:
    build: .
    container_name: global-proxy
    restart: always
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./certs:/etc/nginx/certs:ro
    networks:
      - bridge-net
    healthcheck:
      test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost:80"]
      interval: 30s
      timeout: 10s
      retries: 3

networks:
  bridge-net:
    external: true
```

---

## 📦 PHASE 6 : Configuration InvoiceHub

### Étape 6A : Adapter le docker-compose.yml d'InvoiceHub

**Modifier** `C:\BTS-Apps\invoicehub\docker-compose.yml` :

```yaml
version: '3.9'

services:
  db:
    image: postgres:15-alpine
    container_name: invoicehub-db
    environment:
      POSTGRES_DB: invoicehub
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: ChoosingAStrongPassword123
    ports:
      - "5432:5432"  # Exposé localement pour psql si besoin
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - bridge-net
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    container_name: invoicehub-redis
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    networks:
      - bridge-net
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  ollama:
    image: ollama/ollama:latest
    container_name: invoicehub-ollama
    ports:
      - "11434:11434"
    volumes:
      - ollama_data:/root/.ollama
    networks:
      - bridge-net
    restart: unless-stopped
    environment:
      OLLAMA_KEEP_ALIVE: 5m

  api:
    build:
      context: ./bridge-backend
      dockerfile: docker/Dockerfile
    container_name: invoicehub-api
    ports:
      - "3005:3005"  # Port interne UNIQUEMENT
    environment:
      NODE_ENV: production
      PORT: 3005
      DATABASE_URL: postgresql://postgres:ChoosingAStrongPassword123@db:5432/invoicehub?schema=public
      REDIS_HOST: redis
      REDIS_PORT: 6379
      JWT_ACCESS_SECRET: your_jwt_access_secret_here
      JWT_REFRESH_SECRET: your_jwt_refresh_secret_here
      APP_URL: https://invoicehub.bridgetech-solutions
      API_URL: https://api.invoicehub.bridgetech-solutions
      CORS_ORIGINS: https://invoicehub.bridgetech-solutions,https://www.invoicehub.bridgetech-solutions
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy
    networks:
      - bridge-net  # Connecté au réseau du proxy
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost:3005/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  frontend:
    build:
      context: ./bridge-frontend
      dockerfile: docker/Dockerfile
    container_name: invoicehub-frontend
    ports:
      - "3001:3001"  # Port interne UNIQUEMENT
    environment:
      NEXT_PUBLIC_API_URL: https://api.invoicehub.bridgetech-solutions
      NEXT_PUBLIC_APP_URL: https://invoicehub.bridgetech-solutions
      NEXT_PUBLIC_ENV: production
    depends_on:
      - api
    networks:
      - bridge-net  # Connecté au réseau du proxy
    restart: unless-stopped

volumes:
  postgres_data:
  redis_data:
  ollama_data:

networks:
  bridge-net:
    external: true
```

### Étape 6B : Configurer les variables d'environnement

**Créer** `C:\BTS-Apps\invoicehub\bridge-backend\.env` :

```env
NODE_ENV=production
PORT=3005
FRONTEND_PORT=3001

# Domaines (Nginx gère HTTPS)
APP_URL=https://invoicehub.bridgetech-solutions
API_URL=https://api.invoicehub.bridgetech-solutions
CORS_ORIGINS=https://invoicehub.bridgetech-solutions,https://www.invoicehub.bridgetech-solutions

# Base de données
DATABASE_URL=postgresql://postgres:ChoosingAStrongPassword123@db:5432/invoicehub?schema=public
DB_HOST=db
DB_PORT=5432
DB_NAME=invoicehub
DB_USER=postgres
DB_PASSWORD=ChoosingAStrongPassword123

# Redis
REDIS_HOST=redis
REDIS_PORT=6379

# JWT (générer avec : node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
JWT_ACCESS_SECRET=REMPLACER_PAR_UNE_CHAINE_ALEATOIRE_LONGUE
JWT_REFRESH_SECRET=REMPLACER_PAR_UNE_AUTRE_CHAINE_ALEATOIRE

# Email (SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=noreply@bridgetech-solutions.cm

# IA (Ollama)
OLLAMA_ENABLED=false
OLLAMA_MODEL=mistral
OLLAMA_HOST=http://ollama:11434

# Sauvegardes
BACKUP_STORAGE_DISK=local
BACKUP_DIR=./uploads/backups
BACKUP_RETENTION_DAYS=30

# Logs
LOG_LEVEL=info
LOG_FORMAT=json
```

**Créer** `C:\BTS-Apps\invoicehub\bridge-frontend\.env.local` :

```env
NEXT_PUBLIC_API_URL=https://api.invoicehub.bridgetech-solutions
NEXT_PUBLIC_APP_URL=https://invoicehub.bridgetech-solutions
NEXT_PUBLIC_ENV=production
```

---

## 🚀 PHASE 7 : Déploiement et Démarrage

### Étape 7A : Construire les images Docker

**PowerShell** :

```powershell
# 1. Installer les dépendances backend
cd C:\BTS-Apps\invoicehub\bridge-backend
pnpm install
pnpm exec prisma generate
cd ..

# 2. Construire InvoiceHub
docker-compose build

# Vérifier les images
docker images | Select-String invoicehub
```

### Étape 7B : Démarrer InvoiceHub

**PowerShell** (C:\BTS-Apps\invoicehub) :

```powershell
# Démarrer les conteneurs
docker-compose up -d

# Vérifier l'état
docker-compose ps

# Voir les logs
docker-compose logs -f api
```

**Attendre que l'API soit prête** (voir "Server running on http://0.0.0.0:3005" dans les logs).

### Étape 7C : Démarrer le Reverse Proxy

**PowerShell** (C:\BTS-Apps\ReverseProxy) :

```powershell
# Construire l'image Nginx
docker-compose build

# Démarrer Nginx
docker-compose up -d

# Vérifier
docker ps | Select-String global-proxy
docker logs global-proxy
```

---

## 🌍 PHASE 8 : Tests d'Accès

### Étape 8A : Tester depuis le serveur local

**Navigateur ou PowerShell** :

```powershell
# Tester la résolution DNS
nslookup invoicehub.bridgetech-solutions

# Tester HTTPS (ignore le certificat auto-signé)
Invoke-WebRequest https://invoicehub.bridgetech-solutions -SkipCertificateCheck

# Tester l'API
Invoke-WebRequest https://api.invoicehub.bridgetech-solutions/api/health -SkipCertificateCheck
```

**Navigateur** :
```
https://invoicehub.bridgetech-solutions
```

Résultats attendus :
- ✅ Page de connexion s'affiche
- ✅ Premier accès : avertissement SSL (cliquer "Continuer malgré tout")
- ✅ Identifiants par défaut :
  - Email : `admin@bridgetech-solutions.cm`
  - Mot de passe : `Admin@123456`

### Étape 8B : Tester depuis un PC client du réseau

**Depuis un autre PC (si DNS Server configuré en Phase 2)** :

```powershell
# Tester la résolution DNS
nslookup invoicehub.bridgetech-solutions

# Résultat attendu :
# Server: dns-server
# Address: 192.168.1.10
# Name: invoicehub.bridgetech-solutions
# Address: 127.0.0.1
```

**Dans un navigateur** :
```
https://invoicehub.bridgetech-solutions
```

---

## 🔄 PHASE 9 : Démarrage Automatique

### Étape 9A : Configurer Docker Desktop

1. Docker Desktop → Settings → General
2. Cocher ✅ **"Start Docker Desktop when you sign in to your computer"**
3. Cliquer **Apply & Restart**

### Étape 9B : Créer un script d'auto-démarrage

**Créer** `C:\BTS-Apps\start-all-apps.ps1` :

```powershell
# Script de démarrage automatique

Write-Host "🚀 Démarrage des applications BTS..."
Start-Sleep -Seconds 30

# Démarrer Reverse Proxy
Write-Host "Démarrage du Reverse Proxy..."
Push-Location C:\BTS-Apps\ReverseProxy
docker-compose up -d
Pop-Location

Start-Sleep -Seconds 10

# Démarrer InvoiceHub
Write-Host "Démarrage d'InvoiceHub..."
Push-Location C:\BTS-Apps\invoicehub
docker-compose up -d
Pop-Location

Write-Host "✅ Toutes les applications sont démarrées"
```

### Étape 9C : Créer une tâche planifiée

**PowerShell (admin)** :

```powershell
$taskName = "Start-BTS-Apps"
$action = New-ScheduledTaskAction -Execute "powershell.exe" `
  -Argument "-NoProfile -WindowStyle Hidden -File C:\BTS-Apps\start-all-apps.ps1"
$trigger = New-ScheduledTaskTrigger -AtLogon
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -RunLevel Highest

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Force

Write-Host "✅ Tâche planifiée '$taskName' créée"
```

---

## 📊 PHASE 10 : Ajouter une Deuxième Application

### Étape 10A : Créer App 2

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
      NODE_ENV: production
      PORT: 4001
    networks:
      - bridge-net
    restart: unless-stopped

networks:
  bridge-net:
    external: true
```

### Étape 10B : Ajouter App 2 à Nginx

**Modifier** `C:\BTS-Apps\ReverseProxy\nginx.conf` — ajouter après les sections existantes :

```nginx
# Ajouter dans la section "upstream"
upstream app2_frontend {
    server app2:4001;
}

# Ajouter une nouvelle section "server"
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

### Étape 10C : Redémarrer Nginx

**PowerShell** :

```powershell
# Reconstruire et redémarrer
cd C:\BTS-Apps\ReverseProxy
docker-compose build
docker-compose restart
```

---

## 🛠️ PHASE 11 : Maintenance et Exploitation

### Commandes utiles

```powershell
# Voir tous les conteneurs
docker ps -a

# Voir les logs d'une app
docker-compose -f C:\BTS-Apps\invoicehub\docker-compose.yml logs -f api

# Redémarrer un service
docker-compose -f C:\BTS-Apps\invoicehub\docker-compose.yml restart api

# Redémarrer Nginx
docker-compose -f C:\BTS-Apps\ReverseProxy\docker-compose.yml restart

# Arrêter tous les services
docker-compose -f C:\BTS-Apps\invoicehub\docker-compose.yml down
docker-compose -f C:\BTS-Apps\ReverseProxy\docker-compose.yml down

# Backup DB
docker-compose -f C:\BTS-Apps\invoicehub\docker-compose.yml exec db pg_dump -U postgres invoicehub > C:\BTS-Apps\backups\backup_$(Get-Date -Format 'yyyyMMdd_HHmmss').sql

# Voir les statistiques
docker stats
```

---

## ⚠️ PHASE 12 : Dépannage

### "Impossible d'accéder à invoicehub.bridgetech-solutions"

```powershell
# Vérifier DNS
nslookup invoicehub.bridgetech-solutions

# Vérifier Nginx
docker logs global-proxy

# Redémarrer le DNS
ipconfig /flushdns

# Vérifier que Nginx écoute les ports
netstat -ano | Select-String ":443 " | Select-String LISTENING
```

### "Page blanche ou erreur de connexion"

```powershell
# Vérifier les conteneurs
docker ps

# Voir les logs d'InvoiceHub
docker-compose -f C:\BTS-Apps\invoicehub\docker-compose.yml logs api

# Redémarrer Nginx
docker-compose -f C:\BTS-Apps\ReverseProxy\docker-compose.yml restart
```

### "Certificat SSL non approuvé"

✅ C'est normal pour un certificat auto-signé. Cliquer **"Continuer malgré tout"** dans le navigateur.

Pour éviter l'avertissement :
```powershell
Import-Certificate -FilePath C:\BTS-Apps\ReverseProxy\certs\invoicehub.crt -CertStoreLocation Cert:\LocalMachine\Root
```

---

## 📋 Checklist Finale

- [ ] Windows Server 2019+ + Docker Desktop installé
- [ ] Virtualisation activée dans le BIOS
- [ ] Git, Node.js, pnpm, OpenSSL installés
- [ ] **DNS Server rôle Windows** installé et zona créée
- [ ] Enregistrements DNS ajoutés (invoicehub, api.invoicehub, app2, app3)
- [ ] PC clients configurés pour utiliser le DNS serveur
- [ ] Réseau Docker `bridge-net` créé
- [ ] Certificats SSL générés via `.\generate-certs.ps1`
- [ ] Nginx docker-compose créé et testé
- [ ] InvoiceHub docker-compose adapté + `.env` configuré
- [ ] InvoiceHub construit et démarré ✅
- [ ] Reverse Proxy démarré ✅
- [ ] Tests locaux réussis (https://invoicehub.bridgetech-solutions)
- [ ] Tests réseau réussis (depuis autres PCs)
- [ ] Auto-démarrage configuré
- [ ] Redémarrage du serveur testé

---

## 📝 Architecture Finale

```
┌─────────────────────────────────────────────────────────────────┐
│              Windows Server (192.168.1.10)                      │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │        Docker Desktop (WSL 2)                             │ │
│  │                                                           │ │
│  │  ┌─────────────────────────────────────────────────────┐ │ │
│  │  │  Reverse Proxy (C:\ReverseProxy)                    │ │ │
│  │  │                                                     │ │ │
│  │  │  Nginx Container (global-proxy)                    │ │ │
│  │  │  ├─ Port 80 → 443 (HTTPS redirect)                 │ │ │
│  │  │  ├─ Port 443 (SSL/TLS termination)                 │ │ │
│  │  │  └─ Certificates: invoicehub.crt + .key            │ │ │
│  │  └─────────────────────────────────────────────────────┘ │ │
│  │                    ↓ (via bridge-net)                    │ │
│  │  ┌─────────────────────────────────────────────────────┐ │ │
│  │  │  InvoiceHub (C:\BTS-Apps\invoicehub)               │ │ │
│  │  │                                                     │ │ │
│  │  │  ┌──────────┐ ┌─────────┐ ┌──────────────────┐    │ │ │
│  │  │  │Frontend  │ │   API   │ │   PostgreSQL     │    │ │ │
│  │  │  │Container │ │Container│ │   + Redis        │    │ │ │
│  │  │  │ 3001     │ │ 3005    │ │   + Ollama       │    │ │ │
│  │  │  └──────────┘ └─────────┘ └──────────────────┘    │ │ │
│  │  └─────────────────────────────────────────────────────┘ │ │
│  │                                                           │ │
│  │  ┌─────────────────────────────────────────────────────┐ │ │
│  │  │  App 2 (C:\BTS-Apps\app2)                          │ │ │
│  │  │  Container sur port 4001 (via bridge-net)          │ │ │
│  │  └─────────────────────────────────────────────────────┘ │ │
│  │                                                           │ │
│  │  Réseau : bridge-net (Docker bridge network)             │ │
│  │                                                           │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  DNS Configuration                                              │
│  ├─ invoicehub.bridgetech-solutions → 127.0.0.1               │
│  ├─ api.invoicehub.bridgetech-solutions → 127.0.0.1           │
│  └─ app2.bridgetech-solutions → 127.0.0.1                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                            ↓ Réseau LAN
          ┌──────────────────────────────────┐
          │  PC Clients (192.168.1.x)         │
          │                                  │
          │  DNS: 192.168.1.10                │
          │  Browser: https://invoicehub...   │
          │  → Résolution DNS                 │
          │  → Nginx reçoit (port 443)        │
          │  → Redirige vers Port 3001        │
          │  ✅ Page s'affiche                │
          │                                  │
          └──────────────────────────────────┘
```

**Points clés** :
1. **Zéro port applicatif exposé** — Seul Nginx écoute 80/443
2. **Réseau Docker isolé** — bridge-net pour communication sécurisée
3. **DNS centralisé** — Résolution de noms entièrement gérée par le serveur
4. **Multi-apps scalable** — Ajouter App2, App3 sans complexité
5. **Production ready** — SSL/TLS, health checks, restart policies

---

**🎉 Guide complet mis à jour !**
