const pino = require('pino');
const env = require('./env');

const logger = pino({
  level: env.logLevel,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.body.password',
      'password',
      'token',
      'refreshToken',
    ],
    censor: '[REDACTED]',
  },
  formatters: {
    level: (label) => ({ level: label.toUpperCase() }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

module.exports = logger;
