/**
 * Express 로컬 서버 — api/*.js 핸들러를 Vercel과 동일하게 실행
 * Vercel 환경과 같은 테스트: npm run dev (vercel dev)
 * Express 대안: npm run dev:express
 */

const express = require('express');
const path = require('path');
const dotenv = require('dotenv');
const { adaptHandler } = require('../lib/vercel-adapter');

const rootDir = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(rootDir, '.env') });
dotenv.config({ path: path.join(rootDir, '.env.local') });

const tavilyHandler = require('../api/tavily');
const searchHandler = require('../api/search');
const geminiHandler = require('../api/gemini');
const researchHandler = require('../api/research');
const reportsHandler = require('../api/reports');
const analyzeFileHandler = require('../api/analyze-file');

const app = express();
const port = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '64kb' }));

app.all('/api/tavily', adaptHandler(tavilyHandler));
app.all('/api/search', adaptHandler(searchHandler));
app.all('/api/gemini', adaptHandler(geminiHandler));
app.all('/api/research', adaptHandler(researchHandler));
app.all('/api/reports', adaptHandler(reportsHandler));
app.post('/api/analyze-file', adaptHandler(analyzeFileHandler));

app.use('/js', express.static(path.join(rootDir, 'js')));
app.get('/', (_req, res) => res.sendFile(path.join(rootDir, 'index.html')));
app.get('/index.html', (_req, res) => res.sendFile(path.join(rootDir, 'index.html')));
app.get('/report.html', (_req, res) => res.sendFile(path.join(rootDir, 'report.html')));

app.listen(port, () => {
  console.log(`Express 로컬 서버: http://localhost:${port}`);
  console.log('  (Vercel과 동일 환경 테스트 → npm run dev)');
  console.log('  GET/POST /api/tavily');
  console.log('  GET/POST /api/search');
  console.log('  GET/POST /api/gemini');
  console.log('  GET/POST /api/research');
  console.log('  GET      /api/reports');
  console.log('  GET/POST /api/analyze-file');
});
