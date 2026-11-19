const { Router } = require('express');
const healthController = require('../controllers/health.controller');

const router = Router();

router.get('/health', healthController.check);
router.get('/health/live', healthController.liveness);
router.get('/metrics', healthController.metrics);

module.exports = router;
