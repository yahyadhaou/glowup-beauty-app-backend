const rateLimit = require('express-rate-limit');

// General API limit
const general = rateLimit({
  windowMs:         15 * 60 * 1000,  // 15 min
  max:              200,
  standardHeaders:  true,
  legacyHeaders:    false,
  message:          { error: 'Too many requests. Please try again later.' },
});

// Strict limit for auth endpoints
const auth = rateLimit({
  windowMs:         15 * 60 * 1000,
  max:              10,
  standardHeaders:  true,
  legacyHeaders:    false,
  skipSuccessfulRequests: true,
  message:          { error: 'Too many login attempts. Please wait 15 minutes.' },
});

// Password reset — very strict
const passwordReset = rateLimit({
  windowMs:         60 * 60 * 1000,  // 1 hour
  max:              3,
  standardHeaders:  true,
  legacyHeaders:    false,
  message:          { error: 'Too many password reset requests. Please wait 1 hour.' },
});

module.exports = { general, auth, passwordReset };
