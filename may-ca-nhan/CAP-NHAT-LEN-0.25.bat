@echo off
rem  CAP NHAT TGTH COWORK LEN BAN 0.25 (nhanh release/0.25 tren GitHub) - may da co Node.js va Docker Desktop.
rem  Dat tep nay vao thu muc ma nguon TGTH Cowork cu (hoac thu muc may-ca-nhan ben trong) roi bam dup.
rem  De ngoai cho khac cung duoc: tep se hoi chon thu muc cu.
rem  Giu nguyen .env (mat khau CSDL) va du lieu thu; chi thay ma nguon roi cai lai, xong thi mo phan mem.
setlocal
title Cap nhat TGTH Cowork len 0.25
set "TGTH_BAT=%~f0"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$t=[IO.File]::ReadAllText($env:TGTH_BAT,[Text.Encoding]::UTF8); $i=$t.LastIndexOf('#==PS==#'); iex $t.Substring($i)"
echo.
pause
exit /b
#==PS==#
$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$NHANH = 'release/0.25'
$PHIEN_BAN = '0.25'
$ZIP_URL = 'https://codeload.github.com/quangkhaivn/itw-cowork/zip/refs/heads/release/0.25'

function Buoc($so, $chu) { Write-Host ''; Write-Host "=== $so. $chu ===" -ForegroundColor Cyan }
function Loi($chu) { Write-Host ''; Write-Host "LỖI: $chu" -ForegroundColor Red; exit 1 }
function LaMaNguon($thuMuc) {
  if (-not $thuMuc) { return $false }
  $p = Join-Path $thuMuc 'package.json'
  if (-not (Test-Path $p)) { return $false }
  try { return ((Get-Content -Raw -Encoding UTF8 $p | ConvertFrom-Json).name -eq 'cowork-itw') } catch { return $false }
}

Write-Host '=============================================================='
Write-Host "  CẬP NHẬT TGTH COWORK LÊN BẢN $PHIEN_BAN  (nhánh $NHANH)"
Write-Host '  Giữ nguyên .env và dữ liệu thử DEMO đã có.'
Write-Host '=============================================================='

# ---------------------------------------------------------------- 1
Buoc 1 'Kiểm tra máy'
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Loi 'Chưa cài Node.js. Tải bản LTS tại https://nodejs.org rồi chạy lại.' }
$nodeV = (& node -v | Out-String).Trim()
if ([int]($nodeV.TrimStart('v').Split('.')[0]) -lt 20) { Loi "Node.js $nodeV quá cũ, cần bản 22 trở lên." }
Write-Host "Node.js $nodeV"
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { Loi 'Chưa cài Docker Desktop (https://www.docker.com/products/docker-desktop).' }
& docker info *> $null
if ($LASTEXITCODE -ne 0) { Loi 'Docker Desktop chưa chạy. Mở Docker Desktop, đợi góc dưới báo "Engine running", rồi bấm đúp lại tệp này.' }
Write-Host 'Docker Desktop đang chạy.'
$coDuLieuCu = [bool](& docker volume ls -q --filter 'name=tgth-cowork-may-ca-nhan' 2>$null)

# ---------------------------------------------------------------- 2
Buoc 2 'Tìm thư mục TGTH Cowork cũ'
$noiTep = Split-Path -Parent $env:TGTH_BAT
$Goc = $null
foreach ($t in @($noiTep, (Split-Path -Parent $noiTep), (Join-Path $env:USERPROFILE 'TGTH-Cowork'))) {
  if (LaMaNguon $t) { $Goc = (Resolve-Path $t).Path; break }
}
if (-not $Goc) {
  Write-Host 'Không thấy mã nguồn cạnh tệp này - mở hộp chọn thư mục...' -ForegroundColor Yellow
  Add-Type -AssemblyName System.Windows.Forms
  $hop = New-Object System.Windows.Forms.FolderBrowserDialog
  $hop.Description = 'Chọn thư mục mã nguồn TGTH Cowork cũ (thư mục có tệp package.json và .env). Bấm Cancel nếu cài mới.'
  $hop.ShowNewFolderButton = $false
  if ($hop.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
    if (-not (LaMaNguon $hop.SelectedPath)) { Loi "Thư mục $($hop.SelectedPath) không phải mã nguồn TGTH Cowork (không có package.json của TGTH Cowork)." }
    $Goc = $hop.SelectedPath
  } else {
    if ($coDuLieuCu) { Loi 'Máy đã có dữ liệu thử TGTH Cowork trong Docker nhưng chưa chọn thư mục cũ. Phải dùng đúng thư mục cũ (có tệp .env chứa mật khẩu CSDL). Bấm đúp lại và chọn thư mục đó.' }
    $Goc = Join-Path $env:USERPROFILE 'TGTH-Cowork'
    New-Item -ItemType Directory -Force -Path $Goc | Out-Null
    Write-Host "Cài mới vào $Goc" -ForegroundColor Yellow
  }
}
Write-Host "Thư mục: $Goc"
$TepEnv = Join-Path $Goc '.env'
if (Test-Path $TepEnv) {
  if (Test-Path (Join-Path (Split-Path -Parent $Goc) 'pgdata')) { Loi "Bản trong $Goc là bản cài gọn (CAI-NHANH, không dùng Docker). Bản đó cập nhật bằng CAI-TGTH-COWORK-0.25.bat." }
  Write-Host 'Đã có .env - giữ nguyên (mật khẩu CSDL, khóa).'
} elseif ($coDuLieuCu) {
  Loi "Thư mục $Goc chưa có tệp .env nhưng máy đã có dữ liệu thử trong Docker. Chép tệp .env từ thư mục cài trước sang $Goc rồi chạy lại (không có .env thì không vào được CSDL cũ)."
}
$cuV = ''
if (LaMaNguon $Goc) { $cuV = (Get-Content -Raw -Encoding UTF8 (Join-Path $Goc 'package.json') | ConvertFrom-Json).version; Write-Host "Bản hiện tại: $cuV" }

# ---------------------------------------------------------------- 3
Buoc 3 'Tắt bản TGTH Cowork đang chạy trong thư mục này'
$dang = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
  ($_.Name -in @('node.exe', 'esbuild.exe')) -and ((($_.ExecutablePath) -and $_.ExecutablePath.StartsWith($Goc, [StringComparison]::OrdinalIgnoreCase)) -or (($_.CommandLine) -and $_.CommandLine.IndexOf($Goc, [StringComparison]::OrdinalIgnoreCase) -ge 0))
}
if ($dang) {
  $dang | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  Start-Sleep -Seconds 2
  Write-Host "Đã tắt $(@($dang).Count) tiến trình (có thể đóng các cửa sổ đen cũ)."
} else { Write-Host 'Không có bản nào đang chạy.' }

# ---------------------------------------------------------------- 4
Buoc 4 "Lấy mã nguồn bản $PHIEN_BAN"
if (Test-Path $TepEnv) { Copy-Item $TepEnv (Join-Path $Goc '.env.truoc-0.25') -Force; Write-Host 'Đã sao lưu .env -> .env.truoc-0.25' }
$dungGit = (Test-Path (Join-Path $Goc '.git')) -and [bool](Get-Command git -ErrorAction SilentlyContinue)
if ($dungGit) {
  Write-Host 'Thư mục là bản git - cập nhật bằng git...'
  & git -C $Goc fetch origin $NHANH; if ($LASTEXITCODE -ne 0) { Loi 'git fetch không được (xem thông báo phía trên).' }
  & git -C $Goc checkout -B $NHANH "origin/$NHANH"; if ($LASTEXITCODE -ne 0) { Loi 'git checkout không được - có thể có tệp đã sửa tay trong thư mục mã nguồn.' }
} else {
  $Tam = Join-Path $env:TEMP 'tgth-cowork-0.25'
  $Zip = "$Tam.zip"
  Remove-Item -Recurse -Force $Tam, $Zip -ErrorAction SilentlyContinue
  Write-Host 'Tải mã nguồn từ GitHub (khoảng 10-30 MB)...'
  try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 600 $ZIP_URL -OutFile $Zip } catch { Loi "Không tải được từ GitHub: $($_.Exception.Message)" }
  Write-Host 'Giải nén...'
  try { Expand-Archive -Path $Zip -DestinationPath $Tam -Force } catch { Loi "Giải nén không được: $($_.Exception.Message)" }
  $Nguon = Get-ChildItem -Directory $Tam | Where-Object { LaMaNguon $_.FullName } | Select-Object -First 1
  if (-not $Nguon) { Loi 'Tệp tải về không có mã nguồn TGTH Cowork.' }
  $moiV = (Get-Content -Raw -Encoding UTF8 (Join-Path $Nguon.FullName 'package.json') | ConvertFrom-Json).version
  if (-not $moiV.StartsWith($PHIEN_BAN)) { Loi "Nhánh trên GitHub đang là bản $moiV, không phải $PHIEN_BAN." }
  Write-Host "Chép bản $moiV đè lên $Goc (giữ .env, node_modules, dữ liệu)..."
  & robocopy $Nguon.FullName $Goc /E /XD node_modules .next .git /XF .env .env.truoc-0.25 THONG-TIN-DANG-NHAP.txt CAP-NHAT-LEN-0.25.bat /R:2 /W:2 /NFL /NDL /NJH /NJS /NP | Out-Null
  if ($LASTEXITCODE -ge 8) { Loi "Chép mã nguồn không được (robocopy mã $LASTEXITCODE). Có thể một tệp đang bị chương trình khác mở - đóng hết cửa sổ TGTH Cowork rồi chạy lại." }
  Remove-Item -Recurse -Force $Tam, $Zip -ErrorAction SilentlyContinue
}
$v = (Get-Content -Raw -Encoding UTF8 (Join-Path $Goc 'package.json') | ConvertFrom-Json).version
if (-not $v.StartsWith($PHIEN_BAN)) { Loi "Sau khi cập nhật, mã nguồn là bản $v, không phải $PHIEN_BAN." }
Write-Host "Mã nguồn: $cuV -> $v" -ForegroundColor Green

# ---------------------------------------------------------------- 5
Buoc 5 'Cài đặt (cập nhật CSDL, gói npm, dữ liệu DEMO, dựng bản chạy) - 5-15 phút'
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Goc 'may-ca-nhan\cai-dat.ps1')
if ($LASTEXITCODE -ne 0) { Loi 'Cài đặt chưa xong - xem lỗi phía trên. Chụp màn hình cửa sổ này gửi người hỗ trợ.' }

# ---------------------------------------------------------------- 6
Buoc 6 'Mở phần mềm'
Write-Host ''
Write-Host "XONG - TGTH Cowork $v." -ForegroundColor Green
Write-Host 'Đăng nhập: mã doanh nghiệp  demo  ·  marketing@demo.test  ·  mật khẩu  MauThu2026x'
Write-Host 'Thử: Mạng xã hội -> Lịch nội dung / AI viết bài / Hồ sơ thương hiệu / Chiến dịch nội dung.'
Write-Host "Lần sau chỉ cần bấm đúp: $Goc\may-ca-nhan\CHAY.bat"
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Goc 'may-ca-nhan\chay.ps1')
