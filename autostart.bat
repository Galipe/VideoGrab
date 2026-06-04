@echo off
title VideoGrab (servidor local)
:: Lancador enxuto para iniciar junto com o Windows.
:: Sobe direto o servidor (sem reinstalar dependencias a cada boot).
:: Para instalar/atualizar dependencias, use o start.bat normal.

cd /d "%~dp0"

:: Verifica Python
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERRO] Python nao encontrado no PATH.
    echo Rode o start.bat ao menos uma vez para configurar o ambiente.
    pause
    exit /b 1
)

:: Se a porta 7878 ja estiver em uso, o servidor provavelmente ja esta rodando
netstat -aon | findstr :7878 | findstr LISTENING >nul 2>&1
if not errorlevel 1 (
    echo VideoGrab ja parece estar rodando em http://localhost:7878
    timeout /t 3 /nobreak >nul
    exit /b 0
)

echo Iniciando VideoGrab em http://localhost:7878 ...
python app.py
