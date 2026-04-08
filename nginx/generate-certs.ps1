# Script PowerShell : Générer les certificats SSL pour Nginx
# Bridge Technologies Solutions - 2026

Write-Host "🔐 Génération des certificats SSL pour InvoiceHub..." -ForegroundColor Green

# Se placer dans le dossier certs
Set-Location $PSScriptRoot\certs

# Vérifier OpenSSL
try {
    $opensslVersion = openssl version 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ OpenSSL n'est pas installé ou accessible" -ForegroundColor Red
        exit 1
    }
    Write-Host "✅ OpenSSL détecté : $opensslVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ OpenSSL n'est pas installé. Installez-le avec : winget install OpenSSL.Light" -ForegroundColor Red
    exit 1
}

# Générer la clé privée
Write-Host "🔑 Génération de la clé privée (2048 bits)..." -ForegroundColor Yellow
openssl genrsa -out invoicehub.key 2048

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Clé privée générée : invoicehub.key" -ForegroundColor Green
} else {
    Write-Host "❌ Erreur lors de la génération de la clé privée" -ForegroundColor Red
    exit 1
}

# Générer le certificat auto-signé
Write-Host "📜 Génération du certificat auto-signé (365 jours)..." -ForegroundColor Yellow
openssl req -new -x509 -key invoicehub.key -out invoicehub.crt -days 365 -subj "/C=CM/ST=Littoral/L=Douala/O=Bridge Technologies Solutions/OU=IT/CN=invoicehub.bridgetech-solutions"

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Certificat généré : invoicehub.crt" -ForegroundColor Green
} else {
    Write-Host "❌ Erreur lors de la génération du certificat" -ForegroundColor Red
    exit 1
}

# Vérifier les certificats
Write-Host "🔍 Vérification des certificats..." -ForegroundColor Yellow
openssl x509 -in invoicehub.crt -text -noout | Select-String "Subject:|DNS:" | ForEach-Object {
    Write-Host "   $_" -ForegroundColor Cyan
}

# Importer dans le magasin de certificats Windows (optionnel)
Write-Host "📥 Importation du certificat dans Windows (Trusted Root)..." -ForegroundColor Yellow
try {
    Import-Certificate -FilePath ".\invoicehub.crt" -CertStoreLocation Cert:\LocalMachine\Root -ErrorAction Stop
    Write-Host "✅ Certificat importé dans le magasin Windows" -ForegroundColor Green
} catch {
    Write-Host "⚠️  Impossible d'importer le certificat (droits admin requis)" -ForegroundColor Yellow
}

# Résumé
Write-Host "`n🎉 Certificats SSL générés avec succès !" -ForegroundColor Green
Write-Host "📁 Fichiers créés dans : $PSScriptRoot\certs\" -ForegroundColor White
Write-Host "   - invoicehub.key (clé privée - confidentielle)" -ForegroundColor White
Write-Host "   - invoicehub.crt (certificat public)" -ForegroundColor White
Write-Host "`n🚀 Vous pouvez maintenant construire l'image Nginx :" -ForegroundColor Green
Write-Host "   docker build -t nginx-proxy ./nginx" -ForegroundColor White

Write-Host "`n💡 Prochaines étapes :" -ForegroundColor Cyan
Write-Host "   1. Démarrer InvoiceHub : docker-compose up -d" -ForegroundColor White
Write-Host "   2. Démarrer Nginx : docker run -d --name nginx-proxy --network host -p 80:80 -p 443:443 nginx-proxy" -ForegroundColor White
Write-Host "   3. Tester : https://invoicehub.bridgetech-solutions" -ForegroundColor White