# VideoGrab - remove o atalho de inicializacao automatica.
$ErrorActionPreference = 'Stop'

$startup = [Environment]::GetFolderPath('Startup')
$lnk     = Join-Path $startup 'VideoGrab.lnk'

if (Test-Path $lnk) {
    Remove-Item $lnk -Force
    Write-Host "[OK] Inicializacao automatica removida." -ForegroundColor Green
} else {
    Write-Host "Nao havia inicializacao automatica configurada."
}
