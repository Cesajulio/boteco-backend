const admin = require('firebase-admin');
const path = require('path');
const env = require('./env');
const logger = require('./logger');

let db = null;
let initialized = false;

function initFirebase() {
  if (initialized) {
    return db;
  }

  // Em ambiente de testes automatizados, os repositórios são mockados
  if (env.nodeEnv === 'test') {
    initialized = true;
    return null;
  }

  try {
    let serviceAccount;

    if (env.firebaseServiceAccountJson) {
      serviceAccount = JSON.parse(env.firebaseServiceAccountJson);
    } else {
      const resolvedPath = path.resolve(process.cwd(), env.firebaseKeyPath);
      serviceAccount = require(resolvedPath);
    }

    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    }

    db = admin.firestore();
    initialized = true;
    logger.info('Firebase Firestore inicializado com sucesso.');
    return db;
  } catch (error) {
    logger.fatal(
      { err: error },
      `ERRO CRÍTICO: Firebase não inicializado! Verifique o arquivo '${env.firebaseKeyPath}' ou a variável FIREBASE_SERVICE_ACCOUNT_JSON.`
    );
    process.exit(1);
  }
}

function getDb() {
  if (!initialized) {
    return initFirebase();
  }
  return db;
}

async function checkFirestoreHealth() {
  const firestore = getDb();
  if (!firestore) {
    return { status: 'mocked', connected: true };
  }

  const start = Date.now();
  try {
    await firestore.collection('bars').limit(1).get();
    return {
      status: 'up',
      connected: true,
      latencyMs: Date.now() - start,
    };
  } catch (error) {
    return {
      status: 'down',
      connected: false,
      latencyMs: Date.now() - start,
      error: error.message,
    };
  }
}

// Inicializa imediatamente fora de ambiente de teste para manter comportamento fail-fast
if (env.nodeEnv !== 'test') {
  initFirebase();
}

module.exports = {
  get db() {
    return getDb();
  },
  getDb,
  checkFirestoreHealth,
};
