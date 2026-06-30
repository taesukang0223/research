const { handleResearch, getHealthResponse } = require('../lib/research');

module.exports = async function handler(req, res) {
  if (req.method === 'GET') {
    const result = getHealthResponse();
    return res.status(result.status).json(result.body);
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const setCookie = [];
  const result = await handleResearch(req.body, {
    cookieHeader: req.headers.cookie,
    setCookie,
  });

  if (result.setCookie?.length) {
    res.setHeader('Set-Cookie', result.setCookie);
  }

  return res.status(result.status).json(result.body);
};
