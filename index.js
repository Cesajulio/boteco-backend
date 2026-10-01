const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const { getDistance } = require('geolib');

let db;

// Inicialização do Firebase Admin
try {
  const serviceAccount = require('./firebase-key.json');
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  db = admin.firestore();
} catch (error) {
  console.error("=========================================");
  console.error("ERRO CRÍTICO: Firebase não inicializado!");
  console.error("Você precisa colocar o arquivo 'firebase-key.json' na pasta do backend.");
  console.error("=========================================");
  // Não podemos continuar sem o banco de dados
  process.exit(1);
}

const app = express();

app.use(cors());
app.use(express.json());

// 1. GET /bars
// Retorna bares próximos dentro de um raio de distância em Km
app.get('/bars', async (req, res) => {
  try {
    const { lat, lng, radius } = req.query;

    if (!lat || !lng || !radius) {
      return res.status(400).json({ error: 'Parâmetros lat, lng e radius são obrigatórios na querystring.' });
    }

    const userLat = parseFloat(lat);
    const userLng = parseFloat(lng);
    const radiusKm = parseFloat(radius);
    const radiusMeters = radiusKm * 1000;

    if (isNaN(userLat) || isNaN(userLng) || isNaN(radiusKm)) {
      return res.status(400).json({ error: 'Os parâmetros lat, lng e radius devem ser numéricos.' });
    }

    const barsSnapshot = await db.collection('bars').get();
    const nearbyBars = [];

    barsSnapshot.forEach(doc => {
      const barData = doc.data();

      if (barData.latitude !== undefined && barData.longitude !== undefined) {
        const distance = getDistance(
          { latitude: userLat, longitude: userLng },
          { latitude: barData.latitude, longitude: barData.longitude }
        );

        // Se o bar estiver dentro do raio estipulado
        if (distance <= radiusMeters) {
          nearbyBars.push({
            id: doc.id,
            ...barData,
            distance: distance // distância em metros
          });
        }
      }
    });

    res.json(nearbyBars);
  } catch (error) {
    console.error("Erro ao buscar bares:", error);
    res.status(500).json({ error: 'Erro interno no servidor ao buscar os bares.' });
  }
});

// GET /bars/search
// Retorna bares pesquisando pelo nome em todo o banco
app.get('/bars/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) {
      return res.status(400).json({ error: 'O parâmetro q é obrigatório na querystring.' });
    }

    const query = q.toString().toLowerCase();
    const barsSnapshot = await db.collection('bars').get();
    const results = [];

    barsSnapshot.forEach(doc => {
      const barData = doc.data();
      if (barData.name && barData.name.toLowerCase().includes(query)) {
        results.push({
          id: doc.id,
          ...barData
        });
      }
    });

    // Limita a 10 resultados para a busca não ficar pesada
    res.json(results.slice(0, 10));
  } catch (error) {
    console.error("Erro ao buscar bares por nome:", error);
    res.status(500).json({ error: 'Erro interno no servidor ao buscar os bares por nome.' });
  }
});

// 2. POST /bars/:id/prices
// Atualiza a média de preço de um produto de um bar específico
app.post('/bars/:id/prices', async (req, res) => {
  try {
    const { id } = req.params;
    const { productId, price } = req.body;

    if (!productId || typeof price !== 'number') {
      return res.status(400).json({ error: 'Os campos productId (string) e price (number) são obrigatórios no body.' });
    }

    if (price < 0) {
      return res.status(400).json({ error: 'O preço não pode ser negativo.' });
    }

    const barRef = db.collection('bars').doc(id);
    const barDoc = await barRef.get();

    if (!barDoc.exists) {
      return res.status(404).json({ error: 'Bar não encontrado.' });
    }

    const barData = barDoc.data();

    // Mapeamento lógico de productId para o campo do Firestore
    const fieldMapping = {
      'cerveja-600': 'averageBeerPrice',
      'agua-500': 'averageWaterPrice',
      'long-neck': 'averageDrinkPrice', // Mapeando long-neck como drink (ajuste conforme necessário)
      'caipirinha': 'averageDrinkPrice'
    };

    const targetField = fieldMapping[productId];

    if (!targetField) {
      return res.status(400).json({ error: 'Produto não reconhecido ou não mapeado para o banco de dados.' });
    }

    const currentPrice = barData[targetField] || 0;

    // Se preço atual for 0, usa o preço novo. Senão, faz a média simples.
    let newAveragePrice;
    if (currentPrice === 0) {
      newAveragePrice = price;
    } else {
      newAveragePrice = (currentPrice + price) / 2;
    }

    await barRef.update({
      [targetField]: newAveragePrice
    });

    res.json({
      message: 'Preço atualizado com sucesso.',
      updatedField: targetField,
      newAveragePrice: newAveragePrice
    });

  } catch (error) {
    console.error("Erro ao atualizar preço:", error);
    res.status(500).json({ error: 'Erro interno no servidor ao atualizar o preço.' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor da API do Boteco rodando na porta ${PORT}`);
});
