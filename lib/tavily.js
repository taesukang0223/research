/**
 * Tavily API 프록시 공통 로직
 */

const TAVILY_API_URL = 'https://api.tavily.com/search';

function getApiKey() {
  return process.env.TAVILY_API_KEY || '';
}

function isConfigured() {
  const key = getApiKey();
  return Boolean(key && !key.includes('your-api-key'));
}

function formatApiError(data) {
  if (!data) return 'Tavily API 요청 실패';

  const raw = data.detail ?? data.error ?? data.message;
  if (typeof raw === 'string') return raw;

  if (Array.isArray(raw)) {
    return raw
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object') return item.msg || item.message || JSON.stringify(item);
        return String(item);
      })
      .join('; ');
  }

  if (raw && typeof raw === 'object') {
    return raw.msg || raw.message || JSON.stringify(raw);
  }

  return 'Tavily API 요청 실패';
}

function buildSearchPayload(body) {
  if (!isConfigured()) {
    return {
      error: { status: 503, body: { error: 'Tavily API가 설정되지 않았습니다. 서버 관리자에게 문의하세요.' } },
    };
  }

  const { query, search_depth, max_results, include_domains, exclude_domains } = body || {};

  if (!query || typeof query !== 'string' || !query.trim()) {
    return { error: { status: 400, body: { error: 'query 필드는 필수입니다.' } } };
  }

  if (query.length > 500) {
    return { error: { status: 400, body: { error: 'query는 500자 이하여야 합니다.' } } };
  }

  const payload = {
    api_key: getApiKey(),
    query: query.trim(),
    search_depth: search_depth === 'advanced' ? 'advanced' : 'basic',
    max_results: Math.min(Math.max(Number(max_results) || 5, 1), 20),
  };

  if (Array.isArray(include_domains) && include_domains.length > 0) {
    payload.include_domains = include_domains.slice(0, 10);
  }
  if (Array.isArray(exclude_domains) && exclude_domains.length > 0) {
    payload.exclude_domains = exclude_domains.slice(0, 10);
  }

  return { payload };
}

async function searchTavily(payload) {
  const response = await fetch(TAVILY_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  let data;
  try {
    data = await response.json();
  } catch {
    return { status: 502, body: { error: 'Tavily API 응답을 해석할 수 없습니다.' } };
  }

  if (!response.ok) {
    return {
      status: response.status,
      body: { error: formatApiError(data) },
    };
  }

  return { status: 200, body: data };
}

async function handleSearch(body) {
  const built = buildSearchPayload(body);
  if (built.error) return built.error;

  try {
    return await searchTavily(built.payload);
  } catch (err) {
    console.error('[tavily]', err.message);
    return { status: 502, body: { error: 'Tavily API 연결에 실패했습니다.' } };
  }
}

function getHealthResponse() {
  return {
    status: 200,
    body: { service: 'tavily-proxy', configured: isConfigured() },
  };
}

module.exports = {
  TAVILY_API_URL,
  getApiKey,
  isConfigured,
  formatApiError,
  buildSearchPayload,
  searchTavily,
  handleSearch,
  getHealthResponse,
};
