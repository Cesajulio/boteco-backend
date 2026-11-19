const dotenv = require('dotenv');

dotenv.config({ quiet: true });

const env = {
  port: parseInt(process.env.PORT, 10) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'test' ? 'silent' : 'info'),
  corsOrigin: process.env.CORS_ORIGIN || '*',
  publicUrl: process.env.PUBLIC_URL ? process.env.PUBLIC_URL.replace(/\/+$/, '') : '',
  enableHsts: process.env.ENABLE_HSTS === 'true',
  jwtSecret: process.env.JWT_SECRET || 'super-secret-key-boteco',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1h',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || 'super-secret-refresh-key-boteco',
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  redisUrl: process.env.REDIS_URL || '',
  firebaseKeyPath: process.env.FIREBASE_KEY_PATH || './firebase-key.json',
  firebaseServiceAccountJson: process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '',
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000,
  rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX, 10) || 100,
  authRateLimitMax: parseInt(process.env.AUTH_RATE_LIMIT_MAX, 10) || 15,
  barsCacheTtlSeconds: parseInt(process.env.BARS_CACHE_TTL_SECONDS, 10) || 60,
  idempotencyTtlSeconds: parseInt(process.env.IDEMPOTENCY_TTL_SECONDS, 10) || 24 * 60 * 60,
  isDefaultJwtSecret: !process.env.JWT_SECRET,
};

module.exports = env;
