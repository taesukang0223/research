/**
 * 카카오 로그인 + 카카오톡 "나에게 보내기" (talk memo)
 */

const KAKAO_AUTH_BASE = 'https://kauth.kakao.com';
const KAKAO_API_BASE = 'https://kapi.kakao.com';
const OAUTH_SCOPE = 'talk_message';
const REFRESH_COOKIE = 'kk_refresh';
const STATE_COOKIE = 'kk_oauth_state';
const REFRESH_MAX_AGE = 60 * 60 * 24 * 30; // 30일
const STATE_MAX_AGE = 600; // 10분

function getRestApiKey() {
  return process.env.KAKAO_REST_API_KEY || '';
}

function getClientSecret() {
  return process.env.KAKAO_CLIENT_SECRET || '';
}

function getRedirectUri() {
  return process.env.KAKAO_REDIRECT_URI || '';
}

function getAppBaseUrl() {
  const fromEnv = process.env.APP_BASE_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return `http://localhost:${process.env.PORT || 3000}`;
}

function isConfigured() {
  const key = getRestApiKey();
  const uri = getRedirectUri();
  return Boolean(
    key &&
      uri &&
      !key.includes('your-kakao') &&
      !uri.includes('your-')
  );
}

function isSecureCookie() {
  return process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);
}

function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader || typeof cookieHeader !== 'string') return cookies;

  cookieHeader.split(';').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx === -1) return;
    const name = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (name) cookies[name] = decodeURIComponent(value);
  });

  return cookies;
}

function buildCookie(name, value, maxAge) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
  ];
  if (isSecureCookie()) parts.push('Secure');
  return parts.join('; ');
}

function buildClearCookie(name) {
  const parts = [`${name}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (isSecureCookie()) parts.push('Secure');
  return parts.join('; ');
}

function randomState() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}

function truncate(text, max) {
  const clean = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1)}…`;
}

function buildReportUrl(reportId) {
  return `${getAppBaseUrl()}/report.html?id=${encodeURIComponent(reportId)}`;
}

function buildAuthUrl(state) {
  const params = new URLSearchParams({
    client_id: getRestApiKey(),
    redirect_uri: getRedirectUri(),
    response_type: 'code',
    scope: OAUTH_SCOPE,
    state,
  });
  return `${KAKAO_AUTH_BASE}/oauth/authorize?${params.toString()}`;
}

async function requestToken(bodyParams) {
  const params = new URLSearchParams({
    client_id: getRestApiKey(),
    ...bodyParams,
  });

  const secret = getClientSecret();
  if (secret && !secret.includes('your-kakao')) {
    params.set('client_secret', secret);
  }

  const response = await fetch(`${KAKAO_AUTH_BASE}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
    body: params.toString(),
  });

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error('카카오 토큰 응답을 해석할 수 없습니다.');
  }

  if (!response.ok) {
    const message = data.error_description || data.error || '카카오 토큰 발급에 실패했습니다.';
    throw new Error(message);
  }

  return data;
}

async function exchangeCode(code) {
  return requestToken({
    grant_type: 'authorization_code',
    redirect_uri: getRedirectUri(),
    code,
  });
}

async function refreshAccessToken(refreshToken) {
  return requestToken({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });
}

function buildMemoTemplate({ title, summary, reportUrl }) {
  const safeTitle = truncate(title, 80) || '방산 리서치 보고서';
  const safeSummary = truncate(summary, 180) || '(요약 없음)';

  return {
    object_type: 'feed',
    content: {
      title: safeTitle,
      description: safeSummary,
      link: {
        web_url: reportUrl,
        mobile_web_url: reportUrl,
      },
    },
    buttons: [
      {
        title: '보고서 상세 보기',
        link: {
          web_url: reportUrl,
          mobile_web_url: reportUrl,
        },
      },
    ],
  };
}

async function sendMemo(accessToken, templateObject) {
  const params = new URLSearchParams({
    template_object: JSON.stringify(templateObject),
  });

  const response = await fetch(`${KAKAO_API_BASE}/v2/api/talk/memo/default/send`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
    },
    body: params.toString(),
  });

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const message =
      data?.msg ||
      data?.error_description ||
      data?.error ||
      '카카오톡 메시지 전송에 실패했습니다.';
    throw new Error(message);
  }

  return { ok: true };
}

function startAuthFlow() {
  if (!isConfigured()) {
    return {
      status: 503,
      body: { error: '카카오 API가 설정되지 않았습니다.' },
    };
  }

  const state = randomState();
  return {
    status: 302,
    redirect: buildAuthUrl(state),
    cookies: [buildCookie(STATE_COOKIE, state, STATE_MAX_AGE)],
  };
}

function finishAuthFlow({ code, state, cookieHeader }) {
  if (!isConfigured()) {
    return {
      status: 302,
      redirect: '/?kakao=error&reason=not_configured',
      cookies: [buildClearCookie(STATE_COOKIE)],
    };
  }

  const cookies = parseCookies(cookieHeader);
  const savedState = cookies[STATE_COOKIE];

  if (!code) {
    return {
      status: 302,
      redirect: '/?kakao=error&reason=no_code',
      cookies: [buildClearCookie(STATE_COOKIE)],
    };
  }

  if (!state || !savedState || state !== savedState) {
    return {
      status: 302,
      redirect: '/?kakao=error&reason=invalid_state',
      cookies: [buildClearCookie(STATE_COOKIE)],
    };
  }

  return { status: 'pending', code };
}

async function completeAuthFlow(code) {
  try {
    const tokenData = await exchangeCode(code);
    if (!tokenData.refresh_token) {
      return {
        status: 302,
        redirect: '/?kakao=error&reason=no_refresh_token',
        cookies: [buildClearCookie(STATE_COOKIE)],
      };
    }

    return {
      status: 302,
      redirect: '/?kakao=connected',
      cookies: [
        buildCookie(REFRESH_COOKIE, tokenData.refresh_token, REFRESH_MAX_AGE),
        buildClearCookie(STATE_COOKIE),
      ],
    };
  } catch (err) {
    console.error('[kakao/auth]', err.message);
    return {
      status: 302,
      redirect: '/?kakao=error&reason=token_failed',
      cookies: [buildClearCookie(STATE_COOKIE)],
    };
  }
}

function getConnectionStatus(cookieHeader) {
  const cookies = parseCookies(cookieHeader);
  return {
    configured: isConfigured(),
    connected: Boolean(cookies[REFRESH_COOKIE]),
    redirectUri: getRedirectUri(),
    appBaseUrl: getAppBaseUrl(),
  };
}

function logout() {
  return {
    status: 200,
    body: { ok: true },
    cookies: [buildClearCookie(REFRESH_COOKIE), buildClearCookie(STATE_COOKIE)],
  };
}

async function trySendReportMemo(cookieHeader, { title, summary, reportId }) {
  if (!isConfigured()) {
    return { sent: false, skipped: true, reason: 'not_configured' };
  }

  const cookies = parseCookies(cookieHeader);
  const refreshToken = cookies[REFRESH_COOKIE];
  if (!refreshToken) {
    return { sent: false, reason: 'not_connected' };
  }

  try {
    const tokenData = await refreshAccessToken(refreshToken);
    const accessToken = tokenData.access_token;
    if (!accessToken) {
      return { sent: false, reason: 'token_failed', error: '액세스 토큰을 받지 못했습니다.' };
    }

    const reportUrl = buildReportUrl(reportId);
    const template = buildMemoTemplate({ title, summary, reportUrl });
    await sendMemo(accessToken, template);

    const result = { sent: true, reportUrl };
    if (tokenData.refresh_token) {
      result.refreshCookie = buildCookie(REFRESH_COOKIE, tokenData.refresh_token, REFRESH_MAX_AGE);
    }
    return result;
  } catch (err) {
    console.error('[kakao/send]', err.message);
    return { sent: false, reason: 'send_failed', error: err.message };
  }
}

function getHealthResponse() {
  return {
    status: 200,
    body: {
      service: 'kakao-talk-memo',
      configured: isConfigured(),
      redirectUri: getRedirectUri(),
      appBaseUrl: getAppBaseUrl(),
    },
  };
}

function applyResponse(res, result) {
  if (result.cookies?.length) {
    res.setHeader('Set-Cookie', result.cookies);
  }

  if (result.redirect) {
    return res.status(result.status || 302).redirect(result.redirect);
  }

  return res.status(result.status).json(result.body);
}

module.exports = {
  REFRESH_COOKIE,
  STATE_COOKIE,
  getAppBaseUrl,
  isConfigured,
  startAuthFlow,
  finishAuthFlow,
  completeAuthFlow,
  getConnectionStatus,
  logout,
  trySendReportMemo,
  getHealthResponse,
  applyResponse,
  buildReportUrl,
};
