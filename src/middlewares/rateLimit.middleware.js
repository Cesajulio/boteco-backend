const rateLimit = require('express-rate-limit');
const redisClient = require('../config/redis');
const env = require('../config/env');

/**
 * Store compatível com express-rate-limit v8 apoiada pelo cliente Redis resiliente.
 * Quando o Redis está conectado, compartilha contadores entre múltiplas instâncias da API;
 * quando offline, degrada automaticamente para o store em memória com TTL.
 */
class ResilientRateLimitStore {
  constructor(prefix = 'rl:') {
    this.prefix = prefix;
    this.windowMs = env.rateLimitWindowMs;
  }

  init(options) {
    this.windowMs = options.windowMs;
  }

  async increment(key) {
    const fullKey = `${this.prefix}${key}`;
    const { count, resetTime } = await redisClient.incrementWithTtl(fullKey, this.windowMs);
    return {
      totalHits: count,
      resetTime: resetTime ? new Date(resetTime) : new Date(Date.now() + this.windowMs),
    };
  }

  async decrement(key) {
    await redisClient.decrement(`${this.prefix}${key}`);
  }

  async resetKey(key) {
    await redisClient.del(`${this.prefix}${key}`);
  }
}

const buildRateLimitHandler = (detailMessage) => (req, res) => {
  res
    .status(429)
    .set('Content-Type', 'application/problem+json; charset=utf-8')
    .json({
      type: 'https://httpstatuses.com/429',
      title: 'Too Many Requests',
      status: 429,
      detail: detailMessage,
      instance: req.originalUrl,
      correlationId: req.id,
    });
};

const globalLimiter = rateLimit({
  windowMs: env.rateLimitWindowMs,
  max: env.nodeEnv === 'test' ? 10000 : env.rateLimitMax,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  store: new ResilientRateLimitStore('rl:global:'),
  handler: buildRateLimitHandler('Muitas requisições deste IP. Tente novamente em alguns minutos.'),
});

const authLimiter = rateLimit({
  windowMs: env.rateLimitWindowMs,
  max: env.nodeEnv === 'test' ? 10000 : env.authRateLimitMax,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  store: new ResilientRateLimitStore('rl:auth:'),
  handler: buildRateLimitHandler(
    'Muitas tentativas de autenticação. Por segurança, aguarde alguns minutos antes de tentar novamente.'
  ),
});

module.exports = { globalLimiter, authLimiter, ResilientRateLimitStore };
