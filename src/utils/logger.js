const { createLogger, format, transports } = require('winston');

module.exports = createLogger({
  level: process.env.NODE_ENV === 'production' ? 'warn' : 'debug',
  format: format.combine(format.timestamp(), format.errors({ stack: true }), format.json()),
  transports: [
    new transports.Console({ format: format.combine(format.colorize(), format.simple()) }),
  ],
});
