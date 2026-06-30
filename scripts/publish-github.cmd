@echo off
cd /d "%~dp0.."
set "PATH=%PATH%;C:\Program Files\GitHub CLI"

echo === GitHub 레포지터리 생성 및 푸시 ===
echo.

gh auth status >nul 2>&1
if errorlevel 1 (
  echo [1/3] GitHub 로그인이 필요합니다.
  echo       브라우저에서 코드 입력 후 돌아오세요.
  gh auth login -p https -h github.com
  if errorlevel 1 exit /b 1
) else (
  echo [1/3] GitHub 로그인 확인됨
)

echo.
echo [2/3] research 레포지터리 생성 또는 확인...
gh repo view taesukang0223/research >nul 2>&1
if errorlevel 1 (
  gh repo create research --public --source=. --remote=origin --description "방산 리서치 아카이브"
  if errorlevel 1 exit /b 1
) else (
  echo       레포지터리가 이미 존재합니다.
  git remote get-url origin >nul 2>&1
  if errorlevel 1 git remote add origin https://github.com/taesukang0223/research.git
)

echo.
echo [3/3] main 브랜치 푸시...
git push -u origin main
if errorlevel 1 exit /b 1

echo.
echo 완료: https://github.com/taesukang0223/research
exit /b 0
