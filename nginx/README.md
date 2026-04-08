# Nginx Reverse Proxy — Bridge Technologies Solutions

Ce dossier contient la configuration complète du Reverse Proxy Nginx pour le déploiement multi-applications sur Windows Server.

## 📁 Structure

```
nginx/
├── Dockerfile          # Image Docker Nginx personnalisée
├── nginx.conf          # Configuration Nginx complète
├── certs/              # Certificats SSL (à générer)
│   ├── invoicehub.crt  # Certificat public
│   └── invoicehub.key  # Clé privée
└── README.md           # Ce fichier
```

## 🚀 Utilisation

### 1. Générer les certificats SSL

```powershell
# Se placer dans le dossier certs
cd nginx\certs

# Générer la clé privée
openssl genrsa -out invoicehub.key 2048

# Générer le certificat auto-signé
openssl req -new -x509 -key invoicehub.key -out invoicehub.crt -days 365 -subj "/C=CM/ST=Littoral/L=Douala/O=Bridge Technologies Solutions/OU=IT/CN=invoicehub.bridgetech-solutions"
```

### 2. Construire l'image Docker

```powershell
# Depuis la racine du projet
docker build -t nginx-proxy ./nginx
```

### 3. Démarrer le Reverse Proxy

```powershell
# Démarrer Nginx avec réseau host (accès aux ports 80/443)
docker run -d --name nginx-proxy --network host -p 80:80 -p 443:443 --restart unless-stopped nginx-proxy
```

## 🌐 Domaines gérés

Le Reverse Proxy gère les domaines suivants :

| Domaine | Destination | Port interne |
|---------|-------------|--------------|
| `invoicehub.bridgetech-solutions` | Frontend Next.js | 3001 |
| `api.invoicehub.bridgetech-solutions` | Backend Express | 3000 |
| `app2.bridgetech-solutions` | Application 2 | 4001 |
| `app3.bridgetech-solutions` | Application 3 | 5001 |

## 🔒 Sécurité SSL/TLS

- **Auto-signé** : Certificats générés localement (suffisant pour réseau interne)
- **HTTPS obligatoire** : Redirection automatique HTTP → HTTPS
- **TLS 1.2/1.3** : Protocoles sécurisés uniquement
- **Chiffrement fort** : Ciphers HIGH uniquement

## 🛠️ Maintenance

### Redémarrer Nginx après modification

```powershell
# Après modification de nginx.conf
docker build -t nginx-proxy ./nginx
docker stop nginx-proxy
docker rm nginx-proxy
docker run -d --name nginx-proxy --network host -p 80:80 -p 443:443 --restart unless-stopped nginx-proxy
```

### Voir les logs

```powershell
docker logs -f nginx-proxy
```

### Vérifier la configuration

```powershell
# Tester la syntaxe
docker run --rm -v ${PWD}/nginx/nginx.conf:/etc/nginx/nginx.conf nginx nginx -t
```

## ⚠️ Points importants

1. **Ports 80/443** : Doivent être libres sur le serveur Windows
2. **Certificats** : Placer `invoicehub.crt` et `invoicehub.key` dans le dossier `certs/`
3. **Réseau host** : Utilise `--network host` pour accéder aux conteneurs locaux
4. **Auto-restart** : `--restart unless-stopped` pour redémarrage automatique

## 🔧 Dépannage

### "Port already in use"

```powershell
# Voir quel processus utilise le port
netstat -ano | findstr :80
netstat -ano | findstr :443

# Tuer le processus (remplacer PID)
taskkill /PID <PID> /F
```

### "SSL certificate error"

- Vérifier que les fichiers `.crt` et `.key` sont dans `nginx/certs/`
- Vérifier les permissions des fichiers
- Importer le certificat dans Windows si nécessaire :
  ```powershell
  Import-Certificate -FilePath nginx\certs\invoicehub.crt -CertStoreLocation Cert:\LocalMachine\Root
  ```

### "Connection refused"

- Vérifier que les applications (InvoiceHub) sont démarrées
- Vérifier que les ports internes (3000, 3001) sont accessibles :
  ```powershell
  curl http://localhost:3000/api/health
  curl http://localhost:3001
  ```

---

**Bridge Technologies Solutions — 2026**