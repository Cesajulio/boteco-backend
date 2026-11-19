const { AppError } = require('./error.middleware');

/**
 * Middleware genérico de validação com Zod.
 * Valida body, query e/ou params e retorna erro RFC 7807 detalhado em caso de falha.
 */
const validate = (schemas) => (req, res, next) => {
  const validationErrors = [];

  for (const target of ['params', 'query', 'body']) {
    if (!schemas[target]) continue;

    const result = schemas[target].safeParse(req[target]);
    if (!result.success) {
      for (const issue of result.error.issues) {
        validationErrors.push({
          location: target,
          field: issue.path.join('.') || target,
          message: issue.message,
        });
      }
    } else {
      req[target] = result.data;
    }
  }

  if (validationErrors.length > 0) {
    return next(
      new AppError('Dados de entrada inválidos. Verifique os campos informados.', 400, {
        title: 'Validation Error',
        type: 'https://httpstatuses.com/400',
        errors: validationErrors,
      })
    );
  }

  return next();
};

module.exports = { validate };
