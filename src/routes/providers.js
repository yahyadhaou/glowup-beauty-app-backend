const express        = require('express');
const { query, param } = require('express-validator');
const { pool }       = require('../config/db');
const auth           = require('../middleware/auth');
const validate       = require('../middleware/validate');

const router = express.Router();

// GET /providers?category=hair&search=glow&page=1
router.get('/', auth, async (req, res, next) => {
  try {
    const { category, search, page = 1, limit = 20, sort = 'rating' } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const params = [];
    let sql = `
      SELECT id, studio_name, full_name, category, address, rating, review_count, avatar_url, about
      FROM providers WHERE is_active = TRUE AND is_approved = TRUE`;
    if (category) { sql += ' AND category = ?'; params.push(category); }
    if (search)   { sql += ' AND (studio_name LIKE ? OR category LIKE ? OR address LIKE ?)'; params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
    const order = sort === 'rating' ? 'rating DESC' : sort === 'newest' ? 'created_at DESC' : 'studio_name ASC';
    sql += ` ORDER BY ${order} LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), offset);
    const [rows] = await pool.query(sql, params);
    res.json({ providers: rows });
  } catch (err) { next(err); }
});

// GET /providers/:id
router.get('/:id', auth, param('id').isInt(), validate, async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, studio_name, full_name, category, address, rating, review_count, avatar_url, about, phone
       FROM providers WHERE id = ? AND is_active = TRUE AND is_approved = TRUE`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Provider not found.' });

    const [services] = await pool.query(
      'SELECT id, name, description, duration, price, is_popular FROM services WHERE provider_id = ? AND is_active = TRUE',
      [req.params.id]
    );
    const [hours] = await pool.query(
      'SELECT day_of_week, is_open, open_time, close_time FROM business_hours WHERE provider_id = ? ORDER BY day_of_week',
      [req.params.id]
    );
    const [reviews] = await pool.query(
      `SELECT r.rating, r.comment, r.created_at, u.full_name AS client_name, u.avatar_url AS client_avatar
       FROM reviews r JOIN users u ON r.user_id = u.id
       WHERE r.provider_id = ? ORDER BY r.created_at DESC LIMIT 10`,
      [req.params.id]
    );
    const [gallery] = await pool.query(
      'SELECT url, label FROM gallery_photos WHERE provider_id = ? LIMIT 20',
      [req.params.id]
    );

    res.json({ provider: rows[0], services, businessHours: hours, reviews, gallery });
  } catch (err) { next(err); }
});

module.exports = router;
