const { renderReportPage } = require('../lib/report-page');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const id = req.query?.id;
  const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const host = (req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  const baseUrl = host ? `${proto}://${host}` : '';

  try {
    const html = await renderReportPage(id, baseUrl);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300');
    return res.status(200).send(html);
  } catch (err) {
    console.error('[report-view]', err.message);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(500).send('<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><title>오류</title></head><body><p>페이지를 불러오지 못했습니다.</p><p><a href="/">홈으로</a></p></body></html>');
  }
};
