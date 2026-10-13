# Cài TGTH Cowork lên máy cá nhân để chạy thử với dữ liệu DEMO.
# Chạy bằng CAI-DAT.bat (bấm đúp). Chạy lại nhiều lần cũng được: .env và dữ liệu đã có được giữ nguyên.
# Cần: Node.js 22 LTS, Docker Desktop đang chạy, mạng Internet (tải gói npm và ảnh Docker lần đầu).

# 'Continue': Windows PowerShell 5.1 biến dòng stderr của lệnh ngoài (docker, npm) thành lỗi dừng script
# khi đặt 'Stop'. Mỗi lệnh ngoài được kiểm mã thoát bằng Kiem/Chay bên dưới.
$ErrorActionPreference = 'Continue'
$Goc = Split-Path -Parent $PSScriptRoot
Set-Location $Goc
$Compose = @('compose', '--env-file', (Join-Path $Goc '.env'), '-f', (Join-Path $PSScriptRoot 'docker-compose.yml'))
$Utf8KhongBom = New-Object System.Text.UTF8Encoding $false

function Buoc($so, $chu) { Write-Host ""; Write-Host "=== $so. $chu ===" -ForegroundColor Cyan }
function Dung($chu) { Write-Host ""; Write-Host "LỖI: $chu" -ForegroundColor Red; exit 1 }
function Kiem($ma, $moTa) {
  # Gọi sau một lệnh ngoài (npm, npx, docker) với mã thoát của nó: dừng nếu lệnh đó hỏng.
  if ($ma -ne 0) { Dung "$moTa không thành công (mã $ma). Xem thông báo phía trên." }
}
function Chay($moTa) { Kiem $LASTEXITCODE $moTa }
function NgauNhien($soByte, $kieu) {
  $r = & node -e "const c=require('crypto');const b=c.randomBytes($soByte);console.log('$kieu'==='hex'?b.toString('hex'):b.toString('base64'))"
  return ($r | Out-String).Trim()
}

Buoc 1 'Kiểm tra máy'
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Dung 'Chưa cài Node.js. Tải bản 22 LTS tại https://nodejs.org rồi chạy lại.' }
$nodeV = (& node -v | Out-String).Trim()
$nodeMajor = [int]($nodeV.TrimStart('v').Split('.')[0])
if ($nodeMajor -lt 20) { Dung "Node.js $nodeV quá cũ. Cần bản 22 LTS (https://nodejs.org)." }
Write-Host "Node.js $nodeV"
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { Dung 'Chưa cài Docker Desktop. Tải tại https://www.docker.com/products/docker-desktop rồi chạy lại.' }
$null = & docker info 2>&1
if ($LASTEXITCODE -ne 0) { Dung 'Docker Desktop chưa chạy. Mở Docker Desktop, đợi biểu tượng cá voi báo "Engine running" rồi chạy lại.' }
Write-Host 'Docker Desktop đang chạy'

Buoc 2 'Tạo tệp cấu hình .env (chỉ lần đầu)'
$TepEnv = Join-Path $Goc '.env'
if (Test-Path $TepEnv) {
  Write-Host '.env đã có — giữ nguyên (không đổi khoá mã hoá, không mất dữ liệu).'
} else {
  $mkOwner = NgauNhien 18 hex
  $mkApp = NgauNhien 18 hex
  $mkRedis = NgauNhien 18 hex
  $mkAdmin = 'Cowork' + (NgauNhien 6 hex) + '2026'
  $noiDung = @"
# Tạo tự động bởi may-ca-nhan/cai-dat.ps1 cho máy cá nhân. KHÔNG dùng trên máy chủ thật, KHÔNG commit.
POSTGRES_USER=cowork_owner
POSTGRES_PASSWORD=$mkOwner
POSTGRES_DB=cowork
APP_DB_PASSWORD=$mkApp
DATABASE_URL=postgresql://cowork_app:$mkApp@127.0.0.1:55432/cowork?schema=public
DATABASE_URL_OWNER=postgresql://cowork_owner:$mkOwner@127.0.0.1:55432/cowork?schema=public
REDIS_PASSWORD=$mkRedis
REDIS_URL=redis://:$mkRedis@127.0.0.1:56379
AUTH_SECRET=$(NgauNhien 48 base64)
APP_URL=http://127.0.0.1:3000
APP_ENC_KEY=$(NgauNhien 32 base64)
SEED_ADMIN_EMAIL=admin@thegioitinhoc.vn
SEED_ADMIN_PASSWORD=$mkAdmin
AI_PROVIDER=anthropic
AI_MODEL=claude-sonnet-5
ANTHROPIC_API_KEY=
"@
  [System.IO.File]::WriteAllText($TepEnv, $noiDung.Replace("`r`n", "`n"), $Utf8KhongBom)
  Write-Host 'Đã tạo .env với mật khẩu và khoá ngẫu nhiên.'
}
$Env = @{}
Get-Content $TepEnv | ForEach-Object { if ($_ -match '^\s*([A-Z0-9_]+)=(.*)$') { $Env[$Matches[1]] = $Matches[2] } }

Buoc 3 'Bật PostgreSQL 16 và Redis trong Docker'
& docker @Compose up -d; Chay 'Bật Docker'
$sanSang = $false
for ($i = 0; $i -lt 60; $i++) {
  $null = & docker @Compose exec -T db pg_isready -U $Env['POSTGRES_USER'] -d $Env['POSTGRES_DB'] 2>&1
  if ($LASTEXITCODE -eq 0) { $sanSang = $true; break }
  Start-Sleep -Seconds 2
}
if (-not $sanSang) { Dung 'PostgreSQL không lên sau 2 phút. Mở Docker Desktop xem container "db".' }
Write-Host 'CSDL sẵn sàng'

Buoc 4 'Tạo vai ứng dụng cowork_app (để Row Level Security có hiệu lực)'
$sqlVai = @"
DO `$`$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cowork_app') THEN CREATE ROLE cowork_app LOGIN; END IF;
END `$`$;
ALTER ROLE cowork_app WITH PASSWORD '$($Env['APP_DB_PASSWORD'])';
"@
$sqlVai | & docker @Compose exec -T db psql -q -v ON_ERROR_STOP=1 -U $Env['POSTGRES_USER'] -d $Env['POSTGRES_DB']; Chay 'Tạo vai cowork_app'

Buoc 5 'Cài gói npm (lần đầu mất vài phút)'
& npm ci --no-audit --no-fund; Chay 'npm ci'
& npx prisma generate; Chay 'prisma generate'

Buoc 6 'Tạo bảng (migration) và bật Row Level Security'
$env:DATABASE_URL = $Env['DATABASE_URL_OWNER']
& npx prisma migrate deploy; $ma = $LASTEXITCODE
Remove-Item Env:DATABASE_URL
Kiem $ma 'prisma migrate deploy'
& docker @Compose cp (Join-Path $Goc 'prisma/rls.sql') 'db:/tmp/rls.sql'; Chay 'Chép rls.sql vào container'
& docker @Compose exec -T db psql -q -v ON_ERROR_STOP=1 -U $Env['POSTGRES_USER'] -d $Env['POSTGRES_DB'] -f /tmp/rls.sql; Chay 'Bật RLS'

Buoc 7 'Nạp dữ liệu nền (doanh nghiệp itw) và dữ liệu mẫu DEMO (doanh nghiệp demo)'
& npm run db:seed; Chay 'Seed nền móng'
$env:DEMO_MAT_KHAU = 'MauThu2026x'
& npm run db:seed:mau; $ma = $LASTEXITCODE
Remove-Item Env:DEMO_MAT_KHAU
Kiem $ma 'Seed dữ liệu mẫu'

Buoc 8 'Dựng bản chạy (next build, 2–5 phút)'
& npm run build; Chay 'next build'

$thongTin = @"
TGTH COWORK – MÁY CÁ NHÂN (dữ liệu thử, không phải dữ liệu thật)

Mở: http://127.0.0.1:3000   (chạy bằng CHAY.bat, dừng bằng DUNG.bat)

1) Doanh nghiệp mẫu – mã doanh nghiệp: demo – mật khẩu chung: MauThu2026x
   giamdoc@demo.test (Giám đốc)        quantri@demo.test (Quản trị)
   tp.kinhdoanh@demo.test (TP KD)      kd1@demo.test, kd2@demo.test (Kinh doanh)
   marketing@demo.test (Marketing)     ketoan@demo.test (Kế toán)
   tp.kythuat@demo.test, ktv1@demo.test (Kỹ thuật)   cskh@demo.test   kho@demo.test

2) Doanh nghiệp itw (trống, để thử khai báo từ đầu) – mã doanh nghiệp: itw
   $($Env['SEED_ADMIN_EMAIL'])  /  $($Env['SEED_ADMIN_PASSWORD'])   (lần đầu bắt đổi mật khẩu)

Gửi email thật: Quản trị → Kết nối email (Gmail cần "Mật khẩu ứng dụng").
Trợ lý AI: điền ANTHROPIC_API_KEY trong tệp .env rồi chạy lại CHAY.bat.
"@
$TepTT = Join-Path $Goc 'THONG-TIN-DANG-NHAP.txt'
[System.IO.File]::WriteAllText($TepTT, $thongTin, (New-Object System.Text.UTF8Encoding $true))

Write-Host ""
Write-Host 'CÀI ĐẶT XONG.' -ForegroundColor Green
Write-Host "Thông tin đăng nhập đã ghi vào: $TepTT"
Write-Host 'Bây giờ bấm đúp CHAY.bat để mở phần mềm.'
