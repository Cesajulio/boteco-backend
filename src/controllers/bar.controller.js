const barService = require('../services/bar.service');
const { AppError } = require('../middlewares/error.middleware');

class BarController {
  async getNearbyBars(req, res, next) {
    try {
      const { lat, lng, radius } = req.query;

      if (!lat || !lng || !radius) {
        throw new AppError('Parâmetros lat, lng e radius são obrigatórios na querystring.', 400);
      }

      const userLat = parseFloat(lat);
      const userLng = parseFloat(lng);
      const radiusKm = parseFloat(radius);

      if (isNaN(userLat) || isNaN(userLng) || isNaN(radiusKm)) {
        throw new AppError('Os parâmetros lat, lng e radius devem ser numéricos.', 400);
      }

      const nearbyBars = await barService.getNearbyBars(userLat, userLng, radiusKm);
      return res.json(nearbyBars);
    } catch (error) {
      next(error);
    }
  }

  async searchBars(req, res, next) {
    try {
      const { q } = req.query;
      if (!q) {
        throw new AppError('O parâmetro q é obrigatório na querystring.', 400);
      }

      const results = await barService.searchBarsByName(q.toString());
      return res.json(results);
    } catch (error) {
      next(error);
    }
  }

  async updatePrice(req, res, next) {
    try {
      const { id } = req.params;
      const { productId, price } = req.body;

      if (!productId || typeof price !== 'number') {
        throw new AppError('Os campos productId (string) e price (number) são obrigatórios no body.', 400);
      }

      const result = await barService.updateProductPrice(id, productId, price);
      
      return res.json({
        message: 'Preço atualizado com sucesso.',
        updatedField: result.targetField,
        newAveragePrice: result.newAveragePrice
      });
      
    } catch (error) {
      if (error.message === 'PRICE_NEGATIVE') {
        return next(new AppError('O preço não pode ser negativo.', 400));
      }
      if (error.message === 'BAR_NOT_FOUND') {
        return next(new AppError('Bar não encontrado.', 404));
      }
      if (error.message === 'PRODUCT_NOT_MAPPED') {
        return next(new AppError('Produto não reconhecido ou não mapeado para o banco de dados.', 400));
      }
      next(error);
    }
  }
}

module.exports = new BarController();
