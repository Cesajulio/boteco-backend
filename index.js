const app = require('./src/app');
const env = require('./src/config/env');
const logger = require('./src/config/logger');
const redisClient = require('./src/config/redis');

if (env.isDefaultJwtSecret && env.nodeEnv === 'production') {
  logger.warn('JWT_SECRET padrão detectado em produção! Configure uma chave forte via variável de ambiente.');
}

const server = app.listen(env.port, () => {
  logger.info(
    {
      port: env.port,
      nodeEnv: env.nodeEnv,
      docsUrl: `http://localhost:${env.port}/api-docs`,
      healthUrl: `http://localhost:${env.port}/health`,
    },
    'Servidor da API do Boteco inicializado com sucesso.'
  );
});

const shutdown = async (signal) => {
  logger.info({ signal }, 'Sinal de encerramento recebido. Finalizando servidor graciosamente...');
  server.close(async () => {
    await redisClient.quit();
    logger.info('Conexões encerradas com sucesso. Até logo!');
    process.exit(0);
  });

  setTimeout(() => {
    logger.error('Timeout no shutdown gracioso. Encerrando processo à força.');
    process.exit(1);
  }, 10000).unref();
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
