@echo off
cd /d "%~dp0.."
echo Vercel GitHub 로그인 (브라우저 인증 후 코드 입력)
node node_modules\vercel\dist\vc.js login --github --oob
