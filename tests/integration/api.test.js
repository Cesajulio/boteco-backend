jest.mock('../../src/repositories/bar.repository');
jest.mock('../../src/repositories/user.repository');

const request = require('supertest');
const app = require('../../src/app');
const barRepository = require('../../src/repositories/bar.repository');
const userRepository = require('../../src/repositories/user.repository');
const redisClient = require('../../src/config/redis');
const { resetMetrics } = require('../../src/middlewares/metrics.middleware');

const mockBars = [
  {
    id: 'bar-1',
    name: 'Boteco do Zé',
    address: 'Rua das Flores, 100',
    latitude: -15.793889,
    longitude: -47.882778,
    averageBeerPrice: 12.0,
    averageWaterPrice: 5.0,
    averageDrinkPrice: 18.0,
    averageRating: 4.5,
    reviewsCount: 2,
    tags: ['samba'],
    priceReportsCount: { averageBeerPrice: 2 },
  },
  {
    id: 'bar-2',
    name: 'Bar Econômico',
    address: 'Av. Brasil, 250',
    latitude: -15.7945,
    longitude: -47.8835,
    averageBeerPrice: 8.5,
    averageWaterPrice: 3.5,
    averageDrinkPrice: 14.0,
    averageRating: 4.9,
    reviewsCount: 10,
    tags: ['cerveja-barata'],
    priceReportsCount: { averageBeerPrice: 4 },
  },
];

async function loginAs(username, password) {
  const res = await request(app).post('/auth/login').send({ username, password });
  return res.body;
}

describe('Boteco API (Integration)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    redisClient.resetFallback();
    resetMetrics();
    userRepository.findByUsername.mockResolvedValue(null);
    barRepository.getAllBars.mockResolvedValue(mockBars);
  });

  describe('Observabilidade, Erros RFC 7807 e Headers', () => {
    test('GET /health retorna status operacional e estado das dependências', async () => {
      const res = await request(app).get('/health');

      expect(res.status).toBe(200);
      expect(res.body.service).toBe('boteco-backend');
      expect(res.body.dependencies).toHaveProperty('firestore');
      expect(res.body.dependencies).toHaveProperty('redis');
      expect(res.headers['x-request-id']).toBeDefined();
      expect(res.headers['correlation-id']).toBe(res.headers['x-request-id']);
    });

    test('propaga Correlation-Id enviado pelo cliente e retorna 404 RFC 7807 para rotas inexistentes', async () => {
      const customCorrelation = 'corr-test-12345';
      const res = await request(app)
        .get('/rota-inexistente')
        .set('Correlation-Id', customCorrelation);

      expect(res.status).toBe(404);
      expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
      expect(res.headers['correlation-id']).toBe(customCorrelation);
      expect(res.body).toMatchObject({
        title: 'Not Found',
        status: 404,
        correlationId: customCorrelation,
        instance: '/rota-inexistente',
      });
    });

    test('retorna 400 RFC 7807 para JSON malformado', async () => {
      const res = await request(app)
        .post('/auth/login')
        .set('Content-Type', 'application/json')
        .send('{"username": "admin"');

      expect(res.status).toBe(400);
      expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
      expect(res.body.title).toBe('Bad Request');
    });

    test('GET /metrics retorna métricas operacionais de requisições e cache', async () => {
      await request(app).get('/bars');
      await request(app).get('/bars');

      const res = await request(app).get('/metrics');
      expect(res.status).toBe(200);
      expect(res.body.requests.total).toBeGreaterThanOrEqual(2);
      expect(res.body.cache.hits).toBeGreaterThanOrEqual(1);
      expect(res.body.cache.misses).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Autenticação, Refresh Token, Logout e RBAC', () => {
    test('permite login, acesso a /auth/me, logout e bloqueia token revogado', async () => {
      const auth = await loginAs('cliente', 'cliente');
      expect(auth.accessToken).toBeDefined();

      const meBefore = await request(app)
        .get('/auth/me')
        .set('Authorization', `Bearer ${auth.accessToken}`);
      expect(meBefore.status).toBe(200);
      expect(meBefore.body).toMatchObject({ username: 'cliente', role: 'cliente' });

      const logoutRes = await request(app)
        .post('/auth/logout')
        .set('Authorization', `Bearer ${auth.accessToken}`);
      expect(logoutRes.status).toBe(200);

      const meAfter = await request(app)
        .get('/auth/me')
        .set('Authorization', `Bearer ${auth.accessToken}`);
      expect(meAfter.status).toBe(401);
      expect(meAfter.body.detail).toMatch(/revogado/i);
    });

    test('permite registro de usuário e renovação de token via /auth/refresh', async () => {
      userRepository.create.mockImplementation(async (data) => ({ id: 'u-99', ...data }));

      const regRes = await request(app).post('/auth/register').send({
        username: 'julio.dev',
        name: 'Júlio César',
        email: 'julio@example.com',
        password: 'Password123',
      });

      expect(regRes.status).toBe(201);
      expect(regRes.body.role).toBe('cliente');
      expect(regRes.body.refreshToken).toBeDefined();

      const refreshRes = await request(app)
        .post('/auth/refresh')
        .send({ refreshToken: regRes.body.refreshToken });

      expect(refreshRes.status).toBe(200);
      expect(refreshRes.body.accessToken).toBeDefined();
    });

    test('bloqueia usuário com papel cliente em rotas exclusivas de admin (403 Forbidden)', async () => {
      const clienteAuth = await loginAs('cliente', 'cliente');

      const res = await request(app)
        .post('/bars')
        .set('Authorization', `Bearer ${clienteAuth.accessToken}`)
        .set('Idempotency-Key', 'idem-bar-create-01')
        .send({
          name: 'Bar Não Autorizado',
          address: 'Rua Teste, 123',
          latitude: -15.8,
          longitude: -47.9,
        });

      expect(res.status).toBe(403);
      expect(res.body.title).toBe('Forbidden');
    });
  });

  describe('Consulta, Cache, Busca, Ranking e Versionamento /api/v1', () => {
    test('GET /bars retorna X-Cache MISS na 1ª chamada e HIT na 2ª, com paginação', async () => {
      const first = await request(app).get('/bars?lat=-15.793889&lng=-47.882778&radius=5');
      expect(first.status).toBe(200);
      expect(first.headers['x-cache']).toBe('MISS');
      expect(first.body.data).toHaveLength(2);
      expect(first.body.pagination.total).toBe(2);

      const second = await request(app).get('/api/v1/bars?lat=-15.793889&lng=-47.882778&radius=5');
      expect(second.status).toBe(200);
      expect(second.headers['x-cache']).toBe('HIT');
    });

    test('GET /bars valida parâmetros parciais de geolocalização retornando 400 detalhado', async () => {
      const res = await request(app).get('/bars?lat=-15.79');

      expect(res.status).toBe(400);
      expect(res.body.title).toBe('Validation Error');
      expect(Array.isArray(res.body.errors)).toBe(true);
    });

    test('GET /bars/ranking retorna bares ordenados do menor para o maior preço', async () => {
      const res = await request(app).get('/bars/ranking?product=cerveja-600');

      expect(res.status).toBe(200);
      expect(res.body.data[0].id).toBe('bar-2');
      expect(res.body.data[0].price).toBe(8.5);
    });

    test('GET /bars/search pesquisa sem acento e GET /bars/:id retorna detalhes ou 404', async () => {
      const searchRes = await request(app).get('/bars/search?q=ze');
      expect(searchRes.status).toBe(200);
      expect(searchRes.body.data).toHaveLength(1);
      expect(searchRes.body.data[0].id).toBe('bar-1');

      barRepository.getBarById.mockResolvedValueOnce(mockBars[0]);
      const detailOk = await request(app).get('/bars/bar-1');
      expect(detailOk.status).toBe(200);
      expect(detailOk.body.name).toBe('Boteco do Zé');

      barRepository.getBarById.mockResolvedValueOnce(null);
      const detail404 = await request(app).get('/bars/nao-existe');
      expect(detail404.status).toBe(404);
    });

    test('GET /api-docs.json expõe especificação OpenAPI 3.0 válida', async () => {
      const res = await request(app).get('/api-docs.json');
      expect(res.status).toBe(200);
      expect(res.body.openapi).toBe('3.0.3');
      expect(res.body.paths).toHaveProperty('/bars');
      expect(res.body.paths).toHaveProperty('/bars/{id}/reviews');
    });
  });

  describe('CRUD de Bares, Preços, Idempotência e Avaliações', () => {
    test('POST /bars cria bar com admin e aplica Idempotency-Key corretamente (replay + conflito 409)', async () => {
      const adminAuth = await loginAs('admin', 'admin');
      barRepository.createBar.mockResolvedValue({
        id: 'bar-created-1',
        name: 'Boteco Novo',
        address: 'Rua Nova, 50',
        latitude: -15.79,
        longitude: -47.88,
      });

      const payload = {
        name: 'Boteco Novo',
        address: 'Rua Nova, 50',
        latitude: -15.79,
        longitude: -47.88,
      };

      const first = await request(app)
        .post('/bars')
        .set('Authorization', `Bearer ${adminAuth.accessToken}`)
        .set('Idempotency-Key', 'create-bar-key-001')
        .send(payload);

      expect(first.status).toBe(201);
      expect(first.headers.location).toBe('/bars/bar-created-1');
      expect(first.body.id).toBe('bar-created-1');

      // Replay com mesma chave e mesmo payload -> não cria novamente no repositório
      const replay = await request(app)
        .post('/bars')
        .set('Authorization', `Bearer ${adminAuth.accessToken}`)
        .set('Idempotency-Key', 'create-bar-key-001')
        .send(payload);

      expect(replay.status).toBe(201);
      expect(replay.headers['idempotency-replayed']).toBe('true');
      expect(barRepository.createBar).toHaveBeenCalledTimes(1);

      // Reuso da mesma chave com payload diferente -> 409 Conflict
      const conflict = await request(app)
        .post('/bars')
        .set('Authorization', `Bearer ${adminAuth.accessToken}`)
        .set('Idempotency-Key', 'create-bar-key-001')
        .send({ ...payload, name: 'Outro Nome' });

      expect(conflict.status).toBe(409);
      expect(conflict.body.title).toBe('Conflict');
    });

    test('POST /bars/:id/prices atualiza média e exige Idempotency-Key', async () => {
      const adminAuth = await loginAs('admin', 'admin');
      barRepository.getBarById.mockResolvedValue({ ...mockBars[0] });
      barRepository.updateBar.mockResolvedValue({});
      barRepository.addPriceHistory.mockResolvedValue({ id: 'h1' });

      const missingHeader = await request(app)
        .post('/bars/bar-1/prices')
        .set('Authorization', `Bearer ${adminAuth.accessToken}`)
        .send({ productId: 'cerveja-600', price: 15 });
      expect(missingHeader.status).toBe(400);

      const ok = await request(app)
        .post('/bars/bar-1/prices')
        .set('Authorization', `Bearer ${adminAuth.accessToken}`)
        .set('Idempotency-Key', 'price-key-001')
        .send({ productId: 'cerveja-600', price: 15 });

      expect(ok.status).toBe(200);
      expect(ok.body.newAveragePrice).toBe(13);
      expect(ok.body.reportsCount).toBe(3);
    });

    test('POST /bars/:id/reviews permite cliente autenticado avaliar um bar', async () => {
      const clienteAuth = await loginAs('cliente', 'cliente');
      barRepository.getBarById.mockResolvedValue({ ...mockBars[0] });
      barRepository.addReview.mockResolvedValue({
        id: 'rev-10',
        rating: 5,
        comment: 'Excelente!',
      });
      barRepository.updateBar.mockResolvedValue({});

      const res = await request(app)
        .post('/bars/bar-1/reviews')
        .set('Authorization', `Bearer ${clienteAuth.accessToken}`)
        .set('Idempotency-Key', 'review-key-001')
        .send({ rating: 5, comment: 'Excelente!' });

      expect(res.status).toBe(201);
      expect(res.body.review.rating).toBe(5);
      expect(res.body.barRatingSummary.reviewsCount).toBe(3);
    });

    test('PUT /bars/:id atualiza bar existente e GET /bars/:id/prices/history e /reviews retornam listas', async () => {
      const adminAuth = await loginAs('admin', 'admin');
      barRepository.getBarById.mockResolvedValue({ ...mockBars[0] });
      barRepository.updateBar.mockResolvedValue({ ...mockBars[0], name: 'Boteco do Zé Atualizado' });
      barRepository.getPriceHistory.mockResolvedValue([
        { id: 'h1', productId: 'cerveja-600', reportedPrice: 12.5, createdAt: '2026-11-19T00:00:00.000Z' },
      ]);
      barRepository.getReviews.mockResolvedValue([
        { id: 'r1', rating: 5, comment: 'Top!', authorUsername: 'cliente' },
      ]);

      const putRes = await request(app)
        .put('/bars/bar-1')
        .set('Authorization', `Bearer ${adminAuth.accessToken}`)
        .send({ name: 'Boteco do Zé Atualizado' });
      expect(putRes.status).toBe(200);
      expect(putRes.body.name).toBe('Boteco do Zé Atualizado');

      const histRes = await request(app).get('/bars/bar-1/prices/history?productId=cerveja-600');
      expect(histRes.status).toBe(200);
      expect(histRes.body.data).toHaveLength(1);

      const revRes = await request(app).get('/bars/bar-1/reviews');
      expect(revRes.status).toBe(200);
      expect(revRes.body.data).toHaveLength(1);
    });

    test('DELETE /bars/:id remove bar existente retornando 204', async () => {
      const adminAuth = await loginAs('admin', 'admin');
      barRepository.getBarById.mockResolvedValue({ ...mockBars[0] });
      barRepository.deleteBar.mockResolvedValue();

      const res = await request(app)
        .delete('/bars/bar-1')
        .set('Authorization', `Bearer ${adminAuth.accessToken}`);

      expect(res.status).toBe(204);
      expect(barRepository.deleteBar).toHaveBeenCalledWith('bar-1');
    });
  });
});
