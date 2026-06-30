/**
 * 카카오 로그인 상태 표시 및 로그인/로그아웃
 */

const kakaoBox = document.getElementById('kakao-auth');
const kakaoStatusEl = document.getElementById('kakao-auth-status');
const kakaoLoginBtn = document.getElementById('kakao-login-btn');
const kakaoLogoutBtn = document.getElementById('kakao-logout-btn');

function setKakaoMessage(message, type = '') {
  if (!kakaoStatusEl) return;
  kakaoStatusEl.textContent = message;
  kakaoStatusEl.className = 'kakao-auth-status' + (type ? ` ${type}` : '');
}

function showLoginButton(show) {
  if (kakaoLoginBtn) kakaoLoginBtn.hidden = !show;
  if (kakaoLogoutBtn) kakaoLogoutBtn.hidden = show;
}

async function refreshKakaoStatus() {
  if (!kakaoBox) return { connected: false, configured: false };

  try {
    const response = await fetch('/api/kakao/status', { credentials: 'same-origin' });
    const data = await response.json();

    if (!data.configured) {
      kakaoBox.hidden = true;
      return data;
    }

    kakaoBox.hidden = false;

    if (data.connected) {
      setKakaoMessage('카카오톡 연결됨 — 보고서 완성 시 나에게 보내기로 전송합니다.', 'connected');
      showLoginButton(false);
    } else {
      setKakaoMessage('카카오 로그인 후 보고서를 카카오톡으로 받을 수 있습니다.', '');
      showLoginButton(true);
    }

    return data;
  } catch {
    setKakaoMessage('카카오 연결 상태를 확인하지 못했습니다.', 'error');
    showLoginButton(true);
    return { connected: false, configured: true };
  }
}

function cleanKakaoQueryParams() {
  const params = new URLSearchParams(window.location.search);
  if (!params.has('kakao')) return null;

  const kakao = params.get('kakao');
  const reason = params.get('reason') || '';
  const detail = params.get('detail') || '';

  params.delete('kakao');
  params.delete('reason');
  params.delete('detail');
  const next = params.toString();
  window.history.replaceState({}, '', `${window.location.pathname}${next ? `?${next}` : ''}`);

  return { kakao, reason, detail };
}

function showKakaoCallbackMessage({ kakao, reason, detail }, status) {
  if (kakao === 'connected') {
    if (status.connected) {
      setKakaoMessage('카카오 로그인 완료! 이제 보고서가 카카오톡으로 전송됩니다.', 'connected');
      showLoginButton(false);
      return;
    }
    setKakaoMessage(
      '카카오 로그인은 완료됐지만 세션 저장에 실패했습니다. 브라우저 쿠키를 허용하고 다시 로그인해 주세요.',
      'error'
    );
    showLoginButton(true);
    return;
  }

  if (kakao === 'error') {
    const messages = {
      invalid_state: '카카오 로그인 세션이 만료되었습니다. 다시 시도해 주세요.',
      token_failed: '카카오 토큰 발급에 실패했습니다. REST API 키와 Client Secret을 확인해 주세요.',
      no_refresh_token: '카카오 토큰을 받지 못했습니다. 카카오 로그인 고급 설정에서 Refresh Token을 활성화해 주세요.',
      not_configured: '카카오 API 환경변수가 설정되지 않았습니다.',
      no_code: '카카오 인증 코드가 없습니다. 다시 로그인해 주세요.',
    };
    const base = messages[reason] || '카카오 로그인에 실패했습니다. 다시 시도해 주세요.';
    setKakaoMessage(detail ? `${base} (${detail})` : base, 'error');
    showLoginButton(true);
  }
}

async function logoutKakao() {
  try {
    await fetch('/api/kakao/logout', { method: 'POST', credentials: 'same-origin' });
  } catch {
    /* ignore */
  }
  await refreshKakaoStatus();
}

if (kakaoLogoutBtn) {
  kakaoLogoutBtn.addEventListener('click', (event) => {
    event.preventDefault();
    logoutKakao();
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  const callback = cleanKakaoQueryParams();
  const status = await refreshKakaoStatus();

  if (callback) {
    showKakaoCallbackMessage(callback, status);
  }
});

window.refreshKakaoStatus = refreshKakaoStatus;
