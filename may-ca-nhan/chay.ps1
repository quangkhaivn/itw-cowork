# Mở TGTH Cowork trên máy cá nhân: bật CSDL (Docker), mở 2 cửa sổ (ứng dụng + worker), rồi mở trình duyệt.
# Chạy bằng CHAY.bat. Đóng 2 cửa sổ đó là dừng phần mềm; DUNG.bat tắt luôn CSDL trong Docker.
$ErrorActionPreference = 'Continue'
$Goc = Split-Path -Parent $PSScriptRoot
Set-Location $Goc
$Compose = @('compose', '--env-file', (Join-Path $Goc '.env'), '-f', (Join-Path $PSScriptRoot 'docker-compose.yml'))
$Url = 'http://127.0.0.1:3000'

function Dung($chu) { Write-Host ""; Write-Host "LỖI: $chu" -ForegroundColor Red; exit 1 }

if (-not (Test-Path (Join-Path $Goc '.env'))) { Dung 'Chưa cài đặt. Bấm đúp CAI-DAT.bat trước.' }
if (-not (Test-Path (Join-Path $Goc '.next/BUILD_ID'))) { Dung 'Chưa dựng bản chạy. Bấm đúp CAI-DAT.bat (chạy lại được nhiều lần).' }
$null = & docker info 2>&1
if ($LASTEXITCODE -ne 0) { Dung 'Docker Desktop chưa chạy. Mở Docker Desktop, đợi "Engine running" rồi chạy lại.' }

$Env = @{}
Get-Content (Join-Path $Goc '.env') | ForEach-Object { if ($_ -match '^\s*([A-Z0-9_]+)=(.*)$') { $Env[$Matches[1]] = $Matches[2] } }

Write-Host 'Bật PostgreSQL và Redis...'
& docker @Compose up -d
if ($LASTEXITCODE -ne 0) { Dung 'Không bật được Docker.' }
for ($i = 0; $i -lt 60; $i++) {
  $null = & docker @Compose exec -T db pg_isready -U $Env['POSTGRES_USER'] -d $Env['POSTGRES_DB'] 2>&1
  if ($LASTEXITCODE -eq 0) { break }
  Start-Sleep -Seconds 2
}

Write-Host 'Mở cửa sổ ứng dụng và cửa sổ worker (đừng đóng khi đang dùng)...'
$lenhApp = "`$Host.UI.RawUI.WindowTitle = 'TGTH Cowork - ung dung (dong cua so nay = dung)'; Set-Location '$Goc'; npx next start -p 3000 -H 127.0.0.1"
$lenhWorker = "`$Host.UI.RawUI.WindowTitle = 'TGTH Cowork - worker (gui email, nhac viec)'; Set-Location '$Goc'; npm run worker"
Start-Process powershell -ArgumentList '-NoExit', '-NoProfile', '-Command', $lenhApp
Start-Process powershell -ArgumentList '-NoExit', '-NoProfile', '-Command', $lenhWorker

Write-Host 'Đợi ứng dụng sẵn sàng...'
$len = $false
for ($i = 0; $i -lt 60; $i++) {
  try {
    $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 "$Url/api/khoe"
    if ($r.StatusCode -eq 200) { $len = $true; break }
  } catch { }
  Start-Sleep -Seconds 2
}
if (-not $len) { Dung "Ứng dụng chưa trả lời sau 2 phút. Xem lỗi trong cửa sổ 'TGTH Cowork - ung dung'." }
Start-Process $Url
Write-Host ""
Write-Host "Đã mở $Url — thông tin đăng nhập ở THONG-TIN-DANG-NHAP.txt" -ForegroundColor Green
