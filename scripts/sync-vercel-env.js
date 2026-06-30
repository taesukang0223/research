/**
 * .env → Vercel Environment Variables 동기화
 * 민감 값은 stdout에 출력하지 않습니다.
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const envPath = path.join(rootDir, '.env');
const vercelBin = path.join(rootDir, 'node_modules', 'vercel', 'dist', 'vc.js');

const SYNC_KEYS = [
  'SUPABASE_PROJECT_REF',
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'TAVILY_API_KEY',
  'NAVER_CLIENT_ID',
  'NAVER_CLIENT_SECRET',
  'GEMINI_API_KEY',
];

const SENSITIVE_KEYS = new Set([
  'SUPABASE_ANON_KEY',
  'SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'TAVILY_API_KEY',
  'NAVER_CLIENT_ID',
  'NAVER_CLIENT_SECRET',
  'GEMINI_API_KEY',
]);

const TARGET_ENVS = ['production', 'preview', 'development'];

function getTargetEnvs(key) {
  if (SENSITIVE_KEYS.has(key)) {
    return ['production', 'preview'];
  }
  return TARGET_ENVS;
}

function parseEnv(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error('[오류] .env 파일이 없습니다. copy .env.sample .env');
    process.exit(1);
  }

  const vars = {};
  const content = fs.readFileSync(filePath, 'utf8');

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;

    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    vars[key] = value;
  }

  return vars;
}

function isPlaceholder(value) {
  if (!value) return true;
  return /your-|placeholder/i.test(value);
}

function addEnvVar(key, value, targetEnv) {
  const args = [vercelBin, 'env', 'add', key, targetEnv, '--force'];
  if (SENSITIVE_KEYS.has(key)) args.push('--sensitive');

  const result = spawnSync(process.execPath, args, {
    cwd: rootDir,
    input: value,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  if (result.status !== 0) {
    const err = (result.stderr || result.stdout || '').trim();
    throw new Error(err || `exit ${result.status}`);
  }
}

function main() {
  const vars = parseEnv(envPath);
  let synced = 0;
  let skipped = 0;

  console.log('=== .env → Vercel 환경변수 동기화 ===\n');

  for (const key of SYNC_KEYS) {
    const value = vars[key];

    if (isPlaceholder(value)) {
      console.log(`  skip  ${key} (미설정)`);
      skipped += 1;
      continue;
    }

    for (const targetEnv of getTargetEnvs(key)) {
      try {
        addEnvVar(key, value, targetEnv);
        console.log(`  ok    ${key} → ${targetEnv}`);
        synced += 1;
      } catch (err) {
        console.error(`  fail  ${key} → ${targetEnv}: ${err.message}`);
        process.exit(1);
      }
    }
  }

  console.log(`\n완료: ${synced}개 설정, ${skipped}개 건너뜀`);
  console.log('Vercel 대시보드 → research → Settings → Environment Variables 에서 확인하세요.');
}

main();
