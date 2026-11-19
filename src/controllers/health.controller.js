const { version } = require('../../package.json');
const { checkFirestoreHealth } = require('../config/firebase');
const redisClient = require('../config/redis');
const { getMetricsSnapshot } = require('../middlewares/metrics.middleware');

class HealthController {
  async check(req, res) {
    const [firestore, redis] = await Promise.all([
      checkFirestoreHealth(),
      redisClient.checkHealth(),
    ]);

    const isHealthy = firestore.connected;
    const status = isHealthy ? (redis.connected ? 'ok' : 'degraded') : 'unhealthy';
    const httpStatus = isHealthy ? 200 : 503;

    return res.status(httpStatus).json({
      status,
      service: 'boteco-backend',
      version,
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      dependencies: {
        firestore,
        redis,
      },
    });
  }

  liveness(req, res) {
    return res.status(200).json({
      status: 'alive',
      service: 'boteco-backend',
      version,
      uptimeSeconds: Math.floor(process.uptime()),
    });
  }

  metrics(req, res) {
    return res.status(200).json({
      service: 'boteco-backend',
      version,
      ...getMetricsSnapshot(),
    });
  }
}

module.exports = new HealthController();
