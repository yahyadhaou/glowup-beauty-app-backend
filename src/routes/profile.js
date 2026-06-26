const express  = require('express');
const { body } = require('express-validator');
const { pool } = require('../config/db');
const auth     = require('../middleware/auth');
const validate = require('../middleware/validate');
const { hashPassword, comparePassword } = require('../utils/hash');
const { hashToken } = require('../utils/jwt');

const router = express.Router();

// GET /profile/me
router.get('/me', auth, async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, full_name, email, phone, avatar_url, lang, is_verified, created_at FROM users WHERE id = ?',
      [req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found.' });
    res.json({ user: rows[0] });
  } catch (err) { next(err); }
});

// PATCH /profile/me
router.patch('/me', auth,
  body('full_name').optional().trim().isLength({ min: 1, max: 100 }),
  body('phone').optional().isMobilePhone(),
  body('lang').optional().isIn(['en', 'de']),
  validate,
  async (req, res, next) => {
    try {
      const { full_name, phone, lang } = req.body;
      await pool.query(
        'UPDATE users SET full_name = COALESCE(?, full_name), phone = COALESCE(?, phone), lang = COALESCE(?, lang) WHERE id = ?',
        [full_name, phone, lang, req.user.id]
      );
      res.json({ message: 'Profile updated.' });
    } catch (err) { next(err); }
  }
);

// PATCH /profile/change-password
router.patch('/change-password', auth,
  body('current_password').notEmpty(),
  body('new_password').isLength({ min: 8 }).matches(/[A-Z]/).matches(/[0-9]/),
  validate,
  async (req, res, next) => {
    try {
      const [rows] = await pool.query('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
      const valid = await comparePassword(req.body.current_password, rows[0].password_hash);
      if (!valid) return res.status(401).json({ error: 'Current password incorrect.' });

      const hash = await hashPassword(req.body.new_password);
      await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, req.user.id]);
      await pool.query(`DELETE FROM refresh_tokens WHERE owner_type = 'user' AND owner_id = ?`, [req.user.id]);

      res.json({ message: 'Password changed. Please log in again.' });
    } catch (err) { next(err); }
  }
);

// DELETE /profile/me  (soft delete)
router.delete('/me', auth,
  body('password').notEmpty(),
  validate,
  async (req, res, next) => {
    try {
      const [rows] = await pool.query('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
      const valid = await comparePassword(req.body.password, rows[0].password_hash);
      if (!valid) return res.status(401).json({ error: 'Password incorrect.' });

      await pool.query('UPDATE users SET is_active = FALSE, email = CONCAT(email, ?), verification_token = NULL WHERE id = ?',
        [`_deleted_${req.user.id}`, req.user.id]);
      await pool.query(`DELETE FROM refresh_tokens WHERE owner_type = 'user' AND owner_id = ?`, [req.user.id]);

      res.clearCookie('refresh_token');
      res.json({ message: 'Account deleted.' });
    } catch (err) { next(err); }
  }
);

// GET /profile/favourites
router.get('/favourites', auth, async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT p.id, p.studio_name, p.category, p.address, p.rating, p.review_count, p.avatar_url
       FROM favourites f JOIN providers p ON f.provider_id = p.id
       WHERE f.user_id = ? AND p.is_active = TRUE AND p.is_approved = TRUE
       ORDER BY f.created_at DESC`,
      [req.user.id]
    );
    res.json({ favourites: rows });
  } catch (err) { next(err); }
});

// POST /profile/favourites/:providerId
router.post('/favourites/:providerId', auth, async (req, res, next) => {
  try {
    await pool.query(
      'INSERT IGNORE INTO favourites (user_id, provider_id) VALUES (?, ?)',
      [req.user.id, req.params.providerId]
    );
    res.json({ message: 'Added to favourites.' });
  } catch (err) { next(err); }
});

// DELETE /profile/favourites/:providerId
router.delete('/favourites/:providerId', auth, async (req, res, next) => {
  try {
    await pool.query('DELETE FROM favourites WHERE user_id = ? AND provider_id = ?', [req.user.id, req.params.providerId]);
    res.json({ message: 'Removed from favourites.' });
  } catch (err) { next(err); }
});

module.exports = router;
