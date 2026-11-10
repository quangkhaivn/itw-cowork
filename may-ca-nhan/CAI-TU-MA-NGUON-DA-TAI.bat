@echo off
rem ============================================================================
rem  CAI TGTH COWORK TU MA NGUON DA TAI VE MAY (khong tai lai ma nguon tu GitHub)
rem
rem  Dung khi da tai ma nguon ban 0.22 tu GitHub (Code - Download ZIP) va giai nen.
rem  Dat tep nay trong thu muc may-ca-nhan cua ma nguon (hoac thu muc goc), roi bam dup.
rem  Van can mang Internet de tai Node.js, PostgreSQL va goi npm lan dau.
rem  Cai vao thu muc khac:  CAI-TU-MA-NGUON-DA-TAI.bat -ThuMuc "D:\TGTH-Cowork"
rem ============================================================================
setlocal
title Cai TGTH Cowork tu ma nguon da tai

set "GOC_MA="
if exist "%~dp0..\package.json" set "GOC_MA=%~dp0.."
if exist "%~dp0package.json" set "GOC_MA=%~dp0."
if not defined GOC_MA goto khong_thay_ma
for %%I in ("%GOC_MA%") do set "GOC_MA=%%~fI"

echo.
echo ==================================================================
echo   CAI TGTH COWORK TU MA NGUON DA TAI VE MAY
echo ==================================================================
echo Ma nguon: %GOC_MA%

rem [1/3] Kiem phien ban trong ma nguon da tai
powershell -NoProfile -Command "try { $v = (Get-Content -Raw '%GOC_MA%\package.json' | ConvertFrom-Json).version; Write-Host ('Phien ban ma nguon: ' + $v) -ForegroundColor Green; if (-not $v.StartsWith('0.22')) { Write-Host ('Chu y: day la ban ' + $v + ', khong phai 0.22.') -ForegroundColor Yellow } } catch { Write-Host 'Khong doc duoc package.json' -ForegroundColor Red; exit 1 }"
if errorlevel 1 goto khong_thay_ma

rem [2/3] Chon bo cai co ho tro lay ma tu may (-NguonMa)
set "TEP="
findstr /c:"NguonMa" "%~dp0cai-nhanh.ps1" >nul 2>nul && set "TEP=%~dp0cai-nhanh.ps1"
if not defined TEP findstr /c:"NguonMa" "%GOC_MA%\may-ca-nhan\cai-nhanh.ps1" >nul 2>nul && set "TEP=%GOC_MA%\may-ca-nhan\cai-nhanh.ps1"
if defined TEP goto co_bo_cai
echo Bo cai trong ma nguon nay chua ho tro lay ma tu may - tai ban bo cai moi ^(vai chuc KB^)...
set "TEP=%TEMP%\cai-tgth-cowork-tu-may.ps1"
powershell -NoProfile -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 60 'https://raw.githubusercontent.com/quangkhaivn/itw-cowork/release/0.22/may-ca-nhan/cai-nhanh.ps1' -OutFile '%TEP%' } catch { Write-Host $_.Exception.Message -ForegroundColor Red; exit 1 }"
if errorlevel 1 goto loi_mang
findstr /c:"NguonMa" "%TEP%" >nul || goto loi_mang

:co_bo_cai
echo Bo cai: %TEP%
echo.
echo [3/3] Cai dat - lan dau mat 10-20 phut, KHONG dong cua so nay...
powershell -NoProfile -ExecutionPolicy Bypass -File "%TEP%" -NguonMa "%GOC_MA%" %*
if errorlevel 1 goto loi_cai

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

:khong_thay_ma
echo.
echo LOI: khong thay ma nguon ^(package.json^). Dat tep nay trong thu muc may-ca-nhan cua ma nguon da giai nen.
goto loi_chung

:loi_mang
echo.
echo LOI: khong tai duoc bo cai moi. Kiem tra mang Internet roi chay lai.
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
