jest.mock('../../src/repositories/user.repository');

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const userRepository = require('../../src/repositories/user.repository');
const authService = require('../../src/services/auth.service');
const redisClient = require('../../src/config/redis');
const env = require('../../src/config/env');

describe('AuthService (Unit)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    redisClient.resetFallback();
  });

  test('registra novo usuário com senha hasheada (bcrypt) e retorna tokens JWT', async () => {
    userRepository.findByUsername.mockResolvedValue(null);
    userRepository.create.mockImplementation(async (data) => ({
      id: 'user-1',
      ...data,
    }));

    const result = await authService.register({
      username: 'maria.souza',
      name: 'Maria Souza',
      email: 'maria@example.com',
      password: 'password123',
    });

    expect(result.accessToken).toBeDefined();
    expect(result.refreshToken).toBeDefined();
    expect(result.role).toBe('cliente');
    expect(result.user).toMatchObject({
      id: 'user-1',
      username: 'maria.souza',
      role: 'cliente',
    });

    const savedPayload = userRepository.create.mock.calls[0][0];
    expect(savedPayload.passwordHash).not.toBe('password123');
    expect(await bcrypt.compare('password123', savedPayload.passwordHash)).toBe(true);
  });

  test('impede cadastro duplicado retornando erro 409', async () => {
    userRepository.findByUsername.mockResolvedValue({ id: 'existing', username: 'joao' });

    await expect(
      authService.register({
        username: 'joao',
        name: 'João',
        password: 'password123',
      })
    ).rejects.toMatchObject({ status: 409 });
  });

  test('realiza login com credenciais de demonstração admin/admin', async () => {
    userRepository.findByUsername.mockResolvedValue(null);

    const result = await authService.login({ username: 'admin', password: 'admin' });

    expect(result.role).toBe('admin');
    expect(result.token).toBe(result.accessToken);
    const decoded = jwt.verify(result.accessToken, env.jwtSecret);
    expect(decoded.role).toBe('admin');
    expect(decoded.type).toBe('access');
  });

  test('rejeita login com senha incorreta retornando 401', async () => {
    userRepository.findByUsername.mockResolvedValue(null);

    await expect(
      authService.login({ username: 'admin', password: 'wrong-password' })
    ).rejects.toMatchObject({ status: 401 });
  });

  test('renova access token utilizando um refresh token válido', async () => {
    userRepository.findByUsername.mockResolvedValue(null);
    const loginRes = await authService.login({ username: 'cliente', password: 'cliente' });

    const refreshed = await authService.refresh(loginRes.refreshToken);

    expect(refreshed.accessToken).toBeDefined();
    expect(refreshed.role).toBe('cliente');
  });

  test('revoga token no logout gravando jti na denylist do Redis', async () => {
    userRepository.findByUsername.mockResolvedValue(null);
    const loginRes = await authService.login({ username: 'admin', password: 'admin' });
    const decoded = jwt.verify(loginRes.accessToken, env.jwtSecret);

    const logoutRes = await authService.logout(decoded);
    expect(logoutRes.message).toMatch(/revogado/i);

    const revoked = await redisClient.get(`auth:revoked:${decoded.jti}`);
    expect(revoked).toBe('1');
  });
});
