# Сборка, статика в корень, push на Bonto (ветка master = деплой)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $root

npm run build

Copy-Item -Path "dist\index.html" -Destination "index.html" -Force
if (Test-Path "assets") { Remove-Item "assets" -Recurse -Force }
Copy-Item -Path "dist\assets" -Destination "assets" -Recurse -Force
Copy-Item -Path "dist\sw.js" -Destination "sw.js" -Force

# Bonto static hosting: без npm start (только index.html + assets)
$pkgPath = "package.json"
$pkg = Get-Content $pkgPath -Raw | ConvertFrom-Json
if ($pkg.scripts.start) {
  $pkg.scripts.PSObject.Properties.Remove("start")
  $pkg | ConvertTo-Json -Depth 10 | Set-Content $pkgPath -Encoding utf8
}

git add dist index.html assets sw.js package.json server.js scripts/deploy-bonto.ps1
$status = git status --porcelain
if ($status) {
  git commit -m "Deploy: static build for Bonto"
}

$bontoUrl = "https://api.bonto.dev/git/skmytodo.git"
if (-not (git remote | Select-String -Pattern "^bonto$")) {
  git remote add bonto $bontoUrl
}

Write-Host "Pushing to Bonto (branch master)..."
git push bonto HEAD:master

Write-Host "Pushed. If https://skmytodo.bonto.run still 404, create/start app 'skmytodo' on bonto.dev."
