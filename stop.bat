@echo off
title VideoGrab - parar servidor
:: Para o servidor local oculto (encerra quem estiver ouvindo na porta 7878).

set "FOUND="
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :7878 ^| findstr LISTENING') do (
    taskkill /f /pid %%a >nul 2>&1
    set "FOUND=1"
)
if defined FOUND (
    echo VideoGrab encerrado.
) else (
    echo VideoGrab nao estava rodando.
)
timeout /t 2 /nobreak >nul
