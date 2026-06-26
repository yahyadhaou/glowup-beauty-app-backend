const logger = require('../utils/logger');

module.exports = function errorHandler(err, req, res, next) {
  logger.error(err.message, { stack: err.stack, path: req.path });

  if (err.name === 'ValidationError') {
    return res.status(422).json({ error: err.message });
  }

  const status = err.statusCode || err.status || 500;
  const msg    = process.env.NODE_ENV === 'production' && status === 500
    ? 'Internal server error.'
    : err.message;

  res.status(status).json({ error: msg });
};
