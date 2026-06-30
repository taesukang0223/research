const { listReports, getReportById, getHealthResponse } = require('../lib/reports-db');

module.exports = async function handler(req, res) {
  if (req.method === 'GET') {
    if (req.query?.id) {
      const result = await getReportById(req.query.id);
      return res.status(result.status).json(result.body);
    }

    const limit = req.query?.limit;
    const result = await listReports(limit);
    return res.status(result.status).json(result.body);
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
