/**
 * Vercel Serverless handler를 Express 라우트에 연결
 */

function adaptHandler(vercelHandler) {
  return async (req, res) => {
    try {
      await vercelHandler(req, res);
    } catch (err) {
      console.error('[api]', err.message);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  };
}

module.exports = { adaptHandler };
