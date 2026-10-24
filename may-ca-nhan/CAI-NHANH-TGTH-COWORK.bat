@echo off
rem CAI NHANH TGTH COWORK DE CHAY THU - khong can cai Git, Node.js hay Docker truoc.
rem Chi can Windows 10/11 64-bit va mang Internet. Mac dinh cai vao L:\TGTH-Cowork (khong co o L: thi vao thu muc nguoi dung).
setlocal
set "TEP=%~dp0cai-nhanh.ps1"
if not exist "%TEP%" (
  set "TEP=%TEMP%\cai-nhanh-cowork.ps1"
  echo Tai bo cai tu GitHub...
  powershell -NoProfile -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -UseBasicParsing https://raw.githubusercontent.com/quangkhaivn/itw-cowork/release/0.17/may-ca-nhan/cai-nhanh.ps1 -OutFile $env:TEMP\cai-nhanh-cowork.ps1"
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%TEP%" %*
if errorlevel 1 (echo. & echo Cai dat chua xong - chup man hinh cua so nay gui nguoi ho tro. & pause & exit /b 1)
for %%D in (L:\TGTH-Cowork "%USERPROFILE%\TGTH-Cowork") do if exist "%%~D\CHAY.bat" (start "" explorer "%%~D" & call "%%~D\CHAY.bat" & goto :xong)
:xong
pause
