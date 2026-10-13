@echo off
rem TAI VE VA CAI TGTH COWORK 0.16.0 LEN MAY NAY (du lieu thu DEMO).
rem Can: Git for Windows, Node.js 22 LTS, Docker Desktop (dang chay).
setlocal
set "THU_MUC=%USERPROFILE%\TGTH-Cowork"
set "NHANH=release/0.16"
where git >nul 2>nul || (echo Chua cai Git. Tai tai https://git-scm.com/download/win roi chay lai. & pause & exit /b 1)
where node >nul 2>nul || (echo Chua cai Node.js. Tai ban 22 LTS tai https://nodejs.org roi chay lai. & pause & exit /b 1)
where docker >nul 2>nul || (echo Chua cai Docker Desktop. Tai tai https://www.docker.com/products/docker-desktop roi chay lai. & pause & exit /b 1)
if exist "%THU_MUC%\.git" (
  echo Da co ma nguon tai %THU_MUC% - cap nhat ban moi nhat...
  git -C "%THU_MUC%" fetch origin %NHANH% || (pause & exit /b 1)
  git -C "%THU_MUC%" checkout %NHANH% || (pause & exit /b 1)
  git -C "%THU_MUC%" pull --ff-only origin %NHANH% || (pause & exit /b 1)
) else (
  echo Tai ma nguon ve %THU_MUC% ...
  git clone --branch %NHANH% https://github.com/quangkhaivn/itw-cowork "%THU_MUC%" || (pause & exit /b 1)
)
echo.
echo Chay bo cai dat...
powershell -NoProfile -ExecutionPolicy Bypass -File "%THU_MUC%\may-ca-nhan\cai-dat.ps1"
if errorlevel 1 (echo Cai dat chua xong - xem loi phia tren. & pause & exit /b 1)
echo.
echo Xong. Lan sau chi can bam dup: %THU_MUC%\may-ca-nhan\CHAY.bat
explorer "%THU_MUC%\may-ca-nhan"
powershell -NoProfile -ExecutionPolicy Bypass -File "%THU_MUC%\may-ca-nhan\chay.ps1"
pause
