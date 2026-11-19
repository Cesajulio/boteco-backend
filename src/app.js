const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const pinoHttp = require('pino-http');
const { randomUUID } = require('crypto');
const swaggerUi = require('swagger-ui-express');

const env = require('./config/env');
const logger = require('./config/logger');
const swaggerDocument = require('./config/swagger.json');
const healthRoutes = require('./routes/health.routes');
const authRoutes = require('./routes/auth.routes');
const barRoutes = require('./routes/bar.routes');
const { globalLimiter } = require('./middlewares/rateLimit.middleware');
const { metricsMiddleware } = require('./middlewares/metrics.middleware');
const { notFoundHandler, errorHandler } = require('./middlewares/error.middleware');

const app = express();

// Necessário atrás de proxies/containers para identificar IP corretamente no Rate Limit
app.set('trust proxy', 1);

// Segurança HTTP (Headers Helmet compatíveis com Swagger UI em HTTP/HTTPS na VPS)
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginOpenerPolicy: false,
    hsts: env.enableHsts,
  })
);

// CORS configurável via variável de ambiente
app.use(
  cors({
    origin: env.corsOrigin === '*' ? true : env.corsOrigin.split(',').map((s) => s.trim()),
    exposedHeaders: ['X-Request-Id', 'Correlation-Id', 'X-Cache', 'Idempotency-Replayed', 'Location'],
  })
);

// Parser JSON com limite de payload contra ataques de negação de serviço
app.use(express.json({ limit: '100kb' }));

// Observabilidade: Logs Estruturados com Correlation-ID / Request-ID
app.use(
  pinoHttp({
    logger,
    genReqId: (req, res) => {
      const id = req.headers['x-request-id'] || req.headers['correlation-id'] || randomUUID();
      res.setHeader('X-Request-Id', id);
      res.setHeader('Correlation-Id', id);
      return id;
    },
    customProps: (req) => ({
      correlationId: req.id,
    }),
  })
);

// Coleta de métricas operacionais (latência, status, cache hit rate)
app.use(metricsMiddleware);

// Rotas de saúde e métricas (sem rate-limit para probes de infraestrutura/Docker)
app.use('/', healthRoutes);

// Monta especificação OpenAPI com URL pública da VPS quando configurada em PUBLIC_URL
const buildOpenApiSpec = () => {
  if (!env.publicUrl) {
    return swaggerDocument;
  }
  return {
    ...swaggerDocument,
    servers: [
      { url: env.publicUrl, description: 'Servidor VPS (Produção)' },
      { url: `${env.publicUrl}/api/v1`, description: 'Servidor VPS (v1)' },
      ...swaggerDocument.servers,
    ],
  };
};

// Documentação OpenAPI 3.0 (Swagger UI e JSON bruto)
app.get('/api-docs.json', (req, res) => {
  res.json(buildOpenApiSpec());
});
app.use('/api-docs', swaggerUi.serve, (req, res, next) =>
  swaggerUi.setup(buildOpenApiSpec(), {
    customSiteTitle: 'Boteco API - Contrato OpenAPI / Swagger',
  })(req, res, next)
);

// Controle de vazão (Rate Limiting com suporte a Redis)
app.use(globalLimiter);

// Rotas de domínio da API (disponíveis em / e /api/v1 para versionamento retrocompatível)
app.use('/auth', authRoutes);
app.use('/bars', barRoutes);
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/bars', barRoutes);

// Tratamento de rotas inexistentes e exceções globais (RFC 7807)
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
