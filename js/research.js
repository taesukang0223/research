/**
 * 리서치 실행 — /api/research 호출 및 결과 표시
 */

const form = document.getElementById('research-form');
const keywordInput = document.getElementById('topic-keyword');
const submitBtn = document.getElementById('research-submit');
const statusEl = document.getElementById('research-status');
const resultsSection = document.getElementById('research-results');
const tavilyEl = document.getElementById('tavily-results');
const naverEl = document.getElementById('naver-results');

function setStatus(message, type = '') {
  statusEl.textContent = message;
  statusEl.className = 'research-status' + (type ? ` ${type}` : '');
}

function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderError(message) {
  return `<p class="result-error">${escapeHtml(message)}</p>`;
}

function renderTavily(data) {
  if (data.error) return renderError(data.error);

  const items = Array.isArray(data.results) ? data.results : [];
  if (!items.length) return '<p class="result-empty">검색 결과가 없습니다.</p>';

  return items
    .map(
      (item, i) => `
    <article class="result-item">
      <h4>${i + 1}. ${escapeHtml(item.title || '(제목 없음)')}</h4>
      ${item.url ? `<p class="result-url"><a href="${escapeHtml(item.url)}" target="_blank" rel="noopener">${escapeHtml(item.url)}</a></p>` : ''}
      ${item.content ? `<p class="result-snippet">${escapeHtml(item.content)}</p>` : ''}
      ${item.score != null ? `<p class="result-meta">score: ${escapeHtml(item.score)}</p>` : ''}
    </article>`
    )
    .join('');
}

function renderNaver(data) {
  if (data.error) return renderError(data.error);

  const items = Array.isArray(data.items) ? data.items : [];
  if (!items.length) return '<p class="result-empty">검색 결과가 없습니다.</p>';

  return items
    .map(
      (item, i) => `
    <article class="result-item">
      <h4>${i + 1}. ${escapeHtml(item.title || '(제목 없음)')}</h4>
      ${item.url ? `<p class="result-url"><a href="${escapeHtml(item.url)}" target="_blank" rel="noopener">${escapeHtml(item.url)}</a></p>` : ''}
      ${item.content ? `<p class="result-snippet">${escapeHtml(item.content)}</p>` : ''}
      ${item.pubDate ? `<p class="result-meta">${escapeHtml(item.pubDate)}</p>` : ''}
    </article>`
    )
    .join('');
}

async function runResearch(keyword) {
  setStatus('검색 중…');
  submitBtn.disabled = true;
  resultsSection.hidden = true;

  try {
    const response = await fetch('/api/research', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: keyword }),
    });

    const data = await response.json();

    if (!response.ok) {
      setStatus(data.error || '검색에 실패했습니다.', 'error');
      tavilyEl.innerHTML = renderTavily(data.tavily || { error: '—' });
      naverEl.innerHTML = renderNaver(data.naver || { error: '—' });
      resultsSection.hidden = false;
      return;
    }

    tavilyEl.innerHTML = renderTavily(data.tavily || {});
    naverEl.innerHTML = renderNaver(data.naver || {});
    resultsSection.hidden = false;
    setStatus(`"${keyword}" 검색 완료`, 'success');
  } catch {
    setStatus('서버 연결에 실패했습니다.', 'error');
  } finally {
    submitBtn.disabled = false;
  }
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const keyword = keywordInput.value.trim();
  if (!keyword) {
    setStatus('주제 키워드를 입력하세요.', 'error');
    keywordInput.focus();
    return;
  }
  runResearch(keyword);
});
