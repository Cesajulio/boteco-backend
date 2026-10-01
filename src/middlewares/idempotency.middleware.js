const { AppError } = require('./error.middleware');

// Armazenamento em memória simples para a atividade
const idempotencyStore = new Map();

const requireIdempotency = (req, res, next) => {
  const idempotencyKey = req.headers['idempotency-key'];

  if (!idempotencyKey) {
    return next(new AppError('O cabeçalho Idempotency-Key é obrigatório para esta operação.', 400));
  }

  // Verifica se a chave já foi processada recentemente
  if (idempotencyStore.has(idempotencyKey)) {
    const previousResult = idempotencyStore.get(idempotencyKey);
    // Retorna exatamente a mesma resposta anterior para evitar duplicidade
    return res.status(200).json(previousResult);
  }

  // Intercepta a resposta (res.json) para salvar o resultado no cache antes de enviar
  const originalJson = res.json;
  
  res.json = function(body) {
    // Salva o sucesso na store
    if (res.statusCode >= 200 && res.statusCode < 300) {
      idempotencyStore.set(idempotencyKey, body);
    }
    
    // Chama o res.json original
    return originalJson.call(this, body);
  };

  next();
};

module.exports = { requireIdempotency };
