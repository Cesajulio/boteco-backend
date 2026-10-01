// Middleware de Tratamento Global de Exceções (RFC 7807 Problem Details)
const errorHandler = (err, req, res, next) => {
  // Usa o logger estruturado no lugar do console.error genérico
  if (req.log) {
    req.log.error({ err, correlationId: req.id }, "Erro processando a requisição");
  } else {
    console.error("Erro detectado:", err);
  }

  const status = err.status || 500;
  
  const problemDetails = {
    type: err.type || "about:blank",
    title: err.title || "Internal Server Error",
    status: status,
    detail: err.message || "Ocorreu um erro inesperado no servidor.",
    instance: req.originalUrl,
    correlationId: req.id // Propaga o ID para a resposta do cliente
  };

  res.status(status).json(problemDetails);
};

class AppError extends Error {
  constructor(message, status, title = "Bad Request", type = "about:blank") {
    super(message);
    this.status = status;
    this.title = title;
    this.type = type;
  }
}

module.exports = { errorHandler, AppError };
