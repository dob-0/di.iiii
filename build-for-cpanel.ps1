$ErrorActionPreference = "Stop"

Write-Host "Staging cPanel release bundle..." -ForegroundColor Green
Write-Host ""

npm run deploy:cpanel

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "cPanel release staging failed." -ForegroundColor Red
    exit $LASTEXITCODE
}

Write-Host ""
Write-Host "cPanel release bundle is ready in .deploy/cpanel/" -ForegroundColor Green
Write-Host "Sync public_html/ to your web root and serverXR/ + shared/ to your cPanel Node.js app directories." -ForegroundColor Cyan
Write-Host "Do not recreate a public_html/serverXR proxy folder; the Node.js App owns /serverXR." -ForegroundColor Cyan
