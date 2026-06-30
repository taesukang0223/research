/**
 * Vercel dev 로컬 서버 실행 (배포 환경과 동일한 Serverless Functions)
 */

const { spawn } = require('child_process');
const path = require('path');

require('./check-env');

const port = process.env.PORT || '3000';
const vercelBin = path.join(__dirname, '..', 'node_modules', 'vercel', 'dist', 'vc.js');

const child = spawn(process.execPath, [vercelBin, 'dev', '--listen', port], {
  cwd: path.resolve(__dirname, '..'),
  stdio: 'inherit',
  env: process.env,
  shell: false,
});

child.on('exit', (code) => {
  if (code !== 0) {
    console.error('\n[Vercel dev] 실행 실패');
    console.error('  1. 최초 1회: npm run vercel:login');
    console.error('  2. .env 파일 확인: copy .env.sample .env');
    console.error('  3. Vercel 없이 테스트: npm run dev:express\n');
  }
  process.exit(code ?? 1);
});
