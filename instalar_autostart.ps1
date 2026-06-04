# VideoGrab - cria o atalho de inicializacao automatica (portatil).
# Coloca um atalho na pasta Inicializar do Windows que sobe o servidor
# TOTALMENTE OCULTO (via start_hidden.vbs) toda vez que o PC liga.
$ErrorActionPreference = 'Stop'

$here    = $PSScriptRoot
$vbs     = Join-Path $here 'start_hidden.vbs'
$startup = [Environment]::GetFolderPath('Startup')
$lnk     = Join-Path $startup 'VideoGrab.lnk'

if (-not (Test-Path $vbs)) {
    Write-Host "        [ERRO] start_hidden.vbs nao encontrado em $here" -ForegroundColor Red
    exit 1
}

$ws = New-Object -ComObject WScript.Shell
$sc = $ws.CreateShortcut($lnk)
$sc.TargetPath       = Join-Path $env:WINDIR 'System32\wscript.exe'
$sc.Arguments        = '"' + $vbs + '"'
$sc.WorkingDirectory = $here
$sc.WindowStyle      = 7          # minimizado/oculto
$sc.Description       = 'VideoGrab - servidor local (oculto)'
$sc.Save()

Write-Host "        [OK] Inicializacao automatica configurada." -ForegroundColor Green
Write-Host "             Atalho: $lnk"
