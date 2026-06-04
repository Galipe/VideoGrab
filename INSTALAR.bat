@echo off
title VideoGrab - Instalador automatico
color 0A
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo.
echo  ============================================================
echo    VideoGrab - Instalador automatico
echo  ============================================================
echo.
echo   Este instalador prepara tudo para voce:
echo     - Python        (se ainda nao tiver)
echo     - FFmpeg        (necessario p/ resolucoes altas: 1080p/4K)
echo     - Dependencias do projeto
echo     - Inicializacao automatica com o Windows (opcional)
echo.
echo  ------------------------------------------------------------
echo.

:: ===========================================================
:: [1/4] PYTHON
:: ===========================================================
echo  [1/4] Verificando Python...
python --version >nul 2>&1
if not errorlevel 1 (
    echo        [OK] Python ja instalado.
    goto python_ok
)

echo        Python nao encontrado. Tentando instalar via winget...
where winget >nul 2>&1
if errorlevel 1 (
    echo.
    echo        [!] O winget nao esta disponivel neste PC.
    echo            Instale o Python manualmente em:
    echo            https://www.python.org/downloads/
    echo            ^(marque "Add Python to PATH" durante a instalacao^)
    echo.
    pause
    exit /b 1
)
winget install -e --id Python.Python.3.12 --accept-source-agreements --accept-package-agreements
echo.
echo  ------------------------------------------------------------
echo   [!] Python foi instalado. FECHE esta janela e rode o
echo       INSTALAR.bat NOVAMENTE para que ele seja reconhecido.
echo  ------------------------------------------------------------
pause
exit /b 0

:python_ok
echo.

:: ===========================================================
:: [2/4] FFMPEG
:: ===========================================================
echo  [2/4] Verificando FFmpeg...
set "FF_OK="
where ffmpeg >nul 2>&1
if not errorlevel 1 set "FF_OK=1"
if not defined FF_OK (
    for /d %%D in ("%LOCALAPPDATA%\Microsoft\WinGet\Packages\Gyan.FFmpeg_*") do set "FF_OK=1"
)
if defined FF_OK (
    echo        [OK] FFmpeg ja instalado.
    goto ffmpeg_ok
)

echo        FFmpeg nao encontrado. Tentando instalar via winget...
where winget >nul 2>&1
if errorlevel 1 (
    echo        [!] winget indisponivel. Instale o FFmpeg manualmente:
    echo            https://www.gyan.dev/ffmpeg/builds/  ^(ou: winget install Gyan.FFmpeg^)
    echo        O programa funciona sem ele, mas so baixa ate ~720p.
) else (
    winget install -e --id Gyan.FFmpeg --accept-source-agreements --accept-package-agreements
    echo        [OK] FFmpeg instalado.
)

:ffmpeg_ok
echo.

:: ===========================================================
:: [3/4] DEPENDENCIAS PYTHON
:: ===========================================================
echo  [3/4] Instalando dependencias do projeto ^(pode demorar na 1a vez^)...
python -m pip install -q --upgrade pip >nul 2>&1
python -m pip install -q -r requirements.txt --upgrade
if errorlevel 1 (
    echo        [AVISO] Algum pacote pode nao ter instalado. Tente rodar de novo.
) else (
    echo        [OK] Dependencias prontas.
)
echo.

:: ===========================================================
:: [4/4] INICIALIZACAO AUTOMATICA (opcional)
:: ===========================================================
echo  [4/4] Inicializacao automatica com o Windows
echo.
set "RESP="
set /p "RESP=        Iniciar o VideoGrab sozinho ao ligar o PC (oculto)? (S/N): "
if /i "!RESP!"=="S" (
    powershell -ExecutionPolicy Bypass -NoProfile -File "%~dp0instalar_autostart.ps1"
) else (
    echo        Ok, inicializacao automatica NAO configurada.
    echo        Voce pode rodar o start.bat manualmente quando quiser.
)
echo.

:: ===========================================================
:: INICIAR O SERVIDOR AGORA (oculto) + ABRIR EXTENSOES
:: ===========================================================
echo  ------------------------------------------------------------
echo   Iniciando o servidor agora (modo oculto)...
start "" wscript.exe "%~dp0start_hidden.vbs"

echo   Abrindo a pasta da extensao e a pagina de extensoes do Chrome...
start "" "%~dp0extension"
start "" chrome.exe "chrome://extensions"
echo  ------------------------------------------------------------
echo.
echo  ============================================================
echo    QUASE LA! Ultimo passo (manual, so 1 vez):
echo  ============================================================
echo.
echo    Na aba "chrome://extensions" que abriu:
echo      1. Ative o "Modo do desenvolvedor" (canto superior direito).
echo      2. Clique em "Carregar sem compactacao".
echo      3. Selecione a pasta "extension" (a que abriu no Explorer).
echo.
echo    Pronto! Clique no icone do VideoGrab num video e baixe.
echo.
echo  ============================================================
pause
