const { handleAnalyzeFileRequest, getHealthResponse } = require('../lib/analyze-file');

module.exports = async function handler(req, res) {
  if (req.method === 'GET') {
    const result = getHealthResponse();
    return res.status(result.status).json(result.body);
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const result = await handleAnalyzeFileRequest(req);
  return res.status(result.status).json(result.body);
};
