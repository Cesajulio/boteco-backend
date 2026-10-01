const app = require('./src/app');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Servidor da API do Boteco rodando na porta ${PORT}`);
  console.log(`Arquitetura em Camadas inicializada com sucesso.`);
});
