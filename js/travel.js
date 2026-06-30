/**
 * 여행 그림일기 — /api/travel 호출, 그림 생성 결과 표시
 */

const travelForm = document.getElementById('travel-form');
const travelInput = document.getElementById('travel-destination');
const travelSubmit = document.getElementById('travel-submit');
const travelSendKakao = document.getElementById('travel-send-kakao');
const travelStatus = document.getElementById('travel-status');
const travelResult = document.getElementById('travel-result');
const travelImage = document.getElementById('travel-image');
const travelTitle = document.getElementById('travel-title');
const travelDiary = document.getElementById('travel-diary');
const travelHighlights = document.getElementById('travel-highlights');
const travelLink = document.getElementById('travel-link');

function setTravelStatus(message, type = '') {
  if (!travelStatus) return;
  if (type === 'loading') {
    travelStatus.className = 'travel-status';
    travelStatus.innerHTML = `<span class="travel-spinner">${message}</span>`;
    return;
  }
  travelStatus.className = 'travel-status' + (type ? ` ${type}` : '');
  travelStatus.textContent = message;
}

function showTravelResult(diary) {
  travelResult.hidden = false;

  if (diary.imageUrl) {
    travelImage.src = diary.imageUrl;
    travelImage.hidden = false;
  } else {
    travelImage.hidden = true;
  }

  travelTitle.textContent = diary.title || '여행 그림일기';
  travelDiary.textContent = diary.summary || '';

  if (diary.highlights) {
    travelHighlights.hidden = false;
    travelHighlights.textContent = `명소·특징: ${diary.highlights}`;
  } else {
    travelHighlights.hidden = true;
  }

  if (diary.saved?.id != null) {
    travelLink.hidden = false;
    travelLink.href = `report.html?id=${encodeURIComponent(diary.saved.id)}`;
  } else {
    travelLink.hidden = true;
  }
}

async function runTravel(destination) {
  const sendKakao = Boolean(travelSendKakao && travelSendKakao.checked);

  setTravelStatus('여행지를 조사하고 그림을 그리는 중이에요… (최대 1~2분)', 'loading');
  travelSubmit.disabled = true;
  travelResult.hidden = true;

  try {
    const response = await fetch('/api/travel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ destination, sendKakao }),
    });

    const data = await response.json();
    const diary = data.diary || {};

    if (!response.ok || diary.error) {
      setTravelStatus(diary.error || data.error || '그림일기 만들기에 실패했습니다.', 'error');
      if (diary.title && diary.imageUrl) showTravelResult(diary);
      return;
    }

    showTravelResult(diary);

    if (diary.saved?.id != null && window.loadReportList) {
      await window.loadReportList(diary.saved.id);
    }

    if (diary.kakao?.sent) {
      setTravelStatus(`"${destination}" 그림일기 완성 · 카카오톡으로 전송했어요!`, 'success');
    } else if (diary.kakao?.reason === 'not_connected') {
      setTravelStatus(`"${destination}" 그림일기 완성 · 카카오톡 전송하려면 로그인하세요.`, 'success');
      if (window.refreshKakaoStatus) await window.refreshKakaoStatus();
    } else if (diary.kakao?.error) {
      setTravelStatus(`"${destination}" 그림일기 완성 · 카카오톡 전송은 실패했어요.`, 'success');
    } else {
      setTravelStatus(`"${destination}" 그림일기 완성!`, 'success');
    }
  } catch {
    setTravelStatus('서버 연결에 실패했습니다.', 'error');
  } finally {
    travelSubmit.disabled = false;
  }
}

if (travelForm) {
  travelForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const destination = travelInput.value.trim();
    if (!destination) {
      setTravelStatus('여행지를 입력하세요.', 'error');
      travelInput.focus();
      return;
    }
    runTravel(destination);
  });
}
