# Tắt CSDL PostgreSQL và Redis trong Docker. Dữ liệu được GIỮ (nằm trong volume Docker).
# Đóng 2 cửa sổ "TGTH Cowork" trước (hoặc sau) khi chạy tệp này.
$ErrorActionPreference = 'Continue'
$Goc = Split-Path -Parent $PSScriptRoot
Set-Location $Goc
& docker compose --env-file (Join-Path $Goc '.env') -f (Join-Path $PSScriptRoot 'docker-compose.yml') stop
Write-Host 'Đã tắt CSDL. Dữ liệu vẫn còn; mở lại bằng CHAY.bat.' -ForegroundColor Green
