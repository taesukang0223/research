/**
 * 리서치 실행 — /api/research 호출 및 결과·보고서 표시
 */

const form = document.getElementById('research-form');
const keywordInput = document.getElementById('topic-keyword');
const submitBtn = document.getElementById('research-submit');
const statusEl = document.getElementById('research-status');
const resultsSection = document.getElementById('research-results');
const tavilyEl = document.getElementById('tavily-results');
const naverEl = document.getElementById('naver-results');
const reportSection = document.getElementById('research-report');
const reportContent = document.getElementById('report-content');
const reportError = document.getElementById('report-error');
const reportTitle = document.getElementById('report-title');
const reportSummary = document.getElementById('report-summary');
const reportBody = document.getElementById('report-body');
const reportSources = document.getElementById('report-sources');

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

function hideReport() {
  reportSection.hidden = true;
  reportContent.hidden = false;
  reportError.hidden = true;
  reportError.textContent = '';
}

function showReportError(message) {
  reportSection.hidden = false;
  reportContent.hidden = true;
  reportError.hidden = false;
  reportError.textContent = message;
}

function showReport(report) {
  reportSection.hidden = false;
  reportContent.hidden = false;
  reportError.hidden = true;
  reportError.textContent = '';

  reportTitle.textContent = report.title || '제목 없음';
  reportSummary.textContent = report.summary || '(요약 없음)';
  reportBody.textContent = report.body || '(본문 없음)';
  reportSources.textContent = report.sources || '(출처 없음)';
}

async function runResearch(keyword) {
  setStatus('검색 및 보고서 작성 중…');
  submitBtn.disabled = true;
  resultsSection.hidden = true;
  hideReport();

  try {
    const response = await fetch('/api/research', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: keyword }),
    });

    const data = await response.json();

    tavilyEl.innerHTML = renderTavily(data.tavily || {});
    naverEl.innerHTML = renderNaver(data.naver || {});
    resultsSection.hidden = false;

    if (data.report?.error && !data.report?.title) {
      showReportError(data.report.error);
      setStatus(data.report.error, 'error');
      return;
    }

    if (!response.ok) {
      setStatus(data.report?.saveError || data.error || '리서치에 실패했습니다.', 'error');
      if (data.report?.error) showReportError(data.report.error);
      else if (data.report?.saveError) showReportError(data.report.saveError);
      if (data.report?.title) showReport(data.report);
      return;
    }

    if (data.report) {
      showReport(data.report);
    }

    if (data.report?.saved?.id != null) {
      await window.loadReportList(data.report.saved.id);
    }

    setStatus(`"${keyword}" 리서치 완료`, 'success');
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
