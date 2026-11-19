const { Router } = require('express');
const authController = require('../controllers/auth.controller');
const { authenticateJWT } = require('../middlewares/auth.middleware');
const { authLimiter } = require('../middlewares/rateLimit.middleware');
const { validate } = require('../middlewares/validate.middleware');
const { loginSchema, registerSchema, refreshSchema } = require('../validators/auth.validator');

const router = Router();

router.post('/register', authLimiter, validate(registerSchema), authController.register);
router.post('/login', authLimiter, validate(loginSchema), authController.login);
router.post('/refresh', authLimiter, validate(refreshSchema), authController.refresh);
router.post('/logout', authenticateJWT, authController.logout);
router.get('/me', authenticateJWT, authController.me);

module.exports = router;
