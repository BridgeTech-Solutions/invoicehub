# Script de generation de certificats SSL pour Nginx (Version propre pour BTS Hub)

$ErrorActionPreference = "Stop"

# Creer le dossier 'certs' s'il n'existe pas
if (!(Test-Path "certs")) {
    New-Item -ItemType Directory -Path "certs" | Out-Null
}

# Generer Private Key
Write-Host "Generer la cle privee..."
openssl genrsa -out certs/bts-hub.key 2048

# Generer Certificate Request
Write-Host "Generer la requete de certificat..."
openssl req -new -key certs/bts-hub.key -out certs/bts-hub.csr -subj "/C=CM/ST=Littoral/L=Douala/O=Bridge Technologies/OU=IT/CN=bts-hub.bridgetech-solutions"

# Creer fichier d'extensions (SANs) - Inclut InvoiceHub et GAO Bridge
Write-Host "Configuration des domaines alternatifs (SAN)..."
@"
subjectAltName = DNS:invoicehub.bridgetech-solutions,DNS:api.invoicehub.bridgetech-solutions,DNS:www.invoicehub.bridgetech-solutions,DNS:gao.bridgetech-solutions,DNS:api.gao.bridgetech-solutions
"@ | Out-File -FilePath certs/openssl.ext -Encoding ascii

# Generer le certificat auto-signe (365 jours)
Write-Host "Generer le certificat final..."
openssl x509 -req -days 365 -in certs/bts-hub.csr -signkey certs/bts-hub.key -out certs/bts-hub.crt -extfile certs/openssl.ext

# Nettoyage
if (Test-Path "certs/bts-hub.csr") { Remove-Item certs/bts-hub.csr }
if (Test-Path "certs/openssl.ext") { Remove-Item certs/openssl.ext }

Write-Host "Succes: Certificats genere sous le nom 'bts-hub' !" -ForegroundColor Green
