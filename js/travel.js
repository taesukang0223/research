/**
 * 여행 그림일기 (2단계)
 *  1) 검색 → 분류별 소재 칩 렌더링
 *  2) 소재/날씨/가족 선택 → 그림일기 생성
 */

const travelForm = document.getElementById('travel-form');
const travelInput = document.getElementById('travel-destination');
const travelSearchBtn = document.getElementById('travel-search-btn');
const travelStatus = document.getElementById('travel-status');

const travelOptions = document.getElementById('travel-options');
const travelFeaturesEl = document.getElementById('travel-features');
const travelWeatherEl = document.getElementById('travel-weather');
const travelFamilyEl = document.getElementById('travel-family');
const travelDrawBtn = document.getElementById('travel-draw-btn');
const travelDrawStatus = document.getElementById('travel-draw-status');
const travelSendKakao = document.getElementById('travel-send-kakao');

const travelResult = document.getElementById('travel-result');
const travelImage = document.getElementById('travel-image');
const travelTitle = document.getElementById('travel-title');
const travelDiary = document.getElementById('travel-diary');
const travelHighlights = document.getElementById('travel-highlights');
const travelLink = document.getElementById('travel-link');

const FALLBACK_WEATHER = [
  { key: 'sunny', label: '맑음' },
  { key: 'cloudy', label: '흐림' },
  { key: 'rainy', label: '비' },
  { key: 'snowy', label: '눈' },
  { key: 'sunset', label: '노을' },
  { key: 'night', label: '밤' },
];

const FALLBACK_FAMILY = [
  { key: 'mom', label: '엄마' },
  { key: 'dad', label: '아빠' },
  { key: 'sister', label: '누나/언니' },
  { key: 'brother', label: '형/오빠' },
  { key: 'sibling', label: '동생' },
  { key: 'grandma', label: '할머니' },
  { key: 'grandpa', label: '할아버지' },
  { key: 'friend', label: '친구' },
];

let currentDestination = '';

function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function setStatus(el, message, type = '') {
  if (!el) return;
  if (type === 'loading') {
    el.className = 'travel-status';
    el.innerHTML = `<span class="travel-spinner">${escapeHtml(message)}</span>`;
    return;
  }
  el.className = 'travel-status' + (type ? ` ${type}` : '');
  el.textContent = message;
}

/* ── 칩 렌더링 ── */

function renderChoiceChips(container, options, { multi }) {
  container.innerHTML = options
    .map(
      (opt) => `
    <label class="travel-chip" data-key="${escapeHtml(opt.key)}">
      <input type="${multi ? 'checkbox' : 'radio'}" ${multi ? '' : 'name="travel-weather-radio"'} value="${escapeHtml(opt.key)}" />
      <span>${escapeHtml(opt.label)}</span>
    </label>`
    )
    .join('');

  container.querySelectorAll('.travel-chip').forEach((chip) => {
    const input = chip.querySelector('input');
    input.addEventListener('change', () => {
      if (!multi) {
        container.querySelectorAll('.travel-chip').forEach((c) => c.classList.remove('is-checked'));
      }
      chip.classList.toggle('is-checked', input.checked);
    });
    // 단일 선택(날씨): 이미 선택된 칩을 다시 누르면 해제
    if (!multi) {
      input.addEventListener('click', () => {
        if (chip.dataset.wasChecked === 'true') {
          input.checked = false;
          chip.classList.remove('is-checked');
        }
        container.querySelectorAll('.travel-chip').forEach((c) => (c.dataset.wasChecked = 'false'));
        chip.dataset.wasChecked = input.checked ? 'true' : 'false';
      });
    }
  });
}

function renderFeatures(categories) {
  travelFeaturesEl.innerHTML = categories
    .map(
      (cat) => `
    <div class="travel-cat">
      <div class="travel-cat-name">${escapeHtml(cat.name)}</div>
      <div class="travel-chips">
        ${cat.items
          .map(
            (item) => `
        <label class="travel-chip">
          <input type="checkbox" value="${escapeHtml(item)}" />
          <span>${escapeHtml(item)}</span>
        </label>`
          )
          .join('')}
      </div>
    </div>`
    )
    .join('');

  travelFeaturesEl.querySelectorAll('.travel-chip').forEach((chip) => {
    const input = chip.querySelector('input');
    input.addEventListener('change', () => chip.classList.toggle('is-checked', input.checked));
  });
}

function getSelectedFeatures() {
  return Array.from(travelFeaturesEl.querySelectorAll('input:checked')).map((i) => i.value);
}

function getSelectedWeather() {
  const checked = travelWeatherEl.querySelector('input:checked');
  return checked ? checked.value : '';
}

function getSelectedFamily() {
  return Array.from(travelFamilyEl.querySelectorAll('input:checked')).map((i) => i.value);
}

/* ── 1단계: 검색 ── */

async function runSearch(destination) {
  setStatus(travelStatus, '여행지 관련 소재를 찾는 중이에요…', 'loading');
  travelSearchBtn.disabled = true;
  travelOptions.hidden = true;
  travelResult.hidden = true;

  try {
    const response = await fetch('/api/travel-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ destination }),
    });
    const data = await response.json();

    if (!response.ok || !Array.isArray(data.categories) || !data.categories.length) {
      setStatus(travelStatus, data.error || '소재를 찾지 못했습니다. 여행지명을 확인해 주세요.', 'error');
      return;
    }

    currentDestination = destination;
    renderFeatures(data.categories);
    travelOptions.hidden = false;
    setStatus(travelStatus, `"${destination}" 소재를 찾았어요. 그리고 싶은 것을 골라 주세요.`, 'success');
    travelOptions.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } catch {
    setStatus(travelStatus, '서버 연결에 실패했습니다.', 'error');
  } finally {
    travelSearchBtn.disabled = false;
  }
}

/* ── 2단계: 그리기 ── */

function showResult(diary) {
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
    travelHighlights.textContent = `반영한 소재: ${diary.highlights}`;
  } else {
    travelHighlights.hidden = true;
  }

  if (diary.saved?.id != null) {
    travelLink.hidden = false;
    travelLink.href = `report?id=${encodeURIComponent(diary.saved.id)}`;
  } else {
    travelLink.hidden = true;
  }
}

async function runDraw() {
  if (!currentDestination) {
    setStatus(travelDrawStatus, '먼저 여행지를 검색해 주세요.', 'error');
    return;
  }

  const payload = {
    destination: currentDestination,
    selectedFeatures: getSelectedFeatures(),
    weather: getSelectedWeather(),
    family: getSelectedFamily(),
    sendKakao: Boolean(travelSendKakao && travelSendKakao.checked),
  };

  setStatus(travelDrawStatus, '그림일기를 그리는 중이에요… (최대 1~2분)', 'loading');
  travelDrawBtn.disabled = true;
  travelResult.hidden = true;

  try {
    const response = await fetch('/api/travel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    const diary = data.diary || {};

    if (!response.ok || diary.error) {
      setStatus(travelDrawStatus, diary.error || data.error || '그림일기 그리기에 실패했습니다.', 'error');
      if (diary.title && diary.imageUrl) showResult(diary);
      return;
    }

    showResult(diary);
    if (diary.saved?.id != null && window.loadReportList) {
      await window.loadReportList(diary.saved.id);
    }

    if (diary.kakao?.sent) {
      setStatus(travelDrawStatus, '그림일기 완성 · 카카오톡으로 전송했어요!', 'success');
    } else if (diary.kakao?.reason === 'not_connected') {
      setStatus(travelDrawStatus, '그림일기 완성 · 카카오톡 전송하려면 로그인하세요.', 'success');
      if (window.refreshKakaoStatus) await window.refreshKakaoStatus();
    } else if (diary.kakao?.error) {
      setStatus(travelDrawStatus, '그림일기 완성 · 카카오톡 전송은 실패했어요.', 'success');
    } else {
      setStatus(travelDrawStatus, '그림일기 완성!', 'success');
    }
    travelResult.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } catch {
    setStatus(travelDrawStatus, '서버 연결에 실패했습니다.', 'error');
  } finally {
    travelDrawBtn.disabled = false;
  }
}

/* ── 초기화 ── */

async function initOptions() {
  let weather = FALLBACK_WEATHER;
  let family = FALLBACK_FAMILY;
  try {
    const res = await fetch('/api/travel');
    if (res.ok) {
      const health = await res.json();
      if (Array.isArray(health.weatherOptions) && health.weatherOptions.length) weather = health.weatherOptions;
      if (Array.isArray(health.familyOptions) && health.familyOptions.length) family = health.familyOptions;
    }
  } catch {
    /* fallback 사용 */
  }
  renderChoiceChips(travelWeatherEl, weather, { multi: false });
  renderChoiceChips(travelFamilyEl, family, { multi: true });
}

if (travelForm) {
  travelForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const destination = travelInput.value.trim();
    if (!destination) {
      setStatus(travelStatus, '여행지를 입력하세요.', 'error');
      travelInput.focus();
      return;
    }
    runSearch(destination);
  });
}

if (travelDrawBtn) {
  travelDrawBtn.addEventListener('click', runDraw);
}

document.addEventListener('DOMContentLoaded', initOptions);
