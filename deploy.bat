@echo off
setlocal EnableDelayedExpansion

:: ============================================================================
::  InvoiceHub v2.0 — Script de deploiement
::  Bridge Technologies Solutions — Douala, Cameroun
::
::  Usage : double-cliquer ou lancer depuis un terminal
::           deploy.bat [--skip-tests] [--no-migrate]
::
::  Options :
::    --skip-tests   Ignore les verifications TypeScript et les tests
::    --no-migrate   N'applique pas les migrations Prisma
:: ============================================================================

:: ── Couleurs (codes ANSI — disponibles sur Windows 10+) ────────────────────
for /f %%a in ('echo prompt $E ^| cmd') do set "ESC=%%a"
set "RED=%ESC%[91m"
set "GREEN=%ESC%[92m"
set "YELLOW=%ESC%[93m"
set "CYAN=%ESC%[96m"
set "BOLD=%ESC%[1m"
set "RESET=%ESC%[0m"

:: ── Options ────────────────────────────────────────────────────────────────
set SKIP_TESTS=0
set NO_MIGRATE=0
for %%i in (%*) do (
  if "%%i"=="--skip-tests" set SKIP_TESTS=1
  if "%%i"=="--no-migrate" set NO_MIGRATE=1
)

:: ── Racine du projet (dossier contenant ce script) ─────────────────────────
set "ROOT=%~dp0"
set "ROOT=%ROOT:~0,-1%"
set "BACKEND=%ROOT%\bridge-backend"
set "FRONTEND=%ROOT%\bridge-frontend"

:: ── Horodatage de debut ─────────────────────────────────────────────────────
set "START_TIME=%TIME%"

echo.
echo %BOLD%%CYAN%============================================================%RESET%
echo %BOLD%%CYAN%  InvoiceHub v2.0 — Deploiement%RESET%
echo %BOLD%%CYAN%  Bridge Technologies Solutions%RESET%
echo %BOLD%%CYAN%============================================================%RESET%
echo  Debut : %START_TIME%
echo.

:: ============================================================================
:: ETAPE 1 — Verifications prealables
:: ============================================================================
call :step "1" "Verification de l'environnement"

where docker >nul 2>&1
if %errorlevel% neq 0 (
  call :fail "Docker n'est pas installe ou n'est pas dans le PATH"
  exit /b 1
)

where git >nul 2>&1
if %errorlevel% neq 0 (
  call :fail "Git n'est pas installe ou n'est pas dans le PATH"
  exit /b 1
)

where pnpm >nul 2>&1
if %errorlevel% neq 0 (
  call :fail "pnpm n'est pas installe. Installer avec : npm install -g pnpm"
  exit /b 1
)

docker info >nul 2>&1
if %errorlevel% neq 0 (
  call :fail "Docker Desktop ne tourne pas. Demarrer Docker Desktop et reessayer."
  exit /b 1
)

if not exist "%BACKEND%\.env" (
  call :fail "Fichier .env manquant dans bridge-backend. Copier .env.example et renseigner les valeurs."
  exit /b 1
)

call :ok "Docker, Git, pnpm detectes — .env present"

:: ============================================================================
:: ETAPE 2 — Recuperation du code
:: ============================================================================
call :step "2" "Recuperation du code (git pull)"

cd /d "%ROOT%"
git pull origin main
if %errorlevel% neq 0 (
  call :fail "git pull a echoue. Verifier la connexion ou les conflits."
  exit /b 1
)
call :ok "Code mis a jour"

:: ============================================================================
:: ETAPE 3 — Installation des dependances
:: ============================================================================
call :step "3" "Installation des dependances"

cd /d "%BACKEND%"
call pnpm install --frozen-lockfile
if %errorlevel% neq 0 (
  call :fail "pnpm install a echoue (backend)"
  exit /b 1
)

cd /d "%FRONTEND%"
call pnpm install --frozen-lockfile
if %errorlevel% neq 0 (
  call :fail "pnpm install a echoue (frontend)"
  exit /b 1
)

call :ok "Dependances installees"

:: ============================================================================
:: ETAPE 4 — Verifications qualite (TypeScript + lint)
:: ============================================================================
if "%SKIP_TESTS%"=="1" (
  echo %YELLOW%  [IGNORE] Verifications ignorees (--skip-tests)%RESET%
  goto :docker_build
)

call :step "4" "Verification TypeScript — Backend"

cd /d "%BACKEND%"
call pnpm exec tsc --noEmit
if %errorlevel% neq 0 (
  call :fail "Erreurs TypeScript dans le backend — deploiement annule"
  exit /b 1
)
call :ok "Backend TypeScript OK"

call :step "4" "Verification TypeScript — Frontend"

cd /d "%FRONTEND%"
call pnpm exec tsc --noEmit
if %errorlevel% neq 0 (
  call :fail "Erreurs TypeScript dans le frontend — deploiement annule"
  exit /b 1
)
call :ok "Frontend TypeScript OK"

call :step "4" "Lint"

cd /d "%BACKEND%"
call pnpm lint 2>nul
if %errorlevel% neq 0 (
  echo %YELLOW%  [AVERT] Avertissements lint backend — deploiement continue%RESET%
)

cd /d "%FRONTEND%"
call pnpm lint 2>nul
if %errorlevel% neq 0 (
  echo %YELLOW%  [AVERT] Avertissements lint frontend — deploiement continue%RESET%
)

call :step "4" "Tests automatiques"

cd /d "%BACKEND%"
call pnpm test --passWithNoTests 2>nul
if %errorlevel% neq 0 (
  call :fail "Tests backend en echec — deploiement annule"
  exit /b 1
)
call :ok "Tests passes"

:: ============================================================================
:: ETAPE 5 — Build et demarrage Docker
:: ============================================================================
:docker_build
call :step "5" "Arret des conteneurs existants"

cd /d "%BACKEND%"
docker-compose down
if %errorlevel% neq 0 (
  call :fail "Impossible d'arreter les conteneurs"
  exit /b 1
)
call :ok "Conteneurs arretes"

call :step "5" "Construction des images Docker"

docker-compose build --no-cache
if %errorlevel% neq 0 (
  call :fail "docker-compose build a echoue"
  exit /b 1
)
call :ok "Images construites"

call :step "5" "Demarrage des services"

docker-compose up -d
if %errorlevel% neq 0 (
  call :fail "docker-compose up a echoue"
  exit /b 1
)
call :ok "Services demarres"

:: ============================================================================
:: ETAPE 6 — Attente disponibilite de l'API
:: ============================================================================
call :step "6" "Attente de disponibilite de l'API"

set RETRIES=0
:wait_api
set /a RETRIES+=1
if %RETRIES% gtr 30 (
  call :fail "L'API ne repond pas apres 30 tentatives. Verifier avec : docker-compose logs api"
  exit /b 1
)
timeout /t 2 /nobreak >nul
docker-compose exec -T api node -e "require('http').get('http://localhost:3005/api/health', r => process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))" >nul 2>&1
if %errorlevel% neq 0 goto :wait_api
call :ok "API disponible (tentative %RETRIES%)"

:: ============================================================================
:: ETAPE 7 — Migrations Prisma
:: ============================================================================
if "%NO_MIGRATE%"=="1" (
  echo %YELLOW%  [IGNORE] Migrations ignorees (--no-migrate)%RESET%
  goto :summary
)

call :step "7" "Migrations de base de donnees (Prisma)"

docker-compose exec -T api npx prisma migrate deploy
if %errorlevel% neq 0 (
  call :fail "Migration Prisma echouee. L'app tourne mais la DB n'est pas a jour."
  exit /b 1
)
call :ok "Migrations appliquees"

:: ============================================================================
:: ETAPE 8 — Modele Ollama (telechargement si absent)
:: ============================================================================
call :step "8" "Verification du modele Ollama (mistral)"

docker-compose exec -T ollama ollama list 2>nul | findstr /i "mistral" >nul
if %errorlevel% neq 0 (
  echo.
  echo %YELLOW%  Le modele Mistral (~4 Go) n'est pas encore telecharge.%RESET%
  echo %YELLOW%  Ce telechargement est necessaire pour que l'assistant BTS fonctionne.%RESET%
  echo.
  set /p CONFIRM_OLLAMA="  Telecharger maintenant ? [O/N] : "
  if /i "!CONFIRM_OLLAMA!"=="O" (
    echo.
    echo  Telechargement en cours — cela peut prendre plusieurs minutes...
    docker-compose exec -T ollama ollama pull mistral
    if %errorlevel% neq 0 (
      echo %YELLOW%  [AVERT] Telechargement echoue — l'assistant BTS ne fonctionnera pas%RESET%
      echo %YELLOW%          Relancer deploy.bat plus tard pour reessayer.%RESET%
    ) else (
      call :ok "Modele mistral telecharge"
    )
  ) else (
    echo %YELLOW%  [IGNORE] Telechargement reporte — l'assistant BTS ne fonctionnera pas jusqu'au prochain deploiement.%RESET%
  )
) else (
  call :ok "Modele mistral deja present"
)

:: ============================================================================
:: RESUME FINAL
:: ============================================================================
:summary
echo.
echo %BOLD%%GREEN%============================================================%RESET%
echo %BOLD%%GREEN%  Deploiement termine avec succes%RESET%
echo %BOLD%%GREEN%============================================================%RESET%
echo.

:: Recuperer l'IP locale
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /C:"IPv4"') do (
  set "LOCAL_IP=%%a"
  set "LOCAL_IP=!LOCAL_IP: =!"
  goto :show_ip
)
:show_ip

echo  %BOLD%Application accessible sur :%RESET%
echo    Frontend  : %CYAN%http://!LOCAL_IP!:3001%RESET%
echo    API       : %CYAN%http://!LOCAL_IP!:3005/api%RESET%
echo.
echo  Debut  : %START_TIME%
echo  Fin    : %TIME%
echo.
echo  Commandes utiles :
echo    Logs en direct    : docker-compose -f "%BACKEND%\docker-compose.yml" logs -f
echo    Etat des services : docker-compose -f "%BACKEND%\docker-compose.yml" ps
echo    Arreter l'app     : docker-compose -f "%BACKEND%\docker-compose.yml" down
echo.

endlocal
exit /b 0

:: ============================================================================
:: Fonctions utilitaires
:: ============================================================================
:step
echo.
echo %BOLD%%CYAN%[ETAPE %~1]%RESET% %~2
exit /b 0

:ok
echo %GREEN%  [OK]%RESET% %~1
exit /b 0

:fail
echo.
echo %BOLD%%RED%  [ERREUR] %~1%RESET%
echo.
echo  Pour diagnostiquer :
echo    docker-compose -f "%BACKEND%\docker-compose.yml" logs
echo.
endlocal
exit /b 0
