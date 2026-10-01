const admin = require('firebase-admin');
const path = require('path');

let db;

try {
  // O caminho agora é relativo à raiz do projeto
  const serviceAccount = require(path.resolve(__dirname, '../../firebase-key.json'));
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  db = admin.firestore();
} catch (error) {
  console.error("=========================================");
  console.error("ERRO CRÍTICO: Firebase não inicializado!");
  console.error("Verifique se o arquivo 'firebase-key.json' está na pasta raiz do backend.");
  console.error("=========================================");
  process.exit(1);
}

module.exports = { db };
