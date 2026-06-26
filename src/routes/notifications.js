const express  = require('express');
const { pool } = require('../config/db');
const auth     = require('../middleware/auth');

const router = express.Router();

// GET /notifications
router.get('/', auth, async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, type, title, body, is_read, created_at
       FROM notifications WHERE recipient_type = 'user' AND recipient_id = ?
       ORDER BY created_at DESC LIMIT 50`,
      [req.user.id]
    );
    res.json({ notifications: rows });
  } catch (err) { next(err); }
});

// PATCH /notifications/:id/read
router.patch('/:id/read', auth, async (req, res, next) => {
  try {
    await pool.query(
      `UPDATE notifications SET is_read = TRUE WHERE id = ? AND recipient_type = 'user' AND recipient_id = ?`,
      [req.params.id, req.user.id]
    );
    res.json({ message: 'Marked as read.' });
  } catch (err) { next(err); }
});

// PATCH /notifications/read-all
router.patch('/read-all', auth, async (req, res, next) => {
  try {
    await pool.query(
      `UPDATE notifications SET is_read = TRUE WHERE recipient_type = 'user' AND recipient_id = ?`,
      [req.user.id]
    );
    res.json({ message: 'All notifications marked as read.' });
  } catch (err) { next(err); }
});

module.exports = router;
