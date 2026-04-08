# Script de generation de certificats SSL pour Nginx (Version propre)

Write-Host "Generer les certificats SSL..." -ForegroundColor Cyan

# Creer le dossier s'il n'existe pas
if (!(Test-Path "certs")) {
    New-Item -ItemType Directory -Path "certs"
}

# Generer Private Key
Write-Host "Generer la cle privee..."
openssl genrsa -out certs/invoicehub.key 2048

# Generer Certificate Request
Write-Host "Generer la requete de certificat..."
openssl req -new -key certs/invoicehub.key -out certs/invoicehub.csr -subj "/C=CM/ST=Littoral/L=Douala/O=Bridge Technologies/OU=IT/CN=invoicehub.bridgetech-solutions"

# Creer fichier d'extensions (SANs)
@"
subjectAltName = DNS:invoicehub.bridgetech-solutions,DNS:api.invoicehub.bridgetech-solutions,DNS:www.invoicehub.bridgetech-solutions,DNS:app2.bridgetech-solutions,DNS:app3.bridgetech-solutions
"@ | Out-File -FilePath certs/openssl.ext -Encoding ascii

# Generer le certificat auto-signe (365 jours)
Write-Host "Generer le certificat auto-signe (365 jours)..."
openssl x509 -req -days 365 -in certs/invoicehub.csr -signkey certs/invoicehub.key -out certs/invoicehub.crt -extfile certs/openssl.ext

# Nettoyage
Remove-Item certs/invoicehub.csr
Remove-Item certs/openssl.ext

Write-Host "Certificats generes avec succes dans le dossier 'certs' !" -ForegroundColor Green
