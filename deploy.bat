@echo off
setlocal EnableDelayedExpansion

:: ============================================================================
::  InvoiceHub v2.0 - Script de deploiement
::  Bridge Technologies Solutions - Douala, Cameroun
:: ============================================================================

set SKIP_TESTS=0
set WITH_OLLAMA=0
for %%i in (%*) do (
  if "%%i"=="--skip-tests" set SKIP_TESTS=1
  if "%%i"=="--with-ollama" set WITH_OLLAMA=1
)

set "ROOT=%~dp0"
set "ROOT=%ROOT:~0,-1%"
set "APIDIR=%ROOT%\invoicehub-api"
set "FRONTEND=%ROOT%\bridge-frontend"

set "START_TIME=%TIME%"

echo.
echo ============================================================
echo   InvoiceHub v2.0 - Deploiement
echo   Bridge Technologies Solutions
echo ============================================================
echo  Debut : %START_TIME%
echo.

call :step "1" "Verification de l'environnement"
where docker >nul 2>&1 || (call :fail "Docker non installe" & exit /b 1)
where git >nul 2>&1    || (call :fail "Git non installe" & exit /b 1)
where pnpm >nul 2>&1   || (call :fail "pnpm non installe" & exit /b 1)
docker info >nul 2>&1  || (call :fail "Docker Desktop ne tourne pas" & exit /b 1)
if not exist "%ROOT%\.env" (call :fail "Fichier .env manquant a la racine du projet" & exit /b 1)
call :ok "Docker, Git, pnpm detectes - .env present"

call :step "2" "Recuperation du code (git pull)"
cd /d "%ROOT%"
git pull origin main || (call :fail "git pull a echoue" & exit /b 1)
call :ok "Code mis a jour"

call :step "3" "Installation des dependances"
cd /d "%APIDIR%"
call pnpm install --frozen-lockfile              || (call :fail "pnpm install API echoue" & exit /b 1)
call pnpm exec prisma generate                   || (call :fail "prisma generate echoue" & exit /b 1)
cd /d "%FRONTEND%"
call pnpm install --frozen-lockfile              || (call :fail "pnpm install Frontend echoue" & exit /b 1)
call :ok "Dependances installees"

if "%SKIP_TESTS%"=="1" goto :docker_build

call :step "4" "Verification TypeScript"
cd /d "%APIDIR%"
call pnpm exec tsc --noEmit || (call :fail "TypeScript API echec" & exit /b 1)
cd /d "%FRONTEND%"
call pnpm exec tsc --noEmit || (call :fail "TypeScript Frontend echec" & exit /b 1)
call :ok "TypeScript OK"

:docker_build
call :step "5" "Arret et construction Docker"

if "%WITH_OLLAMA%"=="0" (
  echo.
  set /p CONFIRM_OLLAMA="  Inclure Ollama (IA locale, ~3.7 GiB a telecharger) ? [O/N] : "
  if /i "!CONFIRM_OLLAMA!"=="O" set WITH_OLLAMA=1
)

cd /d "%ROOT%"
docker compose down

if "%WITH_OLLAMA%"=="1" (
  docker compose --profile ai build --no-cache || (call :fail "docker compose build echec" & exit /b 1)
  docker compose --profile ai up -d            || (call :fail "docker compose up echec" & exit /b 1)
) else (
  docker compose build --no-cache || (call :fail "docker compose build echec" & exit /b 1)
  docker compose up -d            || (call :fail "docker compose up echec" & exit /b 1)
)
call :ok "Services demarres"

call :step "6" "Attente de l'API"
:wait_api
timeout /t 3 /nobreak >nul
docker compose exec -T api node -e "require('http').get('http://localhost:3005/api/health', r => process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))" >nul 2>&1
if %errorlevel% neq 0 goto :wait_api
call :ok "API disponible"

call :step "7" "Verification Ollama (phi3:mini)"
if "%WITH_OLLAMA%"=="0" (
  echo  Ollama non active - etape ignoree.
  goto :nginx
)
docker compose --profile ai exec ollama ollama list 2>nul | findstr /i /c:"phi3:mini" >nul
if %errorlevel% neq 0 (
  echo  Le modele phi3:mini n'est pas present.
  set /p CONFIRM_MODEL="Telecharger phi3:mini maintenant ? (~2.3 GiB) [O/N] : "
  if /i "!CONFIRM_MODEL!"=="O" (
    docker compose --profile ai exec ollama ollama pull phi3:mini
    call :ok "Modele phi3:mini telecharge"
  ) else (
    echo  Telechargement ignore.
  )
) else (
  call :ok "Modele phi3:mini deja present"
)

:nginx
call :step "8" "Demarrage Nginx"
cd /d "%ROOT%\nginx"
docker compose up -d || (call :fail "Nginx echec" & exit /b 1)
call :ok "Nginx demarre"

:summary
echo.
echo ============================================================
echo  Deploiement termine avec succes
echo  Debut  : %START_TIME%
echo  Fin    : %TIME%
echo ============================================================
endlocal
exit /b 0

:step
echo.
echo [ETAPE %~1] %~2
exit /b 0

:ok
echo   [OK] %~1
exit /b 0

:fail
echo.
echo   [ERREUR] %~1
endlocal
exit /b 1
