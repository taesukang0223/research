const { finishAuthFlow, completeAuthFlow, applyResponse } = require('../../lib/kakao');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { code, state } = req.query || {};
  const check = finishAuthFlow({
    code: typeof code === 'string' ? code : '',
    state: typeof state === 'string' ? state : '',
    cookieHeader: req.headers.cookie,
  });

  if (check.status !== 'pending') {
    return applyResponse(res, check);
  }

  const result = await completeAuthFlow(check.code);
  return applyResponse(res, result);
};
