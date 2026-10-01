const { db } = require('../config/firebase');

class BarRepository {
  async getAllBars() {
    const barsSnapshot = await db.collection('bars').get();
    const bars = [];
    barsSnapshot.forEach(doc => {
      bars.push({ id: doc.id, ...doc.data() });
    });
    return bars;
  }

  async getBarById(id) {
    const barRef = db.collection('bars').doc(id);
    const barDoc = await barRef.get();
    if (!barDoc.exists) {
      return null;
    }
    return { id: barDoc.id, ...barDoc.data(), ref: barRef };
  }

  async updateBar(barRef, data) {
    await barRef.update(data);
  }
}

module.exports = new BarRepository();
