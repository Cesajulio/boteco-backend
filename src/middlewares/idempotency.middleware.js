const crypto = require('crypto');
const redisClient = require('../config/redis');
const env = require('../config/env');
const { AppError } = require('./error.middleware');
const { recordIdempotencyReplay } = require('./metrics.middleware');

const IDEMPOTENCY_PREFIX = 'idempotency:';
const LOCK_TTL_SECONDS = 30;

function hashPayload(body) {
  const normalized = JSON.stringify(body ?? {});
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

const requireIdempotency = async (req, res, next) => {
  const idempotencyKey = req.headers['idempotency-key'];

  if (!idempotencyKey || typeof idempotencyKey !== 'string' || idempotencyKey.trim().length < 4) {
    return next(
      new AppError(
        'O cabeçalho Idempotency-Key (mínimo 4 caracteres) é obrigatório para esta operação.',
        400,
        { title: 'Bad Request' }
      )
    );
  }

  const userScope = req.user?.sub || req.user?.username || 'anonymous';
  const cacheKey = `${IDEMPOTENCY_PREFIX}${userScope}:${req.method}:${req.originalUrl}:${idempotencyKey.trim()}`;
  const lockKey = `${cacheKey}:lock`;
  const requestHash = hashPayload(req.body);

  try {
    const cachedRaw = await redisClient.get(cacheKey);
    if (cachedRaw) {
      const cached = JSON.parse(cachedRaw);

      if (cached.requestHash !== requestHash) {
        return next(
          new AppError(
            'A mesma Idempotency-Key já foi utilizada com um payload diferente.',
            409,
            { title: 'Conflict' }
          )
        );
      }

      recordIdempotencyReplay();
      res.setHeader('Idempotency-Replayed', 'true');
      return res.status(cached.statusCode).json(cached.body);
    }

    const acquiredLock = await redisClient.setNx(lockKey, '1', LOCK_TTL_SECONDS);
    if (!acquiredLock) {
      return next(
        new AppError(
          'Uma requisição com esta Idempotency-Key já está em processamento.',
          409,
          { title: 'Conflict' }
        )
      );
    }

    const originalJson = res.json.bind(res);
    let saved = false;

    res.json = function interceptJson(body) {
      if (!saved && res.statusCode >= 200 && res.statusCode < 300) {
        saved = true;
        const record = JSON.stringify({
          statusCode: res.statusCode,
          body,
          requestHash,
          storedAt: new Date().toISOString(),
        });
        redisClient.set(cacheKey, record, env.idempotencyTtlSeconds).catch(() => {});
      }
      redisClient.del(lockKey).catch(() => {});
      return originalJson(body);
    };

    res.on('close', () => {
      if (!saved) {
        redisClient.del(lockKey).catch(() => {});
      }
    });

    return next();
  } catch (err) {
    return next(err);
  }
};

module.exports = { requireIdempotency, IDEMPOTENCY_PREFIX };
