/**
 * 보고서 목록 — /api/reports 조회 및 렌더링
 */

const reportListEl = document.getElementById('report-list');

function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function truncate(text, max = 120) {
  const clean = String(text || '').trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max)}…`;
}

function renderEmptyList() {
  reportListEl.innerHTML = `
    <li class="empty-state">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
        <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
      </svg>
      <p>등록된 보고서가 없습니다.</p>
    </li>`;
}

function renderReportList(reports) {
  if (!Array.isArray(reports) || !reports.length) {
    renderEmptyList();
    return;
  }

  reportListEl.innerHTML = reports
    .map(
      (item) => `
    <li class="report-list-item${item._highlight ? ' is-new' : ''}">
      <a class="report-list-link" href="report.html?id=${encodeURIComponent(item.id)}">
        <h3 class="report-list-title">${escapeHtml(item.title)}</h3>
        <p class="report-list-meta">
          <span class="report-list-topic">${escapeHtml(item.topic)}</span>
          <span class="report-list-date">${escapeHtml(formatDate(item.created_at))}</span>
        </p>
        ${item.summary ? `<p class="report-list-summary">${escapeHtml(truncate(item.summary))}</p>` : ''}
      </a>
    </li>`
    )
    .join('');
}

async function loadReportList(highlightId) {
  try {
    const response = await fetch('/api/reports');
    const data = await response.json();

    if (!response.ok) {
      reportListEl.innerHTML = `<li class="report-list-error">${escapeHtml(data.error || '목록을 불러오지 못했습니다.')}</li>`;
      return;
    }

    const reports = (data.reports || []).map((item) => ({
      ...item,
      _highlight: highlightId != null && item.id === highlightId,
    }));

    renderReportList(reports);
  } catch {
    reportListEl.innerHTML = '<li class="report-list-error">목록을 불러오지 못했습니다.</li>';
  }
}

window.loadReportList = loadReportList;

document.addEventListener('DOMContentLoaded', () => {
  loadReportList();
});
