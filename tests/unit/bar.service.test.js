jest.mock('../../src/repositories/bar.repository');

const barRepository = require('../../src/repositories/bar.repository');
const barService = require('../../src/services/bar.service');
const redisClient = require('../../src/config/redis');

const sampleBars = [
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
    tags: ['samba', 'petiscos'],
    priceReportsCount: { averageBeerPrice: 2 },
  },
  {
    id: 'bar-2',
    name: 'Bar da Esquina',
    address: 'Avenida Central, 200',
    latitude: -15.795,
    longitude: -47.884,
    averageBeerPrice: 9.5,
    averageWaterPrice: 4.0,
    averageDrinkPrice: 15.0,
    averageRating: 4.8,
    reviewsCount: 5,
    tags: ['cerveja-gelada'],
    priceReportsCount: { averageBeerPrice: 1 },
  },
  {
    id: 'bar-3',
    name: 'Choperia Distante',
    address: 'Rodovia Sul, Km 40',
    latitude: -16.2,
    longitude: -48.1,
    averageBeerPrice: 16.0,
    averageWaterPrice: 6.0,
    averageDrinkPrice: 22.0,
    averageRating: 3.9,
    reviewsCount: 1,
    tags: ['chopp'],
    priceReportsCount: {},
  },
];

describe('BarService (Unit)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    redisClient.resetFallback();
  });

  test('filtra bares por proximidade, ordena por distância e usa cache na segunda chamada', async () => {
    barRepository.getAllBars.mockResolvedValue(sampleBars);

    const first = await barService.listBars({
      lat: -15.793889,
      lng: -47.882778,
      radius: 2,
    });

    expect(first.cacheStatus).toBe('MISS');
    expect(first.data).toHaveLength(2);
    expect(first.data[0].id).toBe('bar-1');
    expect(first.data[0].distance).toBe(0);
    expect(first.data[1].id).toBe('bar-2');
    expect(first.data[1].distance).toBeGreaterThan(0);

    const second = await barService.listBars({
      lat: -15.793889,
      lng: -47.882778,
      radius: 2,
    });

    expect(second.cacheStatus).toBe('HIT');
    expect(barRepository.getAllBars).toHaveBeenCalledTimes(1);
  });

  test('filtra por preço máximo da cerveja e aplica paginação corretamente', async () => {
    barRepository.getAllBars.mockResolvedValue(sampleBars);

    const result = await barService.listBars({
      maxBeerPrice: 13,
      sortBy: 'averageBeerPrice',
      order: 'asc',
      page: 1,
      limit: 1,
    });

    expect(result.data).toHaveLength(1);
    expect(result.data[0].id).toBe('bar-2');
    expect(result.pagination).toEqual({
      page: 1,
      limit: 1,
      total: 2,
      totalPages: 2,
    });
  });

  test('pesquisa bares de forma insensível a acentos, caixa e também por tags/endereço', async () => {
    barRepository.getAllBars.mockResolvedValue(sampleBars);

    const byAccentlessName = await barService.searchBarsByName('ze');
    expect(byAccentlessName.data).toHaveLength(1);
    expect(byAccentlessName.data[0].id).toBe('bar-1');

    const byTag = await barService.searchBarsByName('SAMBA');
    expect(byTag.data).toHaveLength(1);
    expect(byTag.data[0].id).toBe('bar-1');
  });

  test('gera ranking ordenado pelos bares mais baratos para um produto', async () => {
    barRepository.getAllBars.mockResolvedValue(sampleBars);

    const ranking = await barService.getCheapestRanking('cerveja-600', 2);

    expect(ranking.priceField).toBe('averageBeerPrice');
    expect(ranking.data).toHaveLength(2);
    expect(ranking.data[0]).toMatchObject({ rank: 1, id: 'bar-2', price: 9.5 });
    expect(ranking.data[1]).toMatchObject({ rank: 2, id: 'bar-1', price: 12.0 });
  });

  test('calcula média aritmética real acumulada ao atualizar preço e registra histórico', async () => {
    barRepository.getBarById.mockResolvedValue({ ...sampleBars[0] });
    barRepository.updateBar.mockResolvedValue({});
    barRepository.addPriceHistory.mockResolvedValue({ id: 'hist-1' });

    // bar-1 tinha averageBeerPrice = 12.0 com 2 relatos -> (12*2 + 15) / 3 = 13.0
    const result = await barService.updateProductPrice('bar-1', 'cerveja-600', 15.0, 'admin');

    expect(result.targetField).toBe('averageBeerPrice');
    expect(result.newAveragePrice).toBe(13);
    expect(result.reportsCount).toBe(3);
    expect(barRepository.updateBar).toHaveBeenCalledWith('bar-1', {
      averageBeerPrice: 13,
      priceReportsCount: { averageBeerPrice: 3 },
    });
    expect(barRepository.addPriceHistory).toHaveBeenCalledWith(
      'bar-1',
      expect.objectContaining({
        productId: 'cerveja-600',
        reportedPrice: 15,
        resultingAverage: 13,
        reportedBy: 'admin',
      })
    );
  });

  test('rejeita atualização de preço para bar inexistente com erro 404', async () => {
    barRepository.getBarById.mockResolvedValue(null);

    await expect(
      barService.updateProductPrice('inexistente', 'cerveja-600', 10, 'admin')
    ).rejects.toMatchObject({ status: 404 });
  });

  test('adiciona avaliação e recalcula averageRating e reviewsCount', async () => {
    barRepository.getBarById.mockResolvedValue({ ...sampleBars[0] });
    barRepository.addReview.mockResolvedValue({ id: 'rev-1', rating: 3, comment: 'Bom' });
    barRepository.updateBar.mockResolvedValue({});

    // bar-1 tinha 4.5 com 2 avaliações -> (4.5*2 + 3) / 3 = 4.0
    const result = await barService.addReview(
      'bar-1',
      { rating: 3, comment: 'Bom' },
      { username: 'cliente', name: 'Cliente Teste' }
    );

    expect(result.barRatingSummary).toEqual({
      averageRating: 4,
      reviewsCount: 3,
    });
    expect(barRepository.updateBar).toHaveBeenCalledWith('bar-1', {
      averageRating: 4,
      reviewsCount: 3,
    });
  });

  test('invalida o cache após criar, atualizar ou remover um bar', async () => {
    barRepository.getAllBars.mockResolvedValue(sampleBars);
    barRepository.createBar.mockResolvedValue({ id: 'bar-novo', name: 'Novo Bar' });

    await barService.listBars(); // popula cache
    await barService.createBar({ name: 'Novo Bar' }, 'admin'); // invalida cache

    const afterMutation = await barService.listBars();
    expect(afterMutation.cacheStatus).toBe('MISS');
    expect(barRepository.getAllBars).toHaveBeenCalledTimes(2);
  });
});
