const { getDistance } = require('geolib');
const barRepository = require('../repositories/bar.repository');

class BarService {
  async getNearbyBars(lat, lng, radiusKm) {
    const radiusMeters = radiusKm * 1000;
    const allBars = await barRepository.getAllBars();
    const nearbyBars = [];

    allBars.forEach(bar => {
      if (bar.latitude !== undefined && bar.longitude !== undefined) {
        const distance = getDistance(
          { latitude: lat, longitude: lng },
          { latitude: bar.latitude, longitude: bar.longitude }
        );

        if (distance <= radiusMeters) {
          nearbyBars.push({
            ...bar,
            distance
          });
        }
      }
    });

    return nearbyBars;
  }

  async searchBarsByName(query) {
    const normalizedQuery = query.toLowerCase();
    const allBars = await barRepository.getAllBars();
    const results = [];

    allBars.forEach(bar => {
      if (bar.name && bar.name.toLowerCase().includes(normalizedQuery)) {
        results.push(bar);
      }
    });

    return results.slice(0, 10);
  }

  async updateProductPrice(id, productId, price) {
    if (price < 0) {
      throw new Error('PRICE_NEGATIVE');
    }

    const bar = await barRepository.getBarById(id);
    if (!bar) {
      throw new Error('BAR_NOT_FOUND');
    }

    const fieldMapping = {
      'cerveja-600': 'averageBeerPrice',
      'agua-500': 'averageWaterPrice',
      'long-neck': 'averageDrinkPrice',
      'caipirinha': 'averageDrinkPrice'
    };

    const targetField = fieldMapping[productId];
    if (!targetField) {
      throw new Error('PRODUCT_NOT_MAPPED');
    }

    const currentPrice = bar[targetField] || 0;
    let newAveragePrice;
    
    if (currentPrice === 0) {
      newAveragePrice = price;
    } else {
      newAveragePrice = (currentPrice + price) / 2;
    }

    await barRepository.updateBar(bar.ref, {
      [targetField]: newAveragePrice
    });

    return { targetField, newAveragePrice };
  }
}

module.exports = new BarService();
