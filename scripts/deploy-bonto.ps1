# Сборка, публикация статики в корень репо, push на Bonto (ветка master)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $root

npm run build

Copy-Item -Path "dist\index.html" -Destination "index.html" -Force
if (Test-Path "assets") { Remove-Item "assets" -Recurse -Force }
Copy-Item -Path "dist\assets" -Destination "assets" -Recurse -Force
Copy-Item -Path "dist\sw.js" -Destination "sw.js" -Force

git add dist index.html assets sw.js package.json scripts/deploy-bonto.ps1
$status = git status --porcelain
if ($status) {
  git commit -m "Deploy: static production files for Bonto"
}

$bontoUrl = "https://api.bonto.dev/git/skmytodo.git"
if (-not (git remote | Select-String -Pattern "^bonto$")) {
  git remote add bonto $bontoUrl
}

Write-Host "Pushing to Bonto (branch master)..."
git push bonto HEAD:master

Write-Host "Done. Open https://skmytodo.bonto.run in ~15 seconds."
