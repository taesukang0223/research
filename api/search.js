const { searchNews, getHealthResponse } = require('../lib/search');

module.exports = async function handler(req, res) {
  if (req.method === 'GET') {
    const result = getHealthResponse();
    return res.status(result.status).json(result.body);
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { query, display, sort } = req.body || {};
  const result = await searchNews(query, { display, sort });
  return res.status(result.status).json(result.body);
};
