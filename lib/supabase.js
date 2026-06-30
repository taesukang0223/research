/**
 * Supabase REST API (서버 전용)
 */

function getConfig() {
  const url = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const anonKey = process.env.SUPABASE_ANON_KEY || '';
  const key = serviceKey || anonKey;

  const configured = Boolean(
    url &&
    key &&
    !url.includes('your-project') &&
    !key.includes('your-')
  );

  return { url, key, configured, usingServiceRole: Boolean(serviceKey) };
}

function isConfigured() {
  return getConfig().configured;
}

async function restRequest(path, options = {}) {
  const { url, key, configured } = getConfig();

  if (!configured) {
    return {
      ok: false,
      status: 503,
      data: { error: 'Supabase가 설정되지 않았습니다. SUPABASE_URL 및 API 키를 확인하세요.' },
    };
  }

  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    ...options.headers,
  };

  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...options,
    headers,
  });

  let data;
  const text = await response.text();
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { error: text || 'Supabase 응답 파싱 실패' };
  }

  return { ok: response.ok, status: response.status, data };
}

module.exports = {
  getConfig,
  isConfigured,
  restRequest,
};
