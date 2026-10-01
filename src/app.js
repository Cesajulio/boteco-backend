const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const pinoHttp = require('pino-http');
const { v4: uuidv4 } = require('uuid');
const swaggerUi = require('swagger-ui-express');

const logger = require('./config/logger');
const swaggerDocument = require('./config/swagger.json');
const barRoutes = require('./routes/bar.routes');
const authRoutes = require('./routes/auth.routes');
const { errorHandler } = require('./middlewares/error.middleware');

const app = express();

// Middleware de Observabilidade Básica (Logs Estruturados com Request-ID)
app.use(pinoHttp({
  logger,
  genReqId: function (req, res) {
    const id = req.headers['x-request-id'] || req.headers['correlation-id'] || uuidv4();
    res.setHeader('X-Request-Id', id);
    res.setHeader('Correlation-Id', id);
    return id;
  },
  customProps: function (req, res) {
    return {
      correlationId: req.id
    };
  }
}));

// Configuração do Rate Limit (Controle de Vazão)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // limite de 100 requisições por IP por janela
  message: {
    type: "about:blank",
    title: "Too Many Requests",
    status: 429,
    detail: "Muitas requisições deste IP, tente novamente em 15 minutos."
  }
});

app.use(cors());
app.use(express.json());

// Aplica o rate limiting globalmente
app.use(limiter);

// Rotas da API
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
app.use('/auth', authRoutes);
app.use('/bars', barRoutes);

// Tratamento global de exceções (deve ser o último middleware)
app.use(errorHandler);

module.exports = app;
