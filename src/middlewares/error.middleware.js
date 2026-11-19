const env = require('../config/env');

const STATUS_TITLES = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  422: 'Unprocessable Entity',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  503: 'Service Unavailable',
};

class AppError extends Error {
  constructor(message, status = 400, options = {}) {
    super(message);
    this.name = 'AppError';
    this.status = status;

    if (typeof options === 'string') {
      // Compatibilidade retroativa: AppError(message, status, title)
      this.title = options;
      this.type = 'about:blank';
      this.errors = undefined;
    } else {
      this.title = options.title || STATUS_TITLES[status] || 'Error';
      this.type = options.type || 'about:blank';
      this.errors = options.errors;
    }
  }
}

const notFoundHandler = (req, res, next) => {
  next(
    new AppError(
      `Rota '${req.method} ${req.originalUrl}' não encontrada.`,
      404,
      { title: 'Not Found', type: 'https://httpstatuses.com/404' }
    )
  );
};

// Middleware de Tratamento Global de Exceções (RFC 7807 Problem Details)
// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  // Trata JSON malformado enviado no body pelo express.json()
  let normalizedError = err;
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    normalizedError = new AppError(
      'JSON inválido no corpo da requisição. Verifique a sintaxe enviada.',
      400,
      { title: 'Bad Request', type: 'https://httpstatuses.com/400' }
    );
  }

  const status = normalizedError.status || 500;
  const isServerError = status >= 500;

  if (req.log) {
    const logMethod = isServerError ? 'error' : 'warn';
    req.log[logMethod](
      { err: normalizedError, status, correlationId: req.id },
      'Erro processando a requisição'
    );
  }

  const problemDetails = {
    type: normalizedError.type || `https://httpstatuses.com/${status}`,
    title: normalizedError.title || STATUS_TITLES[status] || 'Internal Server Error',
    status,
    detail:
      isServerError && env.nodeEnv === 'production'
        ? 'Ocorreu um erro interno inesperado no servidor.'
        : normalizedError.message || 'Ocorreu um erro inesperado no servidor.',
    instance: req.originalUrl,
    correlationId: req.id,
  };

  if (Array.isArray(normalizedError.errors) && normalizedError.errors.length > 0) {
    problemDetails.errors = normalizedError.errors;
  }

  res
    .status(status)
    .set('Content-Type', 'application/problem+json; charset=utf-8')
    .json(problemDetails);
};

module.exports = { errorHandler, notFoundHandler, AppError, STATUS_TITLES };
