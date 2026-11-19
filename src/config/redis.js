const Redis = require('ioredis');
const env = require('./env');
const logger = require('./logger');

/**
 * Fallback em memória com suporte a TTL, usado automaticamente quando o Redis
 * não está disponível (ex: execução local sem Docker ou testes unitários).
 */
class MemoryStore {
  constructor() {
    this.store = new Map();
  }

  _isExpired(entry) {
    return entry.expiresAt !== null && Date.now() > entry.expiresAt;
  }

  async get(key) {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (this._isExpired(entry)) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key, value, ttlSeconds) {
    const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : null;
    this.store.set(key, { value: String(value), expiresAt });
    return 'OK';
  }

  async setNx(key, value, ttlSeconds) {
    const existing = await this.get(key);
    if (existing !== null) {
      return false;
    }
    await this.set(key, value, ttlSeconds);
    return true;
  }

  async del(key) {
    return this.store.delete(key) ? 1 : 0;
  }

  async incr(key, ttlSeconds) {
    const existing = this.store.get(key);
    if (!existing || this._isExpired(existing)) {
      const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : null;
      this.store.set(key, { value: '1', expiresAt });
      return { count: 1, resetTime: expiresAt };
    }
    const nextCount = parseInt(existing.value, 10) + 1;
    existing.value = String(nextCount);
    return { count: nextCount, resetTime: existing.expiresAt };
  }

  async decr(key) {
    const existing = this.store.get(key);
    if (!existing || this._isExpired(existing)) return 0;
    const nextCount = Math.max(0, parseInt(existing.value, 10) - 1);
    existing.value = String(nextCount);
    return nextCount;
  }

  clear() {
    this.store.clear();
  }
}

class ResilientRedisClient {
  constructor() {
    this.client = null;
    this.connected = false;
    this.fallback = new MemoryStore();
    this._warningLogged = false;

    if (env.nodeEnv !== 'test' && env.redisUrl) {
      this._initRedis(env.redisUrl);
    }
  }

  _initRedis(url) {
    this.client = new Redis(url, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: 2000,
      retryStrategy: (times) => {
        if (times > 3) {
          if (!this._warningLogged) {
            logger.warn('Redis indisponível; operando em modo de degradação graciosa (memória local).');
            this._warningLogged = true;
          }
          return Math.min(times * 2000, 30000);
        }
        return times * 500;
      },
    });

    this.client.on('ready', () => {
      this.connected = true;
      this._warningLogged = false;
      logger.info({ redisUrl: url }, 'Conexão com Redis estabelecida com sucesso.');
    });

    this.client.on('error', (err) => {
      this.connected = false;
      if (!this._warningLogged) {
        logger.warn({ err: err.message }, 'Erro ao conectar no Redis; usando fallback em memória.');
        this._warningLogged = true;
      }
    });

    this.client.on('close', () => {
      this.connected = false;
    });
  }

  isConnected() {
    return Boolean(this.client && this.connected && this.client.status === 'ready');
  }

  async get(key) {
    if (this.isConnected()) {
      try {
        return await this.client.get(key);
      } catch (err) {
        logger.warn({ err: err.message, key }, 'Falha no Redis GET; usando fallback.');
      }
    }
    return this.fallback.get(key);
  }

  async set(key, value, ttlSeconds) {
    if (this.isConnected()) {
      try {
        if (ttlSeconds) {
          return await this.client.set(key, String(value), 'EX', Math.ceil(ttlSeconds));
        }
        return await this.client.set(key, String(value));
      } catch (err) {
        logger.warn({ err: err.message, key }, 'Falha no Redis SET; usando fallback.');
      }
    }
    return this.fallback.set(key, value, ttlSeconds);
  }

  async setNx(key, value, ttlSeconds) {
    if (this.isConnected()) {
      try {
        const result = ttlSeconds
          ? await this.client.set(key, String(value), 'EX', Math.ceil(ttlSeconds), 'NX')
          : await this.client.set(key, String(value), 'NX');
        return result === 'OK';
      } catch (err) {
        logger.warn({ err: err.message, key }, 'Falha no Redis SETNX; usando fallback.');
      }
    }
    return this.fallback.setNx(key, value, ttlSeconds);
  }

  async del(key) {
    if (this.isConnected()) {
      try {
        return await this.client.del(key);
      } catch (err) {
        logger.warn({ err: err.message, key }, 'Falha no Redis DEL; usando fallback.');
      }
    }
    return this.fallback.del(key);
  }

  async incrementWithTtl(key, windowMs) {
    const ttlSeconds = Math.ceil(windowMs / 1000);
    if (this.isConnected()) {
      try {
        const count = await this.client.incr(key);
        let pttl = await this.client.pttl(key);
        if (count === 1 || pttl < 0) {
          await this.client.pexpire(key, windowMs);
          pttl = windowMs;
        }
        return { count, resetTime: Date.now() + pttl };
      } catch (err) {
        logger.warn({ err: err.message, key }, 'Falha no Redis INCR; usando fallback.');
      }
    }
    return this.fallback.incr(key, ttlSeconds);
  }

  async decrement(key) {
    if (this.isConnected()) {
      try {
        const count = await this.client.decr(key);
        return Math.max(0, count);
      } catch (err) {
        logger.warn({ err: err.message, key }, 'Falha no Redis DECR; usando fallback.');
      }
    }
    return this.fallback.decr(key);
  }

  async checkHealth() {
    if (!this.client) {
      return {
        status: 'fallback-memory',
        connected: false,
        mode: 'in-memory',
      };
    }

    const start = Date.now();
    try {
      if (!this.isConnected()) {
        return {
          status: 'degraded-memory',
          connected: false,
          mode: 'in-memory-fallback',
        };
      }
      await this.client.ping();
      return {
        status: 'up',
        connected: true,
        mode: 'redis',
        latencyMs: Date.now() - start,
      };
    } catch (error) {
      return {
        status: 'degraded-memory',
        connected: false,
        mode: 'in-memory-fallback',
        error: error.message,
      };
    }
  }

  async quit() {
    if (this.client) {
      try {
        await this.client.quit();
      } catch {
        this.client.disconnect();
      }
      this.connected = false;
    }
  }

  resetFallback() {
    this.fallback.clear();
  }
}

module.exports = new ResilientRedisClient();
