@echo off
setlocal EnableDelayedExpansion

:: ============================================================================
::  InvoiceHub v2.0 - Script de deploiement
::  Bridge Technologies Solutions - Douala, Cameroun
:: ============================================================================

for /f %%a in ('echo prompt $E ^| cmd') do set "ESC=%%a"
set "RED="
set "GREEN="
set "YELLOW="
set "CYAN="
set "BOLD="
set "RESET="

set SKIP_TESTS=0
set NO_MIGRATE=0
for %%i in (%*) do (
  if "%%i"=="--skip-tests" set SKIP_TESTS=1
  if "%%i"=="--no-migrate" set NO_MIGRATE=1
)

set "ROOT=%~dp0"
set "ROOT=%ROOT:~0,-1%"
set "BACKEND=%ROOT%\bridge-backend"
set "FRONTEND=%ROOT%\bridge-frontend"

set "START_TIME=%TIME%"

echo.
echo %BOLD%%CYAN%============================================================%RESET%
echo %BOLD%%CYAN%  InvoiceHub v2.0 - Deploiement%RESET%
echo %BOLD%%CYAN%  Bridge Technologies Solutions%RESET%
echo %BOLD%%CYAN%============================================================%RESET%
echo  Debut : %START_TIME%
echo.

call :step "1" "Verification de l'environnement"
where docker >nul 2>&1 || (call :fail "Docker non installe" & exit /b 1)
where git >nul 2>&1 || (call :fail "Git non installe" & exit /b 1)
where pnpm >nul 2>&1 || (call :fail "pnpm non installe" & exit /b 1)
docker info >nul 2>&1 || (call :fail "Docker Desktop ne tourne pas" & exit /b 1)
if not exist "%BACKEND%\.env" (call :fail "Fichier .env manquant" & exit /b 1)
call :ok "Docker, Git, pnpm detectes - .env present"

call :step "2" "Recuperation du code (git pull)"
cd /d "%ROOT%"
git pull origin main || (call :fail "git pull a echoue" & exit /b 1)
call :ok "Code mis a jour"

call :step "3" "Installation des dependances"
cd /d "%BACKEND%"
call pnpm install --frozen-lockfile || (call :fail "pnpm install backend a echoue" & exit /b 1)
cd /d "%FRONTEND%"
call pnpm install --frozen-lockfile || (call :fail "pnpm install frontend a echoue" & exit /b 1)
call :ok "Dependances installees"

if "%SKIP_TESTS%"=="1" goto :docker_build

call :step "4" "Tests"
cd /d "%BACKEND%"
call pnpm exec tsc --noEmit || (call :fail "TypeScript Backend echec" & exit /b 1)
cd /d "%FRONTEND%"
call pnpm exec tsc --noEmit || (call :fail "TypeScript Frontend echec" & exit /b 1)
call :ok "Tests passes"

:docker_build
call :step "5" "Arret et construction Docker"
cd /d "%BACKEND%"
docker-compose down
docker-compose build --no-cache || (call :fail "docker-compose build echec" & exit /b 1)
docker-compose up -d || (call :fail "docker-compose up echec" & exit /b 1)
call :ok "Services demarres"

call :step "6" "Attente de l'API"
:wait_api
timeout /t 3 /nobreak >nul
docker-compose exec -T api node -e "require('http').get('http://localhost:3005/api/health', r => process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))" >nul 2>&1
if %errorlevel% neq 0 goto :wait_api
call :ok "API disponible"

if "%NO_MIGRATE%"=="1" goto :summary
call :step "7" "Migrations Prisma"
docker-compose exec -T api npx prisma migrate deploy || (call :fail "Migration echouee" & exit /b 1)
call :ok "Migrations appliquees"

call :step "8" "Verification Ollama (mistral)"
docker-compose exec -T ollama ollama list 2>nul | findstr /i /c:"mistral " /c:"mistral:latest" >nul
if %errorlevel% neq 0 (
  echo  Le modele Mistral n'est pas present.
  set /p CONFIRM_OLLAMA="Telecharger Mistral maintenant ? [O/N] : "
  if /i "!CONFIRM_OLLAMA!"=="O" (
    docker-compose exec -T ollama ollama pull mistral
    call :ok "Modele mistral telecharge"
  )
) else (
  call :ok "Modele mistral deja present"
)

:summary
echo %BOLD%%GREEN%Deploiement termine avec succes%RESET%
endlocal
exit /b 0

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
endlocal
exit /b 1
