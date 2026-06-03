@echo off
title VideoGrab
color 0A
echo.
echo  ============================================
echo   VideoGrab - Baixador de Videos
echo  ============================================
echo.

:: Check Python
python --version >nul 2>&1
if errorlevel 1 (
    echo  [ERRO] Python nao encontrado!
    echo  Instale o Python em: https://www.python.org/downloads/
    echo  Marque a opcao "Add Python to PATH" durante a instalacao.
    pause
    exit /b 1
)

echo  [OK] Python encontrado.

:: Install/upgrade dependencies
echo  Instalando dependencias (pode demorar na primeira vez)...
pip install -q -r requirements.txt --upgrade
if errorlevel 1 (
    echo  [AVISO] Alguns pacotes podem nao ter instalado corretamente.
)

echo  [OK] Dependencias prontas.
echo.
echo  ============================================
echo   Iniciando servidor em http://localhost:7878
echo   Pressione Ctrl+C para encerrar o programa
echo  ============================================
echo.

python app.py

pause
