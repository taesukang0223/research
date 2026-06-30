/**
 * Tavily + 네이버 통합 리서치 검색
 */

const { handleSearch } = require('./tavily');
const { searchNews } = require('./search');

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

  const response = {
    query,
    tavily: tavilyResult.status === 200 ? tavilyResult.body : { error: tavilyResult.body?.error },
    naver: naverResult.status === 200 ? naverResult.body : { error: naverResult.body?.error },
  };

  if (tavilyResult.status !== 200 && naverResult.status !== 200) {
    return { status: 502, body: response };
  }

  return { status: 200, body: response };
}

function getHealthResponse() {
  return {
    status: 200,
    body: { service: 'research-search', description: 'Tavily + Naver combined search' },
  };
}

module.exports = {
  handleResearch,
  getHealthResponse,
};
