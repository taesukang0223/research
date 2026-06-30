const { logout, applyResponse } = require('../../lib/kakao');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  return applyResponse(res, logout());
};
