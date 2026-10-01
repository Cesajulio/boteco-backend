const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../middlewares/auth.middleware');

class AuthController {
  async login(req, res) {
    const { username, password } = req.body;

    // Mock simples: apenas para fim da atividade
    // Se for admin/admin, gera token de admin. Se for cliente/cliente, gera token de cliente.
    if (username === 'admin' && password === 'admin') {
      const token = jwt.sign({ username: 'admin', role: 'admin' }, JWT_SECRET, { expiresIn: '1h' });
      return res.json({ token, role: 'admin' });
    }

    if (username === 'cliente' && password === 'cliente') {
      const token = jwt.sign({ username: 'cliente', role: 'cliente' }, JWT_SECRET, { expiresIn: '1h' });
      return res.json({ token, role: 'cliente' });
    }

    return res.status(401).json({ 
      type: "about:blank",
      title: "Unauthorized",
      status: 401,
      detail: 'Credenciais inválidas. Use admin/admin ou cliente/cliente.' 
    });
  }
}

module.exports = new AuthController();
