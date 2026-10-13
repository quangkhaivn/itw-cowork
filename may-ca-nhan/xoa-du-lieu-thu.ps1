# XOÁ TOÀN BỘ dữ liệu thử trên máy này (CSDL trong Docker) để cài lại từ đầu. Không đụng máy chủ thật.
$ErrorActionPreference = 'Continue'
$Goc = Split-Path -Parent $PSScriptRoot
Set-Location $Goc
$tl = Read-Host 'Gõ XOA để xoá toàn bộ dữ liệu thử trên máy này'
if ($tl -ne 'XOA') { Write-Host 'Không xoá gì.'; exit 0 }
& docker compose --env-file (Join-Path $Goc '.env') -f (Join-Path $PSScriptRoot 'docker-compose.yml') down -v
Remove-Item (Join-Path $Goc '.env') -ErrorAction SilentlyContinue
Remove-Item (Join-Path $Goc 'THONG-TIN-DANG-NHAP.txt') -ErrorAction SilentlyContinue
Write-Host 'Đã xoá. Chạy CAI-DAT.bat để cài lại.' -ForegroundColor Green
