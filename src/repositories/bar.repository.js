const { getDb } = require('../config/firebase');

class BarRepository {
  _collection() {
    const db = getDb();
    if (!db) {
      throw new Error('Firestore não inicializado.');
    }
    return db.collection('bars');
  }

  async getAllBars() {
    const barsSnapshot = await this._collection().get();
    const bars = [];
    barsSnapshot.forEach((doc) => {
      bars.push({ id: doc.id, ...doc.data() });
    });
    return bars;
  }

  async getBarById(id) {
    const barDoc = await this._collection().doc(id).get();
    if (!barDoc.exists) {
      return null;
    }
    return { id: barDoc.id, ...barDoc.data() };
  }

  async createBar(data) {
    const now = new Date().toISOString();
    const payload = {
      ...data,
      priceReportsCount: {},
      averageRating: 0,
      reviewsCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    const docRef = await this._collection().add(payload);
    return { id: docRef.id, ...payload };
  }

  async updateBar(id, data) {
    const barRef = this._collection().doc(id);
    const payload = {
      ...data,
      updatedAt: new Date().toISOString(),
    };
    await barRef.update(payload);
    const updatedDoc = await barRef.get();
    return { id: updatedDoc.id, ...updatedDoc.data() };
  }

  async deleteBar(id) {
    await this._collection().doc(id).delete();
  }

  async addPriceHistory(barId, entry) {
    const historyRef = this._collection().doc(barId).collection('priceHistory');
    const docRef = await historyRef.add(entry);
    return { id: docRef.id, ...entry };
  }

  async getPriceHistory(barId, { productId, limit = 20 } = {}) {
    // Evita necessidade de índice composto no Firestore ao combinar where + orderBy
    const fetchLimit = productId ? Math.min(limit * 5, 200) : limit;
    const snapshot = await this._collection()
      .doc(barId)
      .collection('priceHistory')
      .orderBy('createdAt', 'desc')
      .limit(fetchLimit)
      .get();

    const entries = [];
    snapshot.forEach((doc) => {
      const entry = { id: doc.id, ...doc.data() };
      if (!productId || entry.productId === productId) {
        entries.push(entry);
      }
    });
    return entries.slice(0, limit);
  }

  async addReview(barId, reviewData) {
    const reviewsRef = this._collection().doc(barId).collection('reviews');
    const docRef = await reviewsRef.add(reviewData);
    return { id: docRef.id, ...reviewData };
  }

  async getReviews(barId, { limit = 20 } = {}) {
    const snapshot = await this._collection()
      .doc(barId)
      .collection('reviews')
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();

    const reviews = [];
    snapshot.forEach((doc) => {
      reviews.push({ id: doc.id, ...doc.data() });
    });
    return reviews;
  }
}

module.exports = new BarRepository();
