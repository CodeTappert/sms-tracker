@echo off
SETLOCAL
SET BIN_NAME=sms-tracker.exe

echo [1/2] Cleaning old binary...
if exist %BIN_NAME% del %BIN_NAME%

echo [2/2] Building Windows binary...
go build -o %BIN_NAME% .

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo BUILD FAILED! Please check the errors above.
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo SUCCESS: %BIN_NAME% has been created.
echo.
pause