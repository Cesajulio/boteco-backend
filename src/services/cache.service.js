const redisClient = require('../config/redis');
const env = require('../config/env');
const { recordCacheHit, recordCacheMiss } = require('../middlewares/metrics.middleware');

const BARS_ALL_CACHE_KEY = 'cache:bars:all';

class CacheService {
  async getJson(key) {
    const raw = await redisClient.get(key);
    if (!raw) {
      recordCacheMiss();
      return { hit: false, value: null };
    }
    try {
      recordCacheHit();
      return { hit: true, value: JSON.parse(raw) };
    } catch {
      recordCacheMiss();
      return { hit: false, value: null };
    }
  }

  async setJson(key, value, ttlSeconds = env.barsCacheTtlSeconds) {
    await redisClient.set(key, JSON.stringify(value), ttlSeconds);
  }

  async invalidateBarsCache() {
    await redisClient.del(BARS_ALL_CACHE_KEY);
  }
}

module.exports = {
  cacheService: new CacheService(),
  BARS_ALL_CACHE_KEY,
};
