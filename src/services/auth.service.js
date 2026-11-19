const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { randomUUID } = require('crypto');

const env = require('../config/env');
const redisClient = require('../config/redis');
const userRepository = require('../repositories/user.repository');
const { AppError } = require('../middlewares/error.middleware');
const { TOKEN_DENYLIST_PREFIX } = require('../middlewares/auth.middleware');

const DEMO_USERS = {
  admin: {
    id: 'demo-admin',
    username: 'admin',
    name: 'Administrador Boteco',
    role: 'admin',
    passwordHash: bcrypt.hashSync('admin', 8),
  },
  cliente: {
    id: 'demo-cliente',
    username: 'cliente',
    name: 'Cliente Boteco',
    role: 'cliente',
    passwordHash: bcrypt.hashSync('cliente', 8),
  },
};

class AuthService {
  _generateTokens(user) {
    const accessJti = randomUUID();
    const refreshJti = randomUUID();

    const payload = {
      sub: user.id,
      username: user.username,
      name: user.name || user.username,
      role: user.role,
    };

    const accessToken = jwt.sign({ ...payload, jti: accessJti, type: 'access' }, env.jwtSecret, {
      expiresIn: env.jwtExpiresIn,
    });

    const refreshToken = jwt.sign(
      { ...payload, jti: refreshJti, type: 'refresh' },
      env.jwtRefreshSecret,
      { expiresIn: env.jwtRefreshExpiresIn }
    );

    return {
      token: accessToken, // compatibilidade com clientes v1
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: env.jwtExpiresIn,
      role: user.role,
      user: {
        id: user.id,
        username: user.username,
        name: user.name || user.username,
        role: user.role,
        ...(user.email ? { email: user.email } : {}),
      },
    };
  }

  async register({ username, name, email, password }) {
    const normalizedUsername = username.toLowerCase();

    if (DEMO_USERS[normalizedUsername]) {
      throw new AppError('Este username é reservado. Escolha outro.', 409, {
        title: 'Conflict',
      });
    }

    const existing = await userRepository.findByUsername(normalizedUsername);
    if (existing) {
      throw new AppError('Já existe um usuário cadastrado com este username.', 409, {
        title: 'Conflict',
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const createdUser = await userRepository.create({
      username: normalizedUsername,
      name,
      email: email || null,
      role: 'cliente',
      passwordHash,
    });

    return this._generateTokens(createdUser);
  }

  async login({ username, password }) {
    const normalizedUsername = username.toLowerCase();
    let user = null;

    // 1. Tenta localizar usuário persistido no Firestore
    try {
      user = await userRepository.findByUsername(normalizedUsername);
    } catch (err) {
      // Se for usuário demo, permite fallback mesmo sem Firestore em ambiente de demo
      if (!DEMO_USERS[normalizedUsername]) {
        throw err;
      }
    }

    // 2. Fallback para contas de demonstração (admin/admin e cliente/cliente)
    if (!user && DEMO_USERS[normalizedUsername]) {
      user = DEMO_USERS[normalizedUsername];
    }

    if (!user) {
      throw new AppError(
        'Credenciais inválidas. Verifique usuário e senha (ou use admin/admin, cliente/cliente).',
        401,
        { title: 'Unauthorized' }
      );
    }

    const validPassword = await bcrypt.compare(password, user.passwordHash);
    if (!validPassword) {
      throw new AppError('Credenciais inválidas. Verifique usuário e senha.', 401, {
        title: 'Unauthorized',
      });
    }

    return this._generateTokens(user);
  }

  async refresh(refreshToken) {
    let decoded;
    try {
      decoded = jwt.verify(refreshToken, env.jwtRefreshSecret);
    } catch {
      throw new AppError('Refresh token inválido ou expirado.', 401, {
        title: 'Unauthorized',
      });
    }

    if (decoded.type !== 'refresh') {
      throw new AppError('Token informado não é um refresh token válido.', 401, {
        title: 'Unauthorized',
      });
    }

    if (decoded.jti) {
      const revoked = await redisClient.get(`${TOKEN_DENYLIST_PREFIX}${decoded.jti}`);
      if (revoked) {
        throw new AppError('Refresh token revogado. Faça login novamente.', 401, {
          title: 'Unauthorized',
        });
      }
    }

    return this._generateTokens({
      id: decoded.sub,
      username: decoded.username,
      name: decoded.name,
      role: decoded.role,
    });
  }

  async logout(decodedToken) {
    if (!decodedToken || !decodedToken.jti) {
      return { message: 'Sessão encerrada com sucesso.' };
    }

    const nowSec = Math.floor(Date.now() / 1000);
    const remainingTtl = Math.max(1, (decodedToken.exp || nowSec + 3600) - nowSec);

    await redisClient.set(`${TOKEN_DENYLIST_PREFIX}${decodedToken.jti}`, '1', remainingTtl);

    return {
      message: 'Logout realizado com sucesso. Token revogado.',
      revokedUntil: decodedToken.exp ? new Date(decodedToken.exp * 1000).toISOString() : null,
    };
  }
}

module.exports = new AuthService();
