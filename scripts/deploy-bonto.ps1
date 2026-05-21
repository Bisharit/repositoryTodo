# Сборка и push на Bonto (нужны логин/пароль Bonto при первом push)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $root

npm run build

$bontoUrl = "https://api.bonto.dev/git/skmytodo.git"
if (-not (git remote | Select-String -Pattern "^bonto$")) {
  git remote add bonto $bontoUrl
}

Write-Host "Pushing to Bonto (branch master)..."
git push bonto main:master

Write-Host "Done. Open https://skmytodo.bonto.run in ~15 seconds."
