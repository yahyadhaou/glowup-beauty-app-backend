const express  = require('express');
const { body } = require('express-validator');
const ctrl     = require('../controllers/authController');
const validate = require('../middleware/validate');
const { auth, passwordReset } = require('../middleware/rateLimit');

const router = express.Router();

const passwordRules = body('password')
  .isLength({ min: 8 }).withMessage('Password must be at least 8 characters.')
  .matches(/[A-Z]/).withMessage('Password must contain an uppercase letter.')
  .matches(/[0-9]/).withMessage('Password must contain a number.');

router.post('/register',
  auth,
  body('full_name').trim().notEmpty().isLength({ max: 100 }),
  body('email').isEmail().normalizeEmail(),
  passwordRules,
  body('phone').optional().isMobilePhone(),
  validate,
  ctrl.register
);

router.get('/verify-email', ctrl.verifyEmail);

router.post('/login',
  auth,
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
  validate,
  ctrl.login
);

router.post('/refresh', ctrl.refresh);
router.post('/logout',  ctrl.logout);

router.post('/forgot-password',
  passwordReset,
  body('email').isEmail().normalizeEmail(),
  validate,
  ctrl.forgotPassword
);

router.post('/reset-password',
  passwordReset,
  body('token').notEmpty(),
  passwordRules,
  validate,
  ctrl.resetPassword
);

module.exports = router;
