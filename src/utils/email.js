const nodemailer = require('nodemailer');
const logger     = require('./logger');

const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST,
  port:   parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_PORT === '465',
  auth:   { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});

async function sendMail({ to, subject, html }) {
  try {
    await transporter.sendMail({ from: process.env.EMAIL_FROM, to, subject, html });
    logger.info(`Email sent to ${to}: ${subject}`);
  } catch (err) {
    logger.error('Email send failed: ' + err.message);
  }
}

function verifyEmailHtml(name, link) {
  return `
  <div style="font-family:sans-serif;max-width:520px;margin:0 auto;">
    <h2 style="color:#C9A44A;">Welcome to GlowUp, ${name}!</h2>
    <p>Please verify your email address to activate your account.</p>
    <a href="${link}" style="display:inline-block;padding:12px 28px;background:#C9A44A;color:#0A0A0C;border-radius:24px;text-decoration:none;font-weight:700;">Verify Email</a>
    <p style="color:#888;font-size:12px;margin-top:24px;">Link expires in 24 hours. If you did not create an account, ignore this email.</p>
  </div>`;
}

function resetPasswordHtml(name, link) {
  return `
  <div style="font-family:sans-serif;max-width:520px;margin:0 auto;">
    <h2 style="color:#C9A44A;">Password Reset — GlowUp</h2>
    <p>Hi ${name}, you requested a password reset.</p>
    <a href="${link}" style="display:inline-block;padding:12px 28px;background:#C9A44A;color:#0A0A0C;border-radius:24px;text-decoration:none;font-weight:700;">Reset Password</a>
    <p style="color:#888;font-size:12px;margin-top:24px;">Link expires in 1 hour. If you did not request this, ignore this email.</p>
  </div>`;
}

module.exports = { sendMail, verifyEmailHtml, resetPasswordHtml };
