const authService = require('../services/auth.service');

class AuthController {
  async register(req, res, next) {
    try {
      const result = await authService.register(req.body);
      return res.status(201).json(result);
    } catch (error) {
      return next(error);
    }
  }

  async login(req, res, next) {
    try {
      const result = await authService.login(req.body);
      return res.status(200).json(result);
    } catch (error) {
      return next(error);
    }
  }

  async refresh(req, res, next) {
    try {
      const { refreshToken } = req.body;
      const result = await authService.refresh(refreshToken);
      return res.status(200).json(result);
    } catch (error) {
      return next(error);
    }
  }

  async logout(req, res, next) {
    try {
      const result = await authService.logout(req.user);
      return res.status(200).json(result);
    } catch (error) {
      return next(error);
    }
  }

  async me(req, res) {
    return res.status(200).json({
      id: req.user.sub,
      username: req.user.username,
      name: req.user.name,
      role: req.user.role,
    });
  }
}

module.exports = new AuthController();
