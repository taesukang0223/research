@echo off
chcp 65001 >nul
cd /d "%~dp0.."
set "PATH=%PATH%;C:\Program Files\GitHub CLI"

echo === GitHub: create repo and push ===
echo.

gh auth status >nul 2>&1
if errorlevel 1 (
  echo [1/3] GitHub login required.
  echo       Open the URL in your browser and enter the code.
  echo       When asked "Authenticate Git with your GitHub credentials?" press Y
  echo.
  gh auth login -p https -h github.com --skip-ssh-key
  if errorlevel 1 exit /b 1
) else (
  echo [1/3] GitHub login OK
)

echo.
echo [2/3] Create or verify research repo...
gh repo view taesukang0223/research >nul 2>&1
if errorlevel 1 (
  gh repo create research --public --source=. --remote=origin --description "Defense research archive"
  if errorlevel 1 exit /b 1
) else (
  echo       Repo already exists.
  git remote get-url origin >nul 2>&1
  if errorlevel 1 git remote add origin https://github.com/taesukang0223/research.git
)

echo.
echo [3/3] Push main branch...
git push -u origin main
if errorlevel 1 exit /b 1

echo.
echo Done: https://github.com/taesukang0223/research
exit /b 0
