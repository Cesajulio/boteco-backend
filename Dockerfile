# Imagem oficial LTS do Node.js baseada em Alpine (mais leve e segura)
FROM node:22-alpine

WORKDIR /usr/src/app

# Instala apenas dependências de produção para imagem enxuta
COPY package*.json ./
RUN npm ci --omit=dev

# Copia o código-fonte da aplicação
COPY . .

# Executa com usuário não-root por boas práticas de segurança em containers
USER node

EXPOSE 3000

# Verificação automática de saúde do container
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/health/live').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["npm", "start"]
