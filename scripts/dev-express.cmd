@echo off
cd /d "%~dp0.."
node scripts\check-env.js
if errorlevel 1 exit /b 1
node --watch server\index.js
