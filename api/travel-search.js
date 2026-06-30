const { handleTravelSearch } = require('../lib/travel');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const result = await handleTravelSearch(req.body);
  return res.status(result.status).json(result.body);
};
