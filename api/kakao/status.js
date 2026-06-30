const { getConnectionStatus, getHealthResponse } = require('../../lib/kakao');

module.exports = async function handler(req, res) {
  if (req.method === 'GET') {
    const statusOnly = req.query?.health === '1';
    if (statusOnly) {
      const health = getHealthResponse();
      return res.status(health.status).json(health.body);
    }

    return res.status(200).json(getConnectionStatus(req.headers.cookie));
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
