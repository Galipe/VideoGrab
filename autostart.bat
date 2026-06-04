@echo off
title VideoGrab (servidor local)
:: Lancador enxuto para iniciar junto com o Windows (modo oculto via start_hidden.vbs).
:: Sobe direto o servidor (sem reinstalar dependencias a cada boot).
:: Para instalar/atualizar dependencias, use o start.bat normal.

cd /d "%~dp0"

:: Se a porta 7878 ja estiver em uso, o servidor provavelmente ja esta rodando
netstat -aon | findstr :7878 | findstr LISTENING >nul 2>&1
if not errorlevel 1 exit /b 0

:: Descobre o pythonw real (resolve o caminho do python e troca para pythonw.exe).
:: Evita depender do alias da Windows Store, que pode falhar em modo oculto.
set "PYW="
for /f "delims=" %%P in ('where pythonw 2^>nul') do if not defined PYW set "PYW=%%P"
if not defined PYW (
    for /f "delims=" %%P in ('where python 2^>nul') do (
        if not defined PYW (
            set "PYDIR=%%~dpP"
            if exist "%%~dpPpythonw.exe" set "PYW=%%~dpPpythonw.exe"
        )
    )
)
if not defined PYW set "PYW=pythonw"

:: pythonw = sem console (modo oculto). --no-browser para nao abrir aba a cada boot.
start "" "%PYW%" app.py --no-browser
