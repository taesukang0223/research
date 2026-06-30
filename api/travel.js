const { handleTravel, handleTravelSearch, getHealthResponse } = require('../lib/travel');

module.exports = async function handler(req, res) {
  if (req.method === 'GET') {
    const result = getHealthResponse();
    return res.status(result.status).json(result.body);
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 1단계(검색·소재 추출)와 2단계(그리기)를 하나의 함수로 통합
  // (Vercel Hobby 플랜 서버리스 함수 12개 제한 대응)
  if (req.body?.mode === 'search') {
    const result = await handleTravelSearch(req.body);
    return res.status(result.status).json(result.body);
  }

  const setCookie = [];
  const result = await handleTravel(req.body, {
    cookieHeader: req.headers.cookie,
    setCookie,
  });

  if (result.setCookie?.length) {
    res.setHeader('Set-Cookie', result.setCookie);
  }

  return res.status(result.status).json(result.body);
};
