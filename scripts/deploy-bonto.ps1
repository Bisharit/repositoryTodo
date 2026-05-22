# Сборка, коммит dist и push на Bonto (ветка master = деплой)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $root

npm run build

git add dist server.js package.json package-lock.json scripts/deploy-bonto.ps1 .gitignore
$status = git status --porcelain
if ($status) {
  git commit -m "Deploy: include production build for Bonto"
}

$bontoUrl = "https://api.bonto.dev/git/skmytodo.git"
if (-not (git remote | Select-String -Pattern "^bonto$")) {
  git remote add bonto $bontoUrl
}

Write-Host "Pushing to Bonto (branch master)..."
git push bonto HEAD:master

Write-Host "Done. Open https://skmytodo.bonto.run in ~15 seconds."
