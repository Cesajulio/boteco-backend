const { getDb } = require('../config/firebase');

class UserRepository {
  _collection() {
    const db = getDb();
    if (!db) {
      throw new Error('Firestore não inicializado.');
    }
    return db.collection('users');
  }

  async findByUsername(username) {
    const snapshot = await this._collection()
      .where('username', '==', username.toLowerCase())
      .limit(1)
      .get();

    if (snapshot.empty) {
      return null;
    }

    const doc = snapshot.docs[0];
    return { id: doc.id, ...doc.data() };
  }

  async create(userData) {
    const now = new Date().toISOString();
    const payload = {
      ...userData,
      username: userData.username.toLowerCase(),
      createdAt: now,
      updatedAt: now,
    };

    const docRef = await this._collection().add(payload);
    return { id: docRef.id, ...payload };
  }
}

module.exports = new UserRepository();
