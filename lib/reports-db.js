/**
 * reports 테이블 CRUD
 */

const { isConfigured, restRequest } = require('./supabase');

async function saveReport({ topic, title, summary, content, sources, source_type = 'search', image_url = null }) {
  const row = {
    topic: String(topic || '').trim(),
    title: String(title || '').trim(),
    summary: summary || null,
    content: content || null,
    sources: sources || null,
    source_type,
    image_url: image_url || null,
  };

  if (!row.topic || !row.title) {
    return { status: 400, body: { error: 'topic과 title은 필수입니다.' } };
  }

  const result = await restRequest('reports', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(row),
  });

  if (!result.ok) {
    const message =
      result.data?.message ||
      result.data?.error ||
      result.data?.hint ||
      '보고서 저장에 실패했습니다.';
    console.error('[reports] save failed:', message);
    return { status: result.status >= 400 ? result.status : 502, body: { error: message } };
  }

  const saved = Array.isArray(result.data) ? result.data[0] : result.data;
  return { status: 201, body: saved };
}

async function listReports(limit = 50) {
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
  const query = new URLSearchParams({
    select: 'id,topic,title,summary,source_type,image_url,created_at',
    order: 'created_at.desc',
    limit: String(safeLimit),
  });

  const result = await restRequest(`reports?${query.toString()}`, { method: 'GET' });

  if (!result.ok) {
    const message = result.data?.message || result.data?.error || '보고서 목록 조회에 실패했습니다.';
    return { status: result.status >= 400 ? result.status : 502, body: { error: message } };
  }

  return { status: 200, body: { reports: result.data || [] } };
}

async function getReportById(id) {
  const numId = Number(id);
  if (!Number.isInteger(numId) || numId <= 0) {
    return { status: 400, body: { error: '유효하지 않은 ID입니다.' } };
  }

  const query = new URLSearchParams({
    select: '*',
    id: `eq.${numId}`,
    limit: '1',
  });

  const result = await restRequest(`reports?${query.toString()}`, { method: 'GET' });

  if (!result.ok) {
    const message = result.data?.message || result.data?.error || '보고서 조회에 실패했습니다.';
    return { status: result.status >= 400 ? result.status : 502, body: { error: message } };
  }

  const row = Array.isArray(result.data) ? result.data[0] : null;
  if (!row) {
    return { status: 404, body: { error: '보고서를 찾을 수 없습니다.' } };
  }

  return { status: 200, body: { report: row } };
}

function getHealthResponse() {
  return {
    status: 200,
    body: { service: 'reports-db', configured: isConfigured() },
  };
}

module.exports = {
  saveReport,
  listReports,
  getReportById,
  getHealthResponse,
};
