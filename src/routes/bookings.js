const express  = require('express');
const { body, param, query } = require('express-validator');
const { pool } = require('../config/db');
const auth     = require('../middleware/auth');
const validate = require('../middleware/validate');

const router = express.Router();

// GET /bookings?status=pending&page=1
router.get('/', auth, async (req, res, next) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let sql = `
      SELECT a.*, s.name AS service_name, s.duration,
             p.studio_name, p.address, p.avatar_url AS provider_avatar
      FROM appointments a
      JOIN services  s ON a.service_id  = s.id
      JOIN providers p ON a.provider_id = p.id
      WHERE a.user_id = ?`;
    const params = [req.user.id];
    if (status) { sql += ' AND a.status = ?'; params.push(status); }
    sql += ' ORDER BY a.date DESC, a.time DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), offset);
    const [rows] = await pool.query(sql, params);
    res.json({ bookings: rows });
  } catch (err) { next(err); }
});

// GET /bookings/:id
router.get('/:id', auth, param('id').isInt(), validate, async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT a.*, s.name AS service_name, s.duration, s.description AS service_desc,
              p.studio_name, p.address, p.phone AS provider_phone, p.avatar_url AS provider_avatar, p.rating
       FROM appointments a
       JOIN services  s ON a.service_id  = s.id
       JOIN providers p ON a.provider_id = p.id
       WHERE a.id = ? AND a.user_id = ?`,
      [req.params.id, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Booking not found.' });
    res.json({ booking: rows[0] });
  } catch (err) { next(err); }
});

// POST /bookings
router.post('/',
  auth,
  body('provider_id').isInt(),
  body('service_id').isInt(),
  body('date').isDate(),
  body('time').matches(/^\d{2}:\d{2}$/),
  body('notes').optional().trim().isLength({ max: 500 }),
  validate,
  async (req, res, next) => {
    try {
      const { provider_id, service_id, date, time, notes } = req.body;

      // Validate service belongs to provider and is active
      const [svcRows] = await pool.query(
        'SELECT * FROM services WHERE id = ? AND provider_id = ? AND is_active = TRUE',
        [service_id, provider_id]
      );
      if (!svcRows.length) return res.status(400).json({ error: 'Service not found or inactive.' });

      // Check no double-booking
      const [conflict] = await pool.query(
        `SELECT id FROM appointments WHERE provider_id = ? AND date = ? AND time = ? AND status NOT IN ('cancelled')`,
        [provider_id, date, time]
      );
      if (conflict.length) return res.status(409).json({ error: 'That time slot is already booked.' });

      const [result] = await pool.query(
        `INSERT INTO appointments (user_id, provider_id, service_id, date, time, price, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [req.user.id, provider_id, service_id, date, time, svcRows[0].price, notes || null]
      );

      // Increment bookings count
      await pool.query('UPDATE services SET bookings_count = bookings_count + 1 WHERE id = ?', [service_id]);

      // Notify provider
      await pool.query(
        `INSERT INTO notifications (recipient_type, recipient_id, type, title, body)
         VALUES ('provider', ?, 'new_booking', 'New Booking Request', ?)`,
        [provider_id, `A new booking request for ${svcRows[0].name} on ${date} at ${time}.`]
      );

      res.status(201).json({ message: 'Booking created.', bookingId: result.insertId });
    } catch (err) { next(err); }
  }
);

// PATCH /bookings/:id/cancel
router.patch('/:id/cancel', auth, param('id').isInt(), validate, async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT * FROM appointments WHERE id = ? AND user_id = ? AND status IN ('pending','confirmed')`,
      [req.params.id, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Booking not found or cannot be cancelled.' });

    await pool.query('UPDATE appointments SET status = ? WHERE id = ?', ['cancelled', req.params.id]);

    await pool.query(
      `INSERT INTO notifications (recipient_type, recipient_id, type, title, body)
       VALUES ('provider', ?, 'booking_cancelled', 'Booking Cancelled', ?)`,
      [rows[0].provider_id, `Booking #${req.params.id} has been cancelled by the client.`]
    );

    res.json({ message: 'Booking cancelled.' });
  } catch (err) { next(err); }
});

// POST /bookings/:id/review
router.post('/:id/review',
  auth,
  param('id').isInt(),
  body('rating').isInt({ min: 1, max: 5 }),
  body('comment').optional().trim().isLength({ max: 1000 }),
  validate,
  async (req, res, next) => {
    try {
      const [rows] = await pool.query(
        `SELECT * FROM appointments WHERE id = ? AND user_id = ? AND status = 'completed'`,
        [req.params.id, req.user.id]
      );
      if (!rows.length) return res.status(404).json({ error: 'Completed booking not found.' });

      const [dup] = await pool.query('SELECT id FROM reviews WHERE appointment_id = ?', [req.params.id]);
      if (dup.length) return res.status(409).json({ error: 'Review already submitted.' });

      await pool.query(
        'INSERT INTO reviews (appointment_id, user_id, provider_id, rating, comment) VALUES (?, ?, ?, ?, ?)',
        [req.params.id, req.user.id, rows[0].provider_id, req.body.rating, req.body.comment || null]
      );

      // Recalculate provider rating
      const [ratingRows] = await pool.query(
        'SELECT AVG(rating) AS avg_rating, COUNT(*) AS total FROM reviews WHERE provider_id = ?',
        [rows[0].provider_id]
      );
      await pool.query(
        'UPDATE providers SET rating = ?, review_count = ? WHERE id = ?',
        [ratingRows[0].avg_rating, ratingRows[0].total, rows[0].provider_id]
      );

      res.status(201).json({ message: 'Review submitted. Thank you!' });
    } catch (err) { next(err); }
  }
);

module.exports = router;
