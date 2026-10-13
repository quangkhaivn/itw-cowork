# CÀI NHANH TGTH COWORK ĐỂ CHẠY THỬ — KHÔNG CẦN CÀI GÌ TRƯỚC (không Git, không Node.js, không Docker).
# Chỉ cần Windows 10/11 64-bit và mạng Internet. Không cần quyền Administrator.
#
# Tự tải về một thư mục duy nhất (mặc định L:\TGTH-Cowork, nếu không có ổ L: thì %USERPROFILE%\TGTH-Cowork):
#   node\     Node.js 22 bản chạy ngay (không cài vào Windows)
#   pgsql\    PostgreSQL 16 bản gọn (gói @embedded-postgres trên npm)
#   pgdata\   dữ liệu thử (DEMO) — giữ nguyên qua các lần cập nhật
#   app\      mã nguồn TGTH Cowork nhánh release/0.16 + .env
# rồi tạo CHAY.bat / DUNG.bat / CAP-NHAT.bat ngay trong thư mục đó.
#
# Chạy lại tệp này bất cứ lúc nào để cập nhật mã mới nhất: dữ liệu và .env được giữ.

param([string]$ThuMuc = '')

$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'   # thanh tiến trình của Invoke-WebRequest làm tải chậm gấp nhiều lần trên PowerShell 5.1
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

$NHANH = 'release/0.16'
$NODE_PHIEN_BAN = '22.22.0'
$PG_GOI = '16.14.0-beta.17'
$CONG_PG = 55432
$CONG_APP = 3000
$LaWindows = ($PSVersionTable.PSEdition -ne 'Core') -or $IsWindows

function Buoc($so, $chu) { Write-Host ""; Write-Host "=== $so. $chu ===" -ForegroundColor Cyan }
function Dung($chu) { Write-Host ""; Write-Host "LỖI: $chu" -ForegroundColor Red; exit 1 }
function Kiem($ma, $moTa) { if ($ma -ne 0) { Dung "$moTa không thành công (mã $ma). Xem thông báo phía trên." } }
function Tai($url, $dich) {
  Write-Host "Tải $url"
  for ($lan = 1; $lan -le 3; $lan++) {
    try { Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $dich; return } catch { Write-Host "  lần $lan hỏng: $($_.Exception.Message)" -ForegroundColor Yellow; Start-Sleep -Seconds (2 * $lan) }
  }
  Dung "Không tải được $url. Kiểm tra mạng Internet rồi chạy lại."
}
function GhiUtf8($duongDan, $noiDung, $bom) { [System.IO.File]::WriteAllText($duongDan, $noiDung, (New-Object System.Text.UTF8Encoding $bom)) }
function NgauNhienHex($soByte) { $b = New-Object byte[] $soByte; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); return (($b | ForEach-Object { $_.ToString('x2') }) -join '') }
function NgauNhienB64($soByte) { $b = New-Object byte[] $soByte; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); return [Convert]::ToBase64String($b) }

# ---------------------------------------------------------------------------
Buoc 1 'Chọn thư mục cài'
if (-not $ThuMuc) {
  if ($LaWindows -and (Test-Path 'L:\')) { $ThuMuc = 'L:\TGTH-Cowork' }
  elseif ($LaWindows) { $ThuMuc = Join-Path $env:USERPROFILE 'TGTH-Cowork' }
  else { $ThuMuc = Join-Path $HOME 'TGTH-Cowork' }
}
New-Item -ItemType Directory -Force -Path $ThuMuc | Out-Null
$ThuMuc = (Resolve-Path $ThuMuc).Path
$DirNode = Join-Path $ThuMuc 'node'
$DirPg = Join-Path $ThuMuc 'pgsql'
$DirData = Join-Path $ThuMuc 'pgdata'
$DirApp = Join-Path $ThuMuc 'app'
$DirTam = Join-Path $ThuMuc 'tam'
New-Item -ItemType Directory -Force -Path $DirTam | Out-Null
Write-Host "Cài vào: $ThuMuc"
if ($LaWindows) {
  $o = Get-PSDrive -Name $ThuMuc.Substring(0, 1) -ErrorAction SilentlyContinue
  if ($o -and $o.Free -and $o.Free -lt 4GB) { Dung ("Ổ {0}: còn trống {1:N1} GB — cần ít nhất 4 GB." -f $ThuMuc.Substring(0, 1), ($o.Free / 1GB)) }
}

# ---------------------------------------------------------------------------
Buoc 2 "Node.js $NODE_PHIEN_BAN (bản chạy ngay, không cài vào Windows)"
if ($LaWindows) { $NodeExe = Join-Path $DirNode 'node.exe'; $NpmCmd = Join-Path $DirNode 'npm.cmd'; $NpxCmd = Join-Path $DirNode 'npx.cmd'; $DirNodeBin = $DirNode }
else { $NodeExe = Join-Path $DirNode 'bin/node'; $NpmCmd = Join-Path $DirNode 'bin/npm'; $NpxCmd = Join-Path $DirNode 'bin/npx'; $DirNodeBin = Join-Path $DirNode 'bin' }
$coNode = $false
if (Test-Path $NodeExe) { $v = (& $NodeExe -v | Out-String).Trim(); $coNode = ($v -eq "v$NODE_PHIEN_BAN") }
if (-not $coNode) {
  if (Test-Path $DirNode) { Remove-Item -Recurse -Force $DirNode }
  if ($LaWindows) {
    $ten = "node-v$NODE_PHIEN_BAN-win-x64"; $tep = Join-Path $DirTam "$ten.zip"
    Tai "https://nodejs.org/dist/v$NODE_PHIEN_BAN/$ten.zip" $tep
    Expand-Archive -Path $tep -DestinationPath $DirTam -Force
  } else {
    $ten = "node-v$NODE_PHIEN_BAN-linux-x64"; $tep = Join-Path $DirTam "$ten.tar.xz"
    Tai "https://nodejs.org/dist/v$NODE_PHIEN_BAN/$ten.tar.xz" $tep
    & tar -xJf $tep -C $DirTam; Kiem $LASTEXITCODE 'Giải nén Node.js'
  }
  Move-Item (Join-Path $DirTam $ten) $DirNode
  Remove-Item $tep -Force
}
$env:Path = $DirNodeBin + [IO.Path]::PathSeparator + $env:Path
Write-Host ("Node.js " + (& $NodeExe -v | Out-String).Trim())

# ---------------------------------------------------------------------------
Buoc 3 "Mã nguồn TGTH Cowork (nhánh $NHANH)"
$tepZip = Join-Path $DirTam 'cowork.zip'
Tai "https://codeload.github.com/quangkhaivn/itw-cowork/zip/refs/heads/$NHANH" $tepZip
$dirGiai = Join-Path $DirTam 'giai-nen'
if (Test-Path $dirGiai) { Remove-Item -Recurse -Force $dirGiai }
Expand-Archive -Path $tepZip -DestinationPath $dirGiai -Force
$dirMa = (Get-ChildItem $dirGiai -Directory | Select-Object -First 1).FullName
if (-not (Test-Path (Join-Path $dirMa 'package.json'))) { Dung 'Tệp mã nguồn tải về không đúng (thiếu package.json). Kho mã có thể đã chuyển sang Private — báo người hỗ trợ.' }
# Cập nhật: giữ .env, node_modules (để cài lại nhanh), thay mọi thứ khác bằng mã mới.
if (Test-Path $DirApp) {
  Get-ChildItem $DirApp -Force | Where-Object { $_.Name -notin @('.env', 'node_modules') } | Remove-Item -Recurse -Force
} else { New-Item -ItemType Directory -Path $DirApp | Out-Null }
Get-ChildItem $dirMa -Force | ForEach-Object { Move-Item $_.FullName $DirApp -Force }
Remove-Item -Recurse -Force $dirGiai; Remove-Item -Force $tepZip
Write-Host "Mã nguồn ở $DirApp"

# ---------------------------------------------------------------------------
Buoc 4 'PostgreSQL 16 bản gọn'
$PgBin = Join-Path $DirPg 'bin'
$PgCtl = Join-Path $PgBin ($(if ($LaWindows) { 'pg_ctl.exe' } else { 'pg_ctl' }))
$InitDb = Join-Path $PgBin ($(if ($LaWindows) { 'initdb.exe' } else { 'initdb' }))
if (-not (Test-Path $PgCtl)) {
  $goi = $(if ($LaWindows) { '@embedded-postgres/windows-x64' } else { '@embedded-postgres/linux-x64' })
  Push-Location $DirTam
  & $NpmCmd pack "$goi@$PG_GOI" --silent; $ma = $LASTEXITCODE
  Pop-Location
  Kiem $ma 'Tải PostgreSQL'
  $tgz = Get-ChildItem $DirTam -Filter 'embedded-postgres-*.tgz' | Select-Object -First 1
  & tar -xzf $tgz.FullName -C $DirTam; Kiem $LASTEXITCODE 'Giải nén PostgreSQL'
  if (Test-Path $DirPg) { Remove-Item -Recurse -Force $DirPg }
  Move-Item (Join-Path $DirTam 'package/native') $DirPg
  Remove-Item -Recurse -Force (Join-Path $DirTam 'package'); Remove-Item -Force $tgz.FullName
  if (-not $LaWindows) { Get-ChildItem $PgBin | ForEach-Object { & chmod +x $_.FullName } }
}
Write-Host "PostgreSQL ở $DirPg"

# ---------------------------------------------------------------------------
Buoc 5 'Tệp cấu hình .env (chỉ tạo lần đầu)'
$TepEnv = Join-Path $DirApp '.env'
if (-not (Test-Path $TepEnv)) {
  $mkOwner = NgauNhienHex 18; $mkApp = NgauNhienHex 18; $mkAdmin = 'Cowork' + (NgauNhienHex 6) + '2026'
  $noiDung = @"
# Tạo tự động bởi may-ca-nhan/cai-nhanh.ps1 cho máy cá nhân. KHÔNG dùng trên máy chủ thật.
POSTGRES_USER=cowork_owner
POSTGRES_PASSWORD=$mkOwner
POSTGRES_DB=cowork
APP_DB_PASSWORD=$mkApp
DATABASE_URL=postgresql://cowork_app:$mkApp@127.0.0.1:$CONG_PG/cowork?schema=public
DATABASE_URL_OWNER=postgresql://cowork_owner:$mkOwner@127.0.0.1:$CONG_PG/cowork?schema=public
AUTH_SECRET=$(NgauNhienB64 48)
APP_URL=http://127.0.0.1:$CONG_APP
APP_ENC_KEY=$(NgauNhienB64 32)
SEED_ADMIN_EMAIL=admin@thegioitinhoc.vn
SEED_ADMIN_PASSWORD=$mkAdmin
AI_PROVIDER=anthropic
AI_MODEL=claude-sonnet-5
ANTHROPIC_API_KEY=
"@
  GhiUtf8 $TepEnv ($noiDung.Replace("`r`n", "`n")) $false
  Write-Host 'Đã tạo .env với mật khẩu và khoá ngẫu nhiên.'
} else { Write-Host '.env đã có — giữ nguyên.' }
$E = @{}
Get-Content $TepEnv | ForEach-Object { if ($_ -match '^\s*([A-Z0-9_]+)=(.*)$') { $E[$Matches[1]] = $Matches[2] } }

# ---------------------------------------------------------------------------
Buoc 6 'Khởi tạo và bật CSDL'
$TepLogPg = Join-Path $ThuMuc 'postgres.log'
if (-not (Test-Path (Join-Path $DirData 'PG_VERSION'))) {
  $tepMk = Join-Path $DirTam 'pw.txt'
  GhiUtf8 $tepMk $E['POSTGRES_PASSWORD'] $false
  & $InitDb -D $DirData -U $E['POSTGRES_USER'] "--pwfile=$tepMk" -E UTF8 --locale=C -A scram-sha-256; $ma = $LASTEXITCODE
  Remove-Item -Force $tepMk
  Kiem $ma 'Khởi tạo CSDL (initdb)'
}
& $PgCtl -D $DirData status *> $null
if ($LASTEXITCODE -ne 0) {
  & $PgCtl -D $DirData -l $TepLogPg -o "-p $CONG_PG -c listen_addresses=127.0.0.1" -w -t 60 start; Kiem $LASTEXITCODE "Bật PostgreSQL (xem $TepLogPg)"
}
Write-Host "PostgreSQL chạy ở 127.0.0.1:$CONG_PG"

# ---------------------------------------------------------------------------
Buoc 7 'Cài gói npm (lần đầu 5–15 phút)'
Set-Location $DirApp
& $NpmCmd ci --no-audit --no-fund; Kiem $LASTEXITCODE 'npm ci'
& $NpxCmd prisma generate; Kiem $LASTEXITCODE 'prisma generate'

# ---------------------------------------------------------------------------
Buoc 8 'Tạo CSDL, vai ứng dụng, bảng và bảo mật theo doanh nghiệp'
$Sql = Join-Path $DirApp 'may-ca-nhan/chay-sql.cjs'
$urlQuanTri = "postgresql://$($E['POSTGRES_USER']):$($E['POSTGRES_PASSWORD'])@127.0.0.1:$CONG_PG/postgres"
$coDb = (& $NodeExe $Sql $urlQuanTri --dem "SELECT 1 FROM pg_database WHERE datname = 'cowork'" | Out-String).Trim()
if ($coDb -ne '1') { & $NodeExe $Sql $urlQuanTri --cau "CREATE DATABASE cowork OWNER $($E['POSTGRES_USER']) ENCODING 'UTF8' TEMPLATE template0"; Kiem $LASTEXITCODE 'Tạo CSDL cowork' }
& $NodeExe $Sql $E['DATABASE_URL_OWNER'] --cau "DO `$`$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cowork_app') THEN CREATE ROLE cowork_app LOGIN; END IF; END `$`$; ALTER ROLE cowork_app WITH PASSWORD '$($E['APP_DB_PASSWORD'])';"
Kiem $LASTEXITCODE 'Tạo vai cowork_app'
$env:DATABASE_URL = $E['DATABASE_URL_OWNER']
& $NpxCmd prisma migrate deploy; $ma = $LASTEXITCODE
Remove-Item Env:DATABASE_URL
Kiem $ma 'prisma migrate deploy'
& $NodeExe $Sql $E['DATABASE_URL_OWNER'] --tep (Join-Path $DirApp 'prisma/rls.sql'); Kiem $LASTEXITCODE 'Bật Row Level Security'

# ---------------------------------------------------------------------------
Buoc 9 'Nạp dữ liệu nền (itw) và dữ liệu mẫu DEMO (demo)'
& $NpmCmd run db:seed; Kiem $LASTEXITCODE 'Seed nền móng'
$env:DEMO_MAT_KHAU = 'MauThu2026x'
& $NpmCmd run db:seed:mau; $ma = $LASTEXITCODE
Remove-Item Env:DEMO_MAT_KHAU
Kiem $ma 'Seed dữ liệu mẫu'

# ---------------------------------------------------------------------------
Buoc 10 'Dựng bản chạy (next build, 3–8 phút)'
& $NpmCmd run build; Kiem $LASTEXITCODE 'next build'

# ---------------------------------------------------------------------------
Buoc 11 'Tạo các nút bấm CHAY / DUNG / CAP-NHAT'
if ($LaWindows) {
  $chay = @"
@echo off
rem Mo TGTH Cowork (ban chay thu). Dong 2 cua so den = dung phan mem; DUNG.bat tat CSDL.
cd /d "%~dp0"
set "PATH=%~dp0node;%PATH%"
"%~dp0pgsql\bin\pg_ctl.exe" -D "%~dp0pgdata" status >nul 2>nul || "%~dp0pgsql\bin\pg_ctl.exe" -D "%~dp0pgdata" -l "%~dp0postgres.log" -o "-p $CONG_PG -c listen_addresses=127.0.0.1" -w -t 60 start
if errorlevel 1 (echo Khong bat duoc CSDL - xem postgres.log & pause & exit /b 1)
start "TGTH Cowork - ung dung (dong = dung)" /d "%~dp0app" cmd /k npx next start -p $CONG_APP -H 127.0.0.1
start "TGTH Cowork - worker (gui email, nhac viec)" /d "%~dp0app" cmd /k npm run worker
echo Dang mo phan mem, doi khoang 10 giay...
powershell -NoProfile -Command "for(`$i=0;`$i -lt 60;`$i++){try{if((Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 'http://127.0.0.1:$CONG_APP/api/khoe').StatusCode -eq 200){break}}catch{};Start-Sleep 2}"
start "" "http://127.0.0.1:$CONG_APP"
echo Da mo http://127.0.0.1:$CONG_APP - thong tin dang nhap trong THONG-TIN-DANG-NHAP.txt
timeout /t 8 >nul
"@
  $dung = @"
@echo off
rem Tat CSDL cua ban chay thu. Du lieu duoc giu. Dong 2 cua so den "TGTH Cowork" de tat phan mem.
"%~dp0pgsql\bin\pg_ctl.exe" -D "%~dp0pgdata" -m fast stop
echo Da tat CSDL. Mo lai bang CHAY.bat.
pause
"@
  $capNhat = @"
@echo off
rem Tai ma moi nhat (nhanh $NHANH) va dung lai. Du lieu va .env duoc giu.
"%~dp0pgsql\bin\pg_ctl.exe" -D "%~dp0pgdata" -m fast stop >nul 2>nul
copy /y "%~dp0app\may-ca-nhan\cai-nhanh.ps1" "%TEMP%\cai-nhanh-cowork.ps1" >nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%TEMP%\cai-nhanh-cowork.ps1" -ThuMuc "%~dp0."
pause
"@
  foreach ($cap in @(@('CHAY.bat', $chay), @('DUNG.bat', $dung), @('CAP-NHAT.bat', $capNhat))) {
    [System.IO.File]::WriteAllText((Join-Path $ThuMuc $cap[0]), ($cap[1] -replace "`r?`n", "`r`n"), [System.Text.Encoding]::ASCII)
  }
}

$thongTin = @"
TGTH COWORK – BẢN CHẠY THỬ TRÊN MÁY NÀY (dữ liệu thử, không phải dữ liệu thật)
Thư mục: $ThuMuc

Mở phần mềm: bấm đúp CHAY.bat  →  http://127.0.0.1:$CONG_APP
Tắt: đóng 2 cửa sổ đen "TGTH Cowork", rồi bấm DUNG.bat
Cập nhật bản mới: bấm đúp CAP-NHAT.bat (giữ dữ liệu)

1) Doanh nghiệp mẫu – ô "Mã doanh nghiệp": demo – mật khẩu chung: MauThu2026x
   giamdoc@demo.test (Giám đốc)        quantri@demo.test (Quản trị)
   tp.kinhdoanh@demo.test (TP KD)      kd1@demo.test, kd2@demo.test (Kinh doanh)
   marketing@demo.test (Marketing)     ketoan@demo.test (Kế toán)
   tp.kythuat@demo.test, ktv1@demo.test (Kỹ thuật)   cskh@demo.test   kho@demo.test

2) Doanh nghiệp itw (trống) – ô "Mã doanh nghiệp": itw
   $($E['SEED_ADMIN_EMAIL'])  /  $($E['SEED_ADMIN_PASSWORD'])   (lần đầu bắt đổi mật khẩu)
"@
GhiUtf8 (Join-Path $ThuMuc 'THONG-TIN-DANG-NHAP.txt') $thongTin $true
if (Test-Path $DirTam) { Remove-Item -Recurse -Force $DirTam -ErrorAction SilentlyContinue }

Write-Host ""
Write-Host 'CÀI ĐẶT XONG.' -ForegroundColor Green
Write-Host "Thư mục: $ThuMuc"
Write-Host 'Bấm đúp CHAY.bat trong thư mục đó để mở phần mềm. Thông tin đăng nhập: THONG-TIN-DANG-NHAP.txt'
