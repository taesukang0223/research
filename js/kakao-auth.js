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

function handleKakaoQueryParams() {
  const params = new URLSearchParams(window.location.search);
  const kakao = params.get('kakao');

  if (!kakao) return;

  if (kakao === 'connected') {
    setKakaoMessage('카카오 로그인 완료! 이제 보고서가 카카오톡으로 전송됩니다.', 'connected');
    showLoginButton(false);
  } else if (kakao === 'error') {
    setKakaoMessage('카카오 로그인에 실패했습니다. 다시 시도해 주세요.', 'error');
    showLoginButton(true);
  }

  params.delete('kakao');
  params.delete('reason');
  const next = params.toString();
  const newUrl = `${window.location.pathname}${next ? `?${next}` : ''}`;
  window.history.replaceState({}, '', newUrl);
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
  handleKakaoQueryParams();
  await refreshKakaoStatus();
});

window.refreshKakaoStatus = refreshKakaoStatus;
