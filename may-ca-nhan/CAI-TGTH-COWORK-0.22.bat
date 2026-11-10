@echo off
rem ============================================================================
rem  CAI DAT / CAP NHAT TGTH COWORK - BAN 0.22 (nhanh release/0.22 tren GitHub)
rem  Chi can Windows 10/11 64-bit va mang Internet. Khong can Git, Node.js, Docker.
rem  Mac dinh cai vao L:\TGTH-Cowork (khong co o L: thi vao thu muc nguoi dung).
rem  Da cai ban cu (0.17 - 0.21): chay tep nay de len 0.22, du lieu thu va .env duoc giu.
rem  Cai vao thu muc khac:  CAI-TGTH-COWORK-0.22.bat -ThuMuc "D:\TGTH-Cowork"
rem ============================================================================
setlocal
title Cai dat TGTH Cowork 0.22
set "NHANH=release/0.22"
set "GOC=https://raw.githubusercontent.com/quangkhaivn/itw-cowork/release/0.22"
set "TEP=%TEMP%\cai-tgth-cowork-0.22.ps1"

echo.
echo ==================================================================
echo   CAI DAT TGTH COWORK - BAN 0.22   ^(nhanh %NHANH%^)
echo ==================================================================
echo.
echo [1/3] Kiem tra phien ban tren GitHub...
powershell -NoProfile -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; try { $v = ((Invoke-WebRequest -UseBasicParsing -TimeoutSec 30 '%GOC%/package.json').Content | ConvertFrom-Json).version; if (-not $v.StartsWith('0.22')) { Write-Host ('   Nhanh tren GitHub dang la ban ' + $v + ', khong phai 0.22.') -ForegroundColor Red; exit 2 }; Write-Host ('   Se cai phien ban: ' + $v) -ForegroundColor Green } catch { Write-Host ('   Khong doc duoc GitHub: ' + $_.Exception.Message) -ForegroundColor Red; exit 1 }"
if errorlevel 2 goto sai_ban
if errorlevel 1 goto loi_mang

echo.
echo [2/3] Tai bo cai moi nhat cua ban 0.22...
if exist "%TEP%" del /f /q "%TEP%" >nul 2>nul
powershell -NoProfile -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; for ($i = 1; $i -le 3; $i++) { try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 60 '%GOC%/may-ca-nhan/cai-nhanh.ps1' -OutFile '%TEP%'; exit 0 } catch { Write-Host ('   Lan ' + $i + ' hong: ' + $_.Exception.Message) -ForegroundColor Yellow; Start-Sleep -Seconds (3 * $i) } }; exit 1"
if errorlevel 1 goto loi_mang
if not exist "%TEP%" goto loi_mang
findstr /c:"release/0.22" "%TEP%" >nul
if errorlevel 1 goto sai_ban
echo    Da tai bo cai ^(nhanh %NHANH%^).

echo.
echo [3/3] Cai dat - lan dau mat 10-20 phut, KHONG dong cua so nay...
powershell -NoProfile -ExecutionPolicy Bypass -File "%TEP%" %*
if errorlevel 1 goto loi_cai
del /f /q "%TEP%" >nul 2>nul

for %%D in (L:\TGTH-Cowork "%USERPROFILE%\TGTH-Cowork") do if exist "%%~D\CHAY.bat" (
  set "THU_MUC=%%~D"
  goto da_cai
)
echo.
echo Cai xong. Mo phan mem bang CHAY.bat trong thu muc da chon.
goto ket_thuc

:da_cai
echo.
powershell -NoProfile -Command "try { $v = (Get-Content -Raw '%THU_MUC%\app\package.json' | ConvertFrom-Json).version; Write-Host ('CAI DAT XONG - phien ban ' + $v + ' tai ' + '%THU_MUC%') -ForegroundColor Green } catch { Write-Host 'CAI DAT XONG.' -ForegroundColor Green }"
echo Dang nhap: ma doanh nghiep demo / giamdoc@demo.test / MauThu2026x
echo Thong tin day du: %THU_MUC%\THONG-TIN-DANG-NHAP.txt
echo Noi may cham cong van tay: mo bang CHAY-MANG-NOI-BO.bat thay cho CHAY.bat
start "" explorer "%THU_MUC%"
call "%THU_MUC%\CHAY.bat"
goto ket_thuc

:sai_ban
echo.
echo LOI: bo cai tai ve khong phai ban 0.22. Bao nguoi ho tro.
goto loi_chung

:loi_mang
echo.
echo LOI: khong tai duoc tu GitHub. Kiem tra mang Internet / proxy cong ty roi chay lai tep nay.
goto loi_chung

:loi_cai
echo.
echo LOI: cai dat chua xong. Chup man hinh cua so nay gui nguoi ho tro. Chay lai tep nay se lam tiep.
goto loi_chung

:loi_chung
pause
exit /b 1

:ket_thuc
pause
endlocal
