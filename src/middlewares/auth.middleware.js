const jwt = require('jsonwebtoken');
const env = require('../config/env');
const redisClient = require('../config/redis');
const { AppError } = require('./error.middleware');

const TOKEN_DENYLIST_PREFIX = 'auth:revoked:';

const authenticateJWT = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(
      new AppError('Cabeçalho de autorização (Bearer Token) ausente ou malformado.', 401, {
        title: 'Unauthorized',
      })
    );
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    return next(new AppError('Token JWT ausente.', 401, { title: 'Unauthorized' }));
  }

  try {
    const decoded = jwt.verify(token, env.jwtSecret);

    if (decoded.type && decoded.type !== 'access') {
      return next(
        new AppError('Tipo de token inválido para acesso a recursos.', 401, {
          title: 'Unauthorized',
        })
      );
    }

    if (decoded.jti) {
      const revoked = await redisClient.get(`${TOKEN_DENYLIST_PREFIX}${decoded.jti}`);
      if (revoked) {
        return next(
          new AppError('Token revogado (sessão encerrada). Faça login novamente.', 401, {
            title: 'Unauthorized',
          })
        );
      }
    }

    req.user = decoded;
    req.token = token;
    return next();
  } catch (err) {
    const message =
      err.name === 'TokenExpiredError'
        ? 'Token expirado. Utilize /auth/refresh ou faça login novamente.'
        : 'Token inválido.';

    return next(new AppError(message, 401, { title: 'Unauthorized' }));
  }
};

const authorizeRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError('Usuário não autenticado.', 401, { title: 'Unauthorized' }));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(
        new AppError(
          `Acesso negado. Requer um dos seguintes papéis: ${allowedRoles.join(', ')}.`,
          403,
          { title: 'Forbidden' }
        )
      );
    }

    return next();
  };
};

module.exports = {
  authenticateJWT,
  authorizeRole,
  TOKEN_DENYLIST_PREFIX,
  JWT_SECRET: env.jwtSecret,
};
