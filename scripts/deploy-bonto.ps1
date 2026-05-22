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
$pkgJson = Get-Content $pkgPath -Raw
$pkgForBonto = $pkgJson -replace '(?m)^\s*"start":\s*"node server\.js",\r?\n', ''
$utf8 = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText((Join-Path $root $pkgPath), $pkgForBonto.TrimEnd(), $utf8)

git add dist index.html assets sw.js package.json server.js scripts/deploy-bonto.ps1
$status = git status --porcelain
if ($status) {
  git commit -m "Deploy: static build for Bonto"
}

$bontoUrl = "https://api.bonto.dev/git/skmytodoo.git"
if (git remote | Select-String -Pattern "^bonto$") {
  git remote set-url bonto $bontoUrl
} else {
  git remote add bonto $bontoUrl
}

Write-Host "Pushing to Bonto (branch master)..."
git push bonto HEAD:master

Write-Host "Done. Open https://skmytodoo.bonto.run in ~15 seconds."
