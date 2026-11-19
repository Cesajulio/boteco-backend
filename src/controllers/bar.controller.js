const barService = require('../services/bar.service');

class BarController {
  async listOrNearbyBars(req, res, next) {
    try {
      const result = await barService.listBars(req.query);
      res.setHeader('X-Cache', result.cacheStatus);
      return res.status(200).json({
        data: result.data,
        pagination: result.pagination,
      });
    } catch (error) {
      return next(error);
    }
  }

  async searchBars(req, res, next) {
    try {
      const { q, limit } = req.query;
      const result = await barService.searchBarsByName(q, limit);
      res.setHeader('X-Cache', result.cacheStatus);
      return res.status(200).json({
        data: result.data,
        meta: result.meta,
      });
    } catch (error) {
      return next(error);
    }
  }

  async getRanking(req, res, next) {
    try {
      const { product, limit } = req.query;
      const result = await barService.getCheapestRanking(product, limit);
      res.setHeader('X-Cache', result.cacheStatus);
      return res.status(200).json({
        product: result.product,
        priceField: result.priceField,
        data: result.data,
      });
    } catch (error) {
      return next(error);
    }
  }

  async getBarById(req, res, next) {
    try {
      const bar = await barService.getBarById(req.params.id);
      return res.status(200).json(bar);
    } catch (error) {
      return next(error);
    }
  }

  async createBar(req, res, next) {
    try {
      const created = await barService.createBar(req.body, req.user?.username);
      res.setHeader('Location', `/bars/${created.id}`);
      return res.status(201).json(created);
    } catch (error) {
      return next(error);
    }
  }

  async updateBar(req, res, next) {
    try {
      const updated = await barService.updateBar(req.params.id, req.body);
      return res.status(200).json(updated);
    } catch (error) {
      return next(error);
    }
  }

  async deleteBar(req, res, next) {
    try {
      await barService.deleteBar(req.params.id);
      return res.status(204).send();
    } catch (error) {
      return next(error);
    }
  }

  async updatePrice(req, res, next) {
    try {
      const { id } = req.params;
      const { productId, price } = req.body;
      const result = await barService.updateProductPrice(id, productId, price, req.user?.username);

      return res.status(200).json({
        message: 'Preço atualizado com sucesso.',
        updatedField: result.targetField,
        newAveragePrice: result.newAveragePrice,
        reportsCount: result.reportsCount,
        recordedAt: result.recordedAt,
      });
    } catch (error) {
      return next(error);
    }
  }

  async getPriceHistory(req, res, next) {
    try {
      const { id } = req.params;
      const result = await barService.getPriceHistory(id, req.query);
      return res.status(200).json(result);
    } catch (error) {
      return next(error);
    }
  }

  async addReview(req, res, next) {
    try {
      const { id } = req.params;
      const result = await barService.addReview(id, req.body, req.user);
      return res.status(201).json(result);
    } catch (error) {
      return next(error);
    }
  }

  async getReviews(req, res, next) {
    try {
      const { id } = req.params;
      const result = await barService.getReviews(id, req.query);
      return res.status(200).json(result);
    } catch (error) {
      return next(error);
    }
  }
}

module.exports = new BarController();
