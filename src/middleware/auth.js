const { verifyAccess } = require('../utils/jwt');
const { pool }         = require('../config/db');

module.exports = async function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) return res.status(401).json({ error: 'No access token provided.' });

  try {
    const decoded = verifyAccess(token);

    // Check account is still active
    const [rows] = await pool.query(
      'SELECT id, is_active FROM users WHERE id = ?',
      [decoded.sub]
    );
    if (!rows.length || !rows[0].is_active) {
      return res.status(401).json({ error: 'Account inactive or deleted.' });
    }

    req.user = { id: decoded.sub, email: decoded.email };
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Access token expired.', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ error: 'Invalid access token.' });
  }
};
