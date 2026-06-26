const crypto                                  = require('crypto');
const { v4: uuidv4 }                          = require('uuid');
const { pool }                                = require('../config/db');
const { hashPassword, comparePassword }       = require('../utils/hash');
const { signAccess, signRefresh, verifyRefresh, hashToken } = require('../utils/jwt');
const { sendMail, verifyEmailHtml, resetPasswordHtml }      = require('../utils/email');

const MAX_FAILED = 5;
const LOCK_MINUTES = 30;

// ── Register ──────────────────────────────────────────────────
exports.register = async (req, res, next) => {
  try {
    const { full_name, email, password, phone } = req.body;

    const [exists] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
    if (exists.length) return res.status(409).json({ error: 'Email already registered.' });

    const password_hash       = await hashPassword(password);
    const verification_token  = uuidv4();

    const [result] = await pool.query(
      `INSERT INTO users (full_name, email, password_hash, phone, verification_token)
       VALUES (?, ?, ?, ?, ?)`,
      [full_name, email, password_hash, phone || null, verification_token]
    );

    const link = `${process.env.CLIENT_URL}/verify-email?token=${verification_token}`;
    await sendMail({ to: email, subject: 'Verify your GlowUp account', html: verifyEmailHtml(full_name, link) });

    res.status(201).json({ message: 'Account created. Please check your email to verify.' });
  } catch (err) {
    next(err);
  }
};

// ── Verify email ──────────────────────────────────────────────
exports.verifyEmail = async (req, res, next) => {
  try {
    const { token } = req.query;
    const [rows] = await pool.query(
      'SELECT id FROM users WHERE verification_token = ? AND is_verified = FALSE',
      [token]
    );
    if (!rows.length) return res.status(400).json({ error: 'Invalid or expired verification link.' });

    await pool.query(
      'UPDATE users SET is_verified = TRUE, verification_token = NULL WHERE id = ?',
      [rows[0].id]
    );
    res.json({ message: 'Email verified. You can now log in.' });
  } catch (err) {
    next(err);
  }
};

// ── Login ─────────────────────────────────────────────────────
exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    if (!rows.length) return res.status(401).json({ error: 'Invalid credentials.' });

    const user = rows[0];

    if (!user.is_active) return res.status(401).json({ error: 'Account deactivated.' });

    // Account lockout check
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      const remaining = Math.ceil((new Date(user.locked_until) - new Date()) / 60000);
      return res.status(429).json({ error: `Account locked. Try again in ${remaining} minute(s).` });
    }

    const valid = await comparePassword(password, user.password_hash);
    if (!valid) {
      const failed = user.failed_logins + 1;
      if (failed >= MAX_FAILED) {
        const lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60000);
        await pool.query('UPDATE users SET failed_logins = ?, locked_until = ? WHERE id = ?', [failed, lockedUntil, user.id]);
        return res.status(429).json({ error: `Too many failed attempts. Account locked for ${LOCK_MINUTES} minutes.` });
      }
      await pool.query('UPDATE users SET failed_logins = ? WHERE id = ?', [failed, user.id]);
      return res.status(401).json({ error: 'Invalid credentials.', attemptsLeft: MAX_FAILED - failed });
    }

    if (!user.is_verified) return res.status(403).json({ error: 'Please verify your email before logging in.' });

    // Reset failed logins
    await pool.query('UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = ?', [user.id]);

    const accessToken  = signAccess({ sub: user.id, email: user.email });
    const refreshToken = signRefresh({ sub: user.id, email: user.email });
    const tokenHash    = hashToken(refreshToken);

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await pool.query(
      `INSERT INTO refresh_tokens (token_hash, owner_type, owner_id, expires_at, ip_address, user_agent)
       VALUES (?, 'user', ?, ?, ?, ?)`,
      [tokenHash, user.id, expiresAt, req.ip, req.headers['user-agent']?.slice(0, 500)]
    );

    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === 'production',
      sameSite: 'Strict',
      maxAge:   7 * 24 * 60 * 60 * 1000,
    });

    res.json({
      accessToken,
      user: { id: user.id, full_name: user.full_name, email: user.email, avatar_url: user.avatar_url },
    });
  } catch (err) {
    next(err);
  }
};

// ── Refresh token ─────────────────────────────────────────────
exports.refresh = async (req, res, next) => {
  try {
    const token = req.cookies?.refresh_token;
    if (!token) return res.status(401).json({ error: 'No refresh token.' });

    let decoded;
    try { decoded = verifyRefresh(token); }
    catch { return res.status(401).json({ error: 'Invalid or expired refresh token.' }); }

    const tokenHash = hashToken(token);
    const [rows] = await pool.query(
      `SELECT * FROM refresh_tokens WHERE token_hash = ? AND owner_type = 'user' AND owner_id = ? AND expires_at > NOW()`,
      [tokenHash, decoded.sub]
    );
    if (!rows.length) return res.status(401).json({ error: 'Refresh token revoked or expired.' });

    // Rotate refresh token
    const newRefresh   = signRefresh({ sub: decoded.sub, email: decoded.email });
    const newHash      = hashToken(newRefresh);
    const newExpiry    = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await pool.query('DELETE FROM refresh_tokens WHERE id = ?', [rows[0].id]);
    await pool.query(
      `INSERT INTO refresh_tokens (token_hash, owner_type, owner_id, expires_at, ip_address, user_agent)
       VALUES (?, 'user', ?, ?, ?, ?)`,
      [newHash, decoded.sub, newExpiry, req.ip, req.headers['user-agent']?.slice(0, 500)]
    );

    res.cookie('refresh_token', newRefresh, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === 'production',
      sameSite: 'Strict',
      maxAge:   7 * 24 * 60 * 60 * 1000,
    });

    const accessToken = signAccess({ sub: decoded.sub, email: decoded.email });
    res.json({ accessToken });
  } catch (err) {
    next(err);
  }
};

// ── Logout ────────────────────────────────────────────────────
exports.logout = async (req, res, next) => {
  try {
    const token = req.cookies?.refresh_token;
    if (token) {
      await pool.query('DELETE FROM refresh_tokens WHERE token_hash = ?', [hashToken(token)]);
    }
    res.clearCookie('refresh_token', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'Strict' });
    res.json({ message: 'Logged out successfully.' });
  } catch (err) {
    next(err);
  }
};

// ── Forgot password ───────────────────────────────────────────
exports.forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    const [rows] = await pool.query('SELECT id, full_name FROM users WHERE email = ? AND is_active = TRUE', [email]);

    // Always respond the same way (prevent email enumeration)
    if (!rows.length) return res.json({ message: 'If that email exists, a reset link has been sent.' });

    const user       = rows[0];
    const resetToken = crypto.randomBytes(32).toString('hex');
    const expires    = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await pool.query('UPDATE users SET reset_token = ?, reset_token_expires = ? WHERE id = ?', [resetToken, expires, user.id]);

    const link = `${process.env.CLIENT_URL}/reset-password?token=${resetToken}`;
    await sendMail({ to: email, subject: 'Reset your GlowUp password', html: resetPasswordHtml(user.full_name, link) });

    res.json({ message: 'If that email exists, a reset link has been sent.' });
  } catch (err) {
    next(err);
  }
};

// ── Reset password ────────────────────────────────────────────
exports.resetPassword = async (req, res, next) => {
  try {
    const { token, password } = req.body;

    const [rows] = await pool.query(
      'SELECT id FROM users WHERE reset_token = ? AND reset_token_expires > NOW()',
      [token]
    );
    if (!rows.length) return res.status(400).json({ error: 'Invalid or expired reset token.' });

    const hash = await hashPassword(password);
    await pool.query(
      'UPDATE users SET password_hash = ?, reset_token = NULL, reset_token_expires = NULL, failed_logins = 0, locked_until = NULL WHERE id = ?',
      [hash, rows[0].id]
    );

    // Revoke all refresh tokens for this user
    await pool.query(`DELETE FROM refresh_tokens WHERE owner_type = 'user' AND owner_id = ?`, [rows[0].id]);

    res.json({ message: 'Password reset successfully. Please log in.' });
  } catch (err) {
    next(err);
  }
};
