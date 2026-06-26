const jwt    = require('jsonwebtoken');
const crypto = require('crypto');

function signAccess(payload) {
  return jwt.sign(payload, process.env.JWT_ACCESS_SECRET, {
    expiresIn: process.env.JWT_ACCESS_EXPIRES || '15m',
    issuer:    'glowup-client-api',
    audience:  'glowup-user',
  });
}

function signRefresh(payload) {
  return jwt.sign(payload, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES || '7d',
    issuer:    'glowup-client-api',
    audience:  'glowup-user',
  });
}

function verifyAccess(token) {
  return jwt.verify(token, process.env.JWT_ACCESS_SECRET, {
    issuer:   'glowup-client-api',
    audience: 'glowup-user',
  });
}

function verifyRefresh(token) {
  return jwt.verify(token, process.env.JWT_REFRESH_SECRET, {
    issuer:   'glowup-client-api',
    audience: 'glowup-user',
  });
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

module.exports = { signAccess, signRefresh, verifyAccess, verifyRefresh, hashToken };
