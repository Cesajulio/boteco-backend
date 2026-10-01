const { Router } = require('express');
const barController = require('../controllers/bar.controller');
const { authenticateJWT, authorizeRole } = require('../middlewares/auth.middleware');
const { requireIdempotency } = require('../middlewares/idempotency.middleware');

const router = Router();

// Rotas públicas
router.get('/', barController.getNearbyBars);
router.get('/search', barController.searchBars);

// Rotas protegidas (Exige JWT, papel de 'admin' e cabeçalho de Idempotência)
router.post('/:id/prices', authenticateJWT, authorizeRole('admin'), requireIdempotency, barController.updatePrice);

module.exports = router;
