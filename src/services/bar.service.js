const { getDistance } = require('geolib');
const barRepository = require('../repositories/bar.repository');
const { cacheService, BARS_ALL_CACHE_KEY } = require('./cache.service');
const { AppError } = require('../middlewares/error.middleware');

const PRODUCT_FIELD_MAPPING = {
  'cerveja-600': 'averageBeerPrice',
  'agua-500': 'averageWaterPrice',
  'long-neck': 'averageDrinkPrice',
  caipirinha: 'averageDrinkPrice',
};

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function roundMoney(value) {
  return Math.round(value * 100) / 100;
}

class BarService {
  async _getAllBarsCached() {
    const cached = await cacheService.getJson(BARS_ALL_CACHE_KEY);
    if (cached.hit && Array.isArray(cached.value)) {
      return { bars: cached.value, cacheStatus: 'HIT' };
    }

    const bars = await barRepository.getAllBars();
    await cacheService.setJson(BARS_ALL_CACHE_KEY, bars);
    return { bars, cacheStatus: 'MISS' };
  }

  async listBars({
    lat,
    lng,
    radius,
    maxBeerPrice,
    sortBy,
    order = 'asc',
    page = 1,
    limit = 20,
  } = {}) {
    const { bars: allBars, cacheStatus } = await this._getAllBarsCached();
    const isGeoQuery = lat !== undefined && lng !== undefined && radius !== undefined;

    let filtered = allBars;

    if (isGeoQuery) {
      const radiusMeters = radius * 1000;
      filtered = [];

      for (const bar of allBars) {
        if (typeof bar.latitude === 'number' && typeof bar.longitude === 'number') {
          const distance = getDistance(
            { latitude: lat, longitude: lng },
            { latitude: bar.latitude, longitude: bar.longitude }
          );

          if (distance <= radiusMeters) {
            filtered.push({
              ...bar,
              distance,
            });
          }
        }
      }
    }

    if (maxBeerPrice !== undefined) {
      filtered = filtered.filter(
        (bar) => typeof bar.averageBeerPrice === 'number' && bar.averageBeerPrice > 0 && bar.averageBeerPrice <= maxBeerPrice
      );
    }

    const effectiveSortBy = sortBy || (isGeoQuery ? 'distance' : 'name');
    const direction = order === 'desc' ? -1 : 1;

    filtered = [...filtered].sort((a, b) => {
      if (effectiveSortBy === 'name') {
        return normalizeText(a.name).localeCompare(normalizeText(b.name)) * direction;
      }

      const valA = typeof a[effectiveSortBy] === 'number' ? a[effectiveSortBy] : Number.POSITIVE_INFINITY;
      const valB = typeof b[effectiveSortBy] === 'number' ? b[effectiveSortBy] : Number.POSITIVE_INFINITY;
      return (valA - valB) * direction;
    });

    const total = filtered.length;
    const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
    const offset = (page - 1) * limit;
    const data = filtered.slice(offset, offset + limit);

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
      cacheStatus,
    };
  }

  async searchBarsByName(query, limit = 10) {
    const normalizedQuery = normalizeText(query);
    const { bars: allBars, cacheStatus } = await this._getAllBarsCached();

    const matches = allBars.filter((bar) => {
      const nameMatch = normalizeText(bar.name).includes(normalizedQuery);
      const addressMatch = normalizeText(bar.address).includes(normalizedQuery);
      const tagMatch =
        Array.isArray(bar.tags) && bar.tags.some((t) => normalizeText(t).includes(normalizedQuery));
      return nameMatch || addressMatch || tagMatch;
    });

    return {
      data: matches.slice(0, limit),
      meta: {
        query,
        totalMatches: matches.length,
        returned: Math.min(matches.length, limit),
      },
      cacheStatus,
    };
  }

  async getCheapestRanking(product = 'cerveja-600', limit = 10) {
    const targetField = PRODUCT_FIELD_MAPPING[product];
    if (!targetField) {
      throw new AppError('Produto não reconhecido para ranking.', 400);
    }

    const { bars: allBars, cacheStatus } = await this._getAllBarsCached();

    const eligible = allBars
      .filter((bar) => typeof bar[targetField] === 'number' && bar[targetField] > 0)
      .sort((a, b) => a[targetField] - b[targetField])
      .slice(0, limit)
      .map((bar, index) => ({
        rank: index + 1,
        id: bar.id,
        name: bar.name,
        address: bar.address || null,
        product,
        priceField: targetField,
        price: bar[targetField],
        averageRating: bar.averageRating || 0,
      }));

    return {
      product,
      priceField: targetField,
      data: eligible,
      cacheStatus,
    };
  }

  async getBarById(id) {
    const bar = await barRepository.getBarById(id);
    if (!bar) {
      throw new AppError('Bar não encontrado.', 404, { title: 'Not Found' });
    }
    return bar;
  }

  async createBar(barData, createdBy) {
    const created = await barRepository.createBar({
      ...barData,
      createdBy: createdBy || 'system',
    });
    await cacheService.invalidateBarsCache();
    return created;
  }

  async updateBar(id, updateData) {
    const existing = await barRepository.getBarById(id);
    if (!existing) {
      throw new AppError('Bar não encontrado.', 404, { title: 'Not Found' });
    }

    const updated = await barRepository.updateBar(id, updateData);
    await cacheService.invalidateBarsCache();
    return updated;
  }

  async deleteBar(id) {
    const existing = await barRepository.getBarById(id);
    if (!existing) {
      throw new AppError('Bar não encontrado.', 404, { title: 'Not Found' });
    }

    await barRepository.deleteBar(id);
    await cacheService.invalidateBarsCache();
  }

  async updateProductPrice(id, productId, price, reportedBy = 'admin') {
    if (price <= 0) {
      throw new AppError('O preço deve ser maior que zero.', 400);
    }

    const targetField = PRODUCT_FIELD_MAPPING[productId];
    if (!targetField) {
      throw new AppError('Produto não reconhecido ou não mapeado para o banco de dados.', 400);
    }

    const bar = await barRepository.getBarById(id);
    if (!bar) {
      throw new AppError('Bar não encontrado.', 404, { title: 'Not Found' });
    }

    const currentPrice = typeof bar[targetField] === 'number' ? bar[targetField] : 0;
    const reportsCounts = { ...(bar.priceReportsCount || {}) };
    const previousCount = reportsCounts[targetField] || (currentPrice > 0 ? 1 : 0);

    // Média aritmética real acumulada (corrige viés da média simples 50/50)
    const nextCount = previousCount + 1;
    const newAveragePrice =
      previousCount === 0
        ? roundMoney(price)
        : roundMoney((currentPrice * previousCount + price) / nextCount);

    reportsCounts[targetField] = nextCount;
    const recordedAt = new Date().toISOString();

    await barRepository.updateBar(id, {
      [targetField]: newAveragePrice,
      priceReportsCount: reportsCounts,
    });

    await barRepository.addPriceHistory(id, {
      productId,
      targetField,
      reportedPrice: roundMoney(price),
      resultingAverage: newAveragePrice,
      reportedBy,
      createdAt: recordedAt,
    });

    await cacheService.invalidateBarsCache();

    return {
      targetField,
      newAveragePrice,
      reportsCount: nextCount,
      recordedAt,
    };
  }

  async getPriceHistory(barId, { productId, limit = 20 } = {}) {
    const bar = await barRepository.getBarById(barId);
    if (!bar) {
      throw new AppError('Bar não encontrado.', 404, { title: 'Not Found' });
    }

    const history = await barRepository.getPriceHistory(barId, { productId, limit });
    return {
      barId,
      barName: bar.name,
      total: history.length,
      data: history,
    };
  }

  async addReview(barId, { rating, comment = '' }, user) {
    const bar = await barRepository.getBarById(barId);
    if (!bar) {
      throw new AppError('Bar não encontrado.', 404, { title: 'Not Found' });
    }

    const currentCount = bar.reviewsCount || 0;
    const currentAvg = bar.averageRating || 0;
    const nextCount = currentCount + 1;
    const nextAvg = roundMoney((currentAvg * currentCount + rating) / nextCount);

    const review = await barRepository.addReview(barId, {
      rating,
      comment,
      authorUsername: user?.username || 'anonimo',
      authorName: user?.name || user?.username || 'Anônimo',
      createdAt: new Date().toISOString(),
    });

    await barRepository.updateBar(barId, {
      averageRating: nextAvg,
      reviewsCount: nextCount,
    });

    await cacheService.invalidateBarsCache();

    return {
      review,
      barRatingSummary: {
        averageRating: nextAvg,
        reviewsCount: nextCount,
      },
    };
  }

  async getReviews(barId, { limit = 20 } = {}) {
    const bar = await barRepository.getBarById(barId);
    if (!bar) {
      throw new AppError('Bar não encontrado.', 404, { title: 'Not Found' });
    }

    const reviews = await barRepository.getReviews(barId, { limit });
    return {
      barId,
      barName: bar.name,
      averageRating: bar.averageRating || 0,
      reviewsCount: bar.reviewsCount || reviews.length,
      data: reviews,
    };
  }
}

module.exports = new BarService();
module.exports.PRODUCT_FIELD_MAPPING = PRODUCT_FIELD_MAPPING;
