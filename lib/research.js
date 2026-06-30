/**
 * Tavily + 네이버 통합 리서치 검색 + Gemini 보고서 작성
 */

const { handleSearch } = require('./tavily');
const { searchNews } = require('./search');
const { handleGenerate, isConfigured: isGeminiConfigured, DEFAULT_MODEL } = require('./gemini');
const { renderPrompt, preloadPrompts } = require('./prompt-loader');
const { parseReport } = require('./report-parser');

const REPORT_PROMPT = 'report-prompt.md';

try {
  preloadPrompts([REPORT_PROMPT]);
} catch (err) {
  console.warn(`[prompt] ${REPORT_PROMPT} preload failed:`, err.message);
}

function truncate(text, max = 400) {
  if (!text) return '';
  const clean = String(text).replace(/\s+/g, ' ').trim();
  return clean.length <= max ? clean : `${clean.slice(0, max)}…`;
}

function buildSearchContext(query, tavily, naver) {
  const blocks = [];

  const tavilyItems = Array.isArray(tavily?.results) ? tavily.results : [];
  if (tavilyItems.length) {
    blocks.push('## 글로벌 검색 (Tavily)');
    tavilyItems.forEach((item, i) => {
      blocks.push(
        `${i + 1}. ${truncate(item.title, 200)}\n` +
          `   URL: ${item.url || '(없음)'}\n` +
          `   ${truncate(item.content, 400) || '(본문 없음)'}`
      );
    });
  }

  const naverItems = Array.isArray(naver?.items) ? naver.items : [];
  if (naverItems.length) {
    if (blocks.length) blocks.push('');
    blocks.push('## 국내 검색 (Naver)');
    naverItems.forEach((item, i) => {
      blocks.push(
        `${i + 1}. ${truncate(item.title, 200)}\n` +
          `   URL: ${item.url || '(없음)'}\n` +
          `   ${truncate(item.content, 400) || '(본문 없음)'}\n` +
          `   ${item.pubDate ? `날짜: ${item.pubDate}` : ''}`
      );
    });
  }

  if (!blocks.length) {
    return `(주제 "${query}"에 대한 검색 결과 없음)`;
  }

  return blocks.join('\n\n');
}

function countSearchItems(tavily, naver) {
  const tavilyCount = Array.isArray(tavily?.results) ? tavily.results.length : 0;
  const naverCount = Array.isArray(naver?.items) ? naver.items.length : 0;
  return tavilyCount + naverCount;
}

async function generateReport(query, tavily, naver) {
  if (!isGeminiConfigured()) {
    return {
      error: 'Gemini API가 설정되지 않았습니다. GEMINI_API_KEY 환경변수를 확인하세요.',
    };
  }

  const prompt = renderPrompt(REPORT_PROMPT, {
    QUERY: query,
    SEARCH_CONTEXT: buildSearchContext(query, tavily, naver),
  });

  const geminiResult = await handleGenerate({
    model: DEFAULT_MODEL,
    prompt,
    temperature: 0.5,
    maxOutputTokens: 8192,
  });

  if (geminiResult.status !== 200) {
    return { error: geminiResult.body?.error || 'Gemini 보고서 작성에 실패했습니다.' };
  }

  try {
    const parsed = parseReport(geminiResult.body.text);
    return {
      ...parsed,
      model: DEFAULT_MODEL,
    };
  } catch (err) {
    return {
      error: err.message || '보고서 파싱에 실패했습니다.',
      raw: geminiResult.body.text,
    };
  }
}

async function handleResearch(body) {
  const query = typeof body?.query === 'string' ? body.query.trim() : '';

  if (!query) {
    return { status: 400, body: { error: 'query 필드는 필수입니다.' } };
  }

  if (query.length > 100) {
    return { status: 400, body: { error: 'query는 100자 이하여야 합니다.' } };
  }

  const [tavilyResult, naverResult] = await Promise.all([
    handleSearch({ query, max_results: 5 }),
    searchNews(query, { display: 5, sort: 'date' }),
  ]);

  const tavily = tavilyResult.status === 200 ? tavilyResult.body : { error: tavilyResult.body?.error };
  const naver = naverResult.status === 200 ? naverResult.body : { error: naverResult.body?.error };

  if (tavilyResult.status !== 200 && naverResult.status !== 200) {
    return {
      status: 502,
      body: { query, tavily, naver, report: { error: '검색 API가 모두 실패했습니다.' } },
    };
  }

  if (countSearchItems(tavily, naver) === 0) {
    return {
      status: 400,
      body: {
        query,
        tavily,
        naver,
        report: { error: '검색 결과가 없어 보고서를 작성할 수 없습니다.' },
      },
    };
  }

  const report = await generateReport(query, tavily, naver);

  const response = { query, tavily, naver, report };

  if (report.error && !report.title) {
    return { status: 502, body: response };
  }

  return { status: 200, body: response };
}

function getHealthResponse() {
  return {
    status: 200,
    body: {
      service: 'research-search',
      description: 'Tavily + Naver search + Gemini report',
      geminiConfigured: isGeminiConfigured(),
      model: DEFAULT_MODEL,
    },
  };
}

module.exports = {
  handleResearch,
  getHealthResponse,
  buildSearchContext,
  generateReport,
};
