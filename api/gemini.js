const { handleGenerate, getHealthResponse } = require('../lib/gemini');

module.exports = async function handler(req, res) {
  if (req.method === 'GET') {
    const result = getHealthResponse();
    return res.status(result.status).json(result.body);
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const result = await handleGenerate(req.body);
  return res.status(result.status).json(result.body);
};
