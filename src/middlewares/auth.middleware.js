const jwt = require('jsonwebtoken');

const JWT_SECRET = 'super-secret-key-boteco'; // Em produção, usar variável de ambiente

const authenticateJWT = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (authHeader) {
    const token = authHeader.split(' ')[1];

    jwt.verify(token, JWT_SECRET, (err, user) => {
      if (err) {
        return res.status(403).json({
          type: "about:blank",
          title: "Forbidden",
          status: 403,
          detail: "Token inválido ou expirado."
        });
      }

      req.user = user;
      next();
    });
  } else {
    res.status(401).json({
      type: "about:blank",
      title: "Unauthorized",
      status: 401,
      detail: "Cabeçalho de autorização (Bearer Token) ausente."
    });
  }
};

const authorizeRole = (role) => {
  return (req, res, next) => {
    if (!req.user || req.user.role !== role) {
      return res.status(403).json({
        type: "about:blank",
        title: "Forbidden",
        status: 403,
        detail: `Acesso negado. Requer o papel de: ${role}`
      });
    }
    next();
  };
};

module.exports = { authenticateJWT, authorizeRole, JWT_SECRET };
