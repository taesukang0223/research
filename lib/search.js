/**
 * 네이버 검색 API 프록시 공통 로직 (뉴스)
 * https://developers.naver.com/docs/serviceapi/search/news/news.md
 */

const NAVER_NEWS_URL = 'https://openapi.naver.com/v1/search/news.json';

function getCredentials() {
  return {
    clientId: process.env.NAVER_CLIENT_ID || '',
    clientSecret: process.env.NAVER_CLIENT_SECRET || '',
  };
}

function isConfigured() {
  const { clientId, clientSecret } = getCredentials();
  return Boolean(
    clientId &&
    clientSecret &&
    !clientId.includes('your-naver') &&
    !clientSecret.includes('your-naver')
  );
}

function stripHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/<[^>]*>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'");
}

function formatNaverError(status, data) {
  if (status === 401) return '네이버 API 인증 실패. Client ID/Secret을 확인하세요.';
  if (status === 429) return '네이버 API 호출 한도를 초과했습니다. 잠시 후 다시 시도하세요.';
  if (data && data.errorMessage) return data.errorMessage;
  if (data && data.error) return String(data.error);
  return '네이버 뉴스 검색에 실패했습니다.';
}

function normalizeItems(items) {
  return (items || []).map((item) => ({
    title: stripHtml(item.title),
    url: item.originallink || item.link,
    link: item.link,
    content: stripHtml(item.description),
    pubDate: item.pubDate,
  }));
}

async function searchNews(query, options = {}) {
  if (!isConfigured()) {
    return {
      status: 503,
      body: { error: '네이버 API가 설정되지 않았습니다. NAVER_CLIENT_ID/SECRET을 확인하세요.' },
    };
  }

  const trimmed = (query || '').trim();
  if (!trimmed) {
    return { status: 400, body: { error: 'query 필드는 필수입니다.' } };
  }
  if (trimmed.length > 100) {
    return { status: 400, body: { error: 'query는 100자 이하여야 합니다.' } };
  }

  const display = Math.min(Math.max(Number(options.display) || 5, 1), 20);
  const sort = options.sort === 'sim' ? 'sim' : 'date';

  const { clientId, clientSecret } = getCredentials();
  const url = new URL(NAVER_NEWS_URL);
  url.searchParams.set('query', trimmed);
  url.searchParams.set('display', String(display));
  url.searchParams.set('start', '1');
  url.searchParams.set('sort', sort);

  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'X-Naver-Client-Id': clientId,
        'X-Naver-Client-Secret': clientSecret,
      },
    });

    let data;
    try {
      data = await response.json();
    } catch {
      return { status: 502, body: { error: '네이버 API 응답을 해석할 수 없습니다.' } };
    }

    if (!response.ok) {
      return {
        status: response.status,
        body: { error: formatNaverError(response.status, data) },
      };
    }

    return {
      status: 200,
      body: {
        query: trimmed,
        total: data.total,
        items: normalizeItems(data.items),
      },
    };
  } catch (err) {
    console.error('[search]', err.message);
    return { status: 502, body: { error: '네이버 API 연결에 실패했습니다.' } };
  }
}

function getHealthResponse() {
  return {
    status: 200,
    body: { service: 'naver-news-proxy', configured: isConfigured() },
  };
}

module.exports = {
  NAVER_NEWS_URL,
  isConfigured,
  stripHtml,
  searchNews,
  getHealthResponse,
};
