@echo off
rem Nhu CHAY.bat nhung mo cho ca mang noi bo: may cham cong van tay (ADMS) va may khac trong van phong goi vao duoc.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0chay.ps1" -MangNoiBo
echo.
pause
