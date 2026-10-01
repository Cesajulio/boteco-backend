# Usa uma imagem oficial do Node.js baseada em Alpine (mais leve)
FROM node:18-alpine

# Define o diretório de trabalho dentro do container
WORKDIR /usr/src/app

# Copia os arquivos de dependência
COPY package*.json ./

# Instala as dependências
RUN npm install

# Copia todo o código para dentro do container
COPY . .

# Expõe a porta que a API utiliza
EXPOSE 3000

# Comando para iniciar a aplicação
CMD [ "npm", "start" ]
