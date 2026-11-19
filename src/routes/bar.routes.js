const { Router } = require('express');
const barController = require('../controllers/bar.controller');
const { authenticateJWT, authorizeRole } = require('../middlewares/auth.middleware');
const { requireIdempotency } = require('../middlewares/idempotency.middleware');
const { validate } = require('../middlewares/validate.middleware');
const {
  listOrNearbyBarsSchema,
  searchBarsSchema,
  rankingBarsSchema,
  getBarByIdSchema,
  createBarSchema,
  updateBarSchema,
  updatePriceSchema,
  priceHistoryQuerySchema,
  createReviewSchema,
  listReviewsSchema,
} = require('../validators/bar.validator');

const router = Router();

// Rotas públicas de consulta
router.get('/', validate(listOrNearbyBarsSchema), barController.listOrNearbyBars);
router.get('/search', validate(searchBarsSchema), barController.searchBars);
router.get('/ranking', validate(rankingBarsSchema), barController.getRanking);
router.get('/:id', validate(getBarByIdSchema), barController.getBarById);
router.get('/:id/prices/history', validate(priceHistoryQuerySchema), barController.getPriceHistory);
router.get('/:id/reviews', validate(listReviewsSchema), barController.getReviews);

// Rotas autenticadas (qualquer usuário autenticado: cliente ou admin)
router.post(
  '/:id/reviews',
  authenticateJWT,
  authorizeRole('cliente', 'admin'),
  requireIdempotency,
  validate(createReviewSchema),
  barController.addReview
);

// Rotas administrativas (somente papel 'admin')
router.post(
  '/',
  authenticateJWT,
  authorizeRole('admin'),
  requireIdempotency,
  validate(createBarSchema),
  barController.createBar
);
router.put(
  '/:id',
  authenticateJWT,
  authorizeRole('admin'),
  validate(updateBarSchema),
  barController.updateBar
);
router.delete(
  '/:id',
  authenticateJWT,
  authorizeRole('admin'),
  validate(getBarByIdSchema),
  barController.deleteBar
);
router.post(
  '/:id/prices',
  authenticateJWT,
  authorizeRole('admin'),
  requireIdempotency,
  validate(updatePriceSchema),
  barController.updatePrice
);

module.exports = router;
