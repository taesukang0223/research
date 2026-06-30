const { startAuthFlow, applyResponse } = require('../../lib/kakao');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const result = startAuthFlow();
  if (result.redirect) {
    return applyResponse(res, result);
  }

  return res.status(result.status).json(result.body);
};
