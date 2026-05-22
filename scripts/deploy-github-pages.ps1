# GitHub Pages: https://bisharit.github.io/repositoryTodo/
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $root

$env:VITE_BASE = "/repositoryTodo/"
npm run build
if ($LASTEXITCODE -ne 0) { throw "Build failed" }

$tmp = Join-Path $env:TEMP "mytodo-gh-pages"
if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
New-Item -ItemType Directory -Path $tmp | Out-Null
Copy-Item -Path "dist\*" -Destination $tmp -Recurse -Force
New-Item -ItemType File -Path (Join-Path $tmp ".nojekyll") -Force | Out-Null

Set-Location $tmp
git init | Out-Null
git add -A
git commit -m "Deploy GitHub Pages" | Out-Null
git branch -M gh-pages
git push -f "https://github.com/Bisharit/repositoryTodo.git" gh-pages

Write-Host "GitHub Pages: https://bisharit.github.io/repositoryTodo/"
