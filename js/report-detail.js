/**
 * 보고서 상세 — /api/reports?id= 조회 및 표시
 */

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

function getReportId() {
  return new URLSearchParams(window.location.search).get('id');
}

function showError(message) {
  document.getElementById('report-detail').hidden = true;
  const err = document.getElementById('report-error');
  err.hidden = false;
  err.textContent = message;
}

function showReport(report) {
  document.getElementById('report-error').hidden = true;
  document.getElementById('report-detail').hidden = false;

  document.title = `${report.title} — 그림일기 & 리서치 보고서 아카이브`;
  document.getElementById('detail-title').textContent = report.title || '제목 없음';
  document.getElementById('detail-topic').textContent = report.topic || '';
  document.getElementById('detail-date').textContent = formatDate(report.created_at);
  document.getElementById('detail-summary').textContent = report.summary || '(요약 없음)';
  document.getElementById('detail-content').textContent = report.content || '(본문 없음)';
  document.getElementById('detail-sources').textContent = report.sources || '(출처 없음)';

  const imageEl = document.getElementById('detail-image');
  if (imageEl) {
    if (report.image_url) {
      imageEl.src = report.image_url;
      imageEl.alt = `${report.title || '그림일기'} 그림`;
      imageEl.hidden = false;
    } else {
      imageEl.hidden = true;
    }
  }
}

async function loadReportDetail() {
  const id = getReportId();
  if (!id) {
    showError('보고서 ID가 없습니다.');
    return;
  }

  try {
    const response = await fetch(`/api/reports?id=${encodeURIComponent(id)}`);
    const data = await response.json();

    if (!response.ok) {
      showError(data.error || '보고서를 불러오지 못했습니다.');
      return;
    }

    showReport(data.report);
  } catch {
    showError('서버 연결에 실패했습니다.');
  }
}

document.addEventListener('DOMContentLoaded', loadReportDetail);
