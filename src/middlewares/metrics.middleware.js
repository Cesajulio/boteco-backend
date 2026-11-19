const metricsState = {
  startedAt: new Date().toISOString(),
  totalRequests: 0,
  statusCounts: {
    '2xx': 0,
    '3xx': 0,
    '4xx': 0,
    '5xx': 0,
  },
  totalDurationMs: 0,
  cacheHits: 0,
  cacheMisses: 0,
  idempotencyReplays: 0,
};

const metricsMiddleware = (req, res, next) => {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    metricsState.totalRequests += 1;
    metricsState.totalDurationMs += durationMs;

    const statusClass = `${Math.floor(res.statusCode / 100)}xx`;
    if (metricsState.statusCounts[statusClass] !== undefined) {
      metricsState.statusCounts[statusClass] += 1;
    }
  });

  next();
};

const recordCacheHit = () => {
  metricsState.cacheHits += 1;
};

const recordCacheMiss = () => {
  metricsState.cacheMisses += 1;
};

const recordIdempotencyReplay = () => {
  metricsState.idempotencyReplays += 1;
};

const getMetricsSnapshot = () => {
  const avgLatencyMs =
    metricsState.totalRequests > 0
      ? Number((metricsState.totalDurationMs / metricsState.totalRequests).toFixed(2))
      : 0;

  const totalCacheReads = metricsState.cacheHits + metricsState.cacheMisses;
  const cacheHitRate =
    totalCacheReads > 0
      ? Number(((metricsState.cacheHits / totalCacheReads) * 100).toFixed(2))
      : 0;

  const mem = process.memoryUsage();

  return {
    startedAt: metricsState.startedAt,
    uptimeSeconds: Math.floor(process.uptime()),
    requests: {
      total: metricsState.totalRequests,
      byStatusClass: { ...metricsState.statusCounts },
      averageLatencyMs: avgLatencyMs,
    },
    cache: {
      hits: metricsState.cacheHits,
      misses: metricsState.cacheMisses,
      hitRatePercent: cacheHitRate,
    },
    idempotency: {
      replays: metricsState.idempotencyReplays,
    },
    memoryMb: {
      rss: Number((mem.rss / 1024 / 1024).toFixed(2)),
      heapUsed: Number((mem.heapUsed / 1024 / 1024).toFixed(2)),
      heapTotal: Number((mem.heapTotal / 1024 / 1024).toFixed(2)),
    },
  };
};

const resetMetrics = () => {
  metricsState.totalRequests = 0;
  metricsState.totalDurationMs = 0;
  metricsState.statusCounts = { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 };
  metricsState.cacheHits = 0;
  metricsState.cacheMisses = 0;
  metricsState.idempotencyReplays = 0;
};

module.exports = {
  metricsMiddleware,
  recordCacheHit,
  recordCacheMiss,
  recordIdempotencyReplay,
  getMetricsSnapshot,
  resetMetrics,
};
