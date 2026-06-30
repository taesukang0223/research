/**
 * 로컬 개발 전 .env 필수 변수 확인
 */

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const rootDir = path.resolve(__dirname, '..');
const envPath = path.join(rootDir, '.env');

if (!fs.existsSync(envPath)) {
  console.error('\n[오류] .env 파일이 없습니다.');
  console.error('  copy .env.sample .env');
  console.error('  .env 에 API 키를 입력한 뒤 다시 실행하세요.\n');
  process.exit(1);
}

dotenv.config({ path: envPath });
dotenv.config({ path: path.join(rootDir, '.env.local') });

const checks = [
  { key: 'TAVILY_API_KEY', label: 'Tavily 검색' },
  { key: 'NAVER_CLIENT_ID', label: '네이버 Client ID' },
  { key: 'NAVER_CLIENT_SECRET', label: '네이버 Client Secret' },
  { key: 'GEMINI_API_KEY', label: 'Gemini AI' },
];

const missing = checks.filter(({ key }) => {
  const value = process.env[key];
  return !value || value.includes('your-');
});

if (missing.length) {
  console.warn('\n[경고] .env 에 다음 키가 설정되지 않았습니다:');
  missing.forEach(({ key, label }) => console.warn(`  - ${key} (${label})`));
  console.warn('  API 호출 시 503 응답이 반환될 수 있습니다.\n');
} else {
  console.log('\n[OK] 검색·AI API 키가 모두 설정되어 있습니다.\n');
}
