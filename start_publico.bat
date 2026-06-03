@echo off
title VideoGrab — Acesso Publico
color 0A
echo.
echo  =====================================================
echo   VideoGrab - Acesso Publico via Cloudflare Tunnel
echo  =====================================================
echo.

:: Check Python
python --version >nul 2>&1
if errorlevel 1 (
    echo  [ERRO] Python nao encontrado!
    echo  Instale em: https://www.python.org/downloads/
    pause & exit /b 1
)
echo  [OK] Python encontrado.

:: Find cloudflared in known locations
set "CF_EXE="
where cloudflared >nul 2>&1
if not errorlevel 1 (
    set "CF_EXE=cloudflared"
    goto cf_found
)
if exist "C:\Program Files (x86)\cloudflared\cloudflared.exe" (
    set "CF_EXE=C:\Program Files (x86)\cloudflared\cloudflared.exe"
    goto cf_found
)
if exist "C:\Program Files\cloudflared\cloudflared.exe" (
    set "CF_EXE=C:\Program Files\cloudflared\cloudflared.exe"
    goto cf_found
)
for /d %%D in ("%LOCALAPPDATA%\Microsoft\WinGet\Packages\Cloudflare.cloudflared_*") do (
    if exist "%%D\cloudflared.exe" set "CF_EXE=%%D\cloudflared.exe"
)
if "%CF_EXE%"=="" (
    echo  [ERRO] cloudflared nao encontrado!
    echo  Instale com: winget install Cloudflare.cloudflared
    pause & exit /b 1
)

:cf_found
echo  [OK] cloudflared encontrado.

:: Install Python dependencies silently
echo  Verificando dependencias Python...
pip install -q -r requirements.txt >nul 2>&1
echo  [OK] Dependencias prontas.
echo.

:: Kill any old server on port 7878
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr :7878 ^| findstr LISTENING') do (
    taskkill /f /pid %%a >nul 2>&1
)
timeout /t 1 /nobreak >nul

:: Start Python server in public mode (binds to 0.0.0.0)
echo  Iniciando servidor VideoGrab...
start /B python app.py --public

:: Wait for server to be ready (retry loop)
echo  Aguardando servidor iniciar...
:waitloop
timeout /t 2 /nobreak >nul
python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:7878/api/status', timeout=3)" >nul 2>&1
if errorlevel 1 goto waitloop
echo  [OK] Servidor pronto!
echo.

echo  =====================================================
echo.
echo   Criando tunel seguro com Cloudflare...
echo.
echo   Aguarde alguns segundos e procure pela linha:
echo.
echo     +--------------------------------------------------+
echo     ^|  https://xxxx.trycloudflare.com  ^| ^<-- SEU LINK ^|
echo     +--------------------------------------------------+
echo.
echo   Compartilhe esse link com qualquer pessoa!
echo   Pressione Ctrl+C para encerrar o tunel.
echo.
echo  =====================================================
echo.

:: Start Cloudflare Quick Tunnel
"%CF_EXE%" tunnel --url http://localhost:7878 --no-autoupdate

echo.
echo  Tunel encerrado. Pressione qualquer tecla para fechar.
pause >nul
