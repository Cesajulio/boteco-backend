# Guia de Deploy em VPS com Docker — Boteco API

Este guia descreve como publicar a **Boteco API + Redis** em uma VPS Linux (Ubuntu/Debian) usando Docker Compose de produção (`docker-compose.prod.yml`).

---

## 1. Preparar a VPS (Ubuntu/Debian)

Conecte-se à VPS via SSH e instale o Docker + Docker Compose Plugin:

```bash
ssh usuario@SEU_IP_DA_VPS

sudo apt-get update
sudo apt-get install -y ca-certificates curl git
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
# Saia e entre novamente na sessão SSH (ou execute: newgrp docker)
```

---

## 2. Clonar o repositório e configurar credenciais

```bash
git clone <URL_DO_SEU_REPOSITORIO> boteco-backend
cd boteco-backend

cp .env.example .env
nano .env
```

Ajuste no `.env` os valores de produção (gere segredos aleatórios com `openssl rand -hex 32`):

```env
PORT=3000
HOST_PORT=3000
NODE_ENV=production
LOG_LEVEL=info
CORS_ORIGIN=*
PUBLIC_URL=http://SEU_IP_DA_VPS:3000
ENABLE_HSTS=false

JWT_SECRET=COLE_AQUI_UM_SEGREDO_FORTE_64_CHARS
JWT_EXPIRES_IN=1h
JWT_REFRESH_SECRET=COLE_AQUI_OUTRO_SEGREDO_FORTE_64_CHARS
JWT_REFRESH_EXPIRES_IN=7d

REDIS_URL=redis://redis:6379
FIREBASE_KEY_PATH=./firebase-key.json
```

Envie o arquivo `firebase-key.json` do seu computador para a VPS (ele **não** vai no Git nem dentro da imagem Docker):

```bash
# Execute no seu computador local (PowerShell ou Bash):
scp firebase-key.json usuario@SEU_IP_DA_VPS:~/boteco-backend/firebase-key.json
```

Na VPS, garanta permissão de leitura para o usuário `node` (UID 1000) do container:

```bash
chmod 644 ~/boteco-backend/firebase-key.json
```

> **Alternativa sem arquivo:** você também pode omitir `firebase-key.json` e preencher a variável `FIREBASE_SERVICE_ACCOUNT_JSON` no `.env` com o JSON minificado da Service Account.

---

## 3. Liberar a porta no Firewall e subir os containers

```bash
# Se utilizar UFW na VPS:
sudo ufw allow OpenSSH
sudo ufw allow 3000/tcp
sudo ufw enable

# Build e inicialização em segundo plano (API + Redis):
docker compose -f docker-compose.prod.yml up -d --build

# Verificar status e healthchecks:
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f boteco-api
```

---

## 4. Validar o Deploy na VPS

Substitua `SEU_IP_DA_VPS` pelo IP público (ou domínio) da sua VPS:

1. **Health Check (Firestore + Redis conectados):**
   ```bash
   curl http://SEU_IP_DA_VPS:3000/health
   ```
   Esperado: `"status": "ok"`, `firestore.status: "up"`, `redis.status: "up"`.

2. **Contrato OpenAPI / Swagger UI interativo:**
   - Interface visual: `http://SEU_IP_DA_VPS:3000/api-docs`
   - Contrato JSON bruto: `http://SEU_IP_DA_VPS:3000/api-docs.json`

3. **Métricas em tempo real:**
   - `http://SEU_IP_DA_VPS:3000/metrics`

---

## 5. (Opcional) HTTPS automático com Domínio + Caddy

Se possuir um domínio apontando para o IP da VPS (ex: `api.seudominio.com`), o arquivo [deploy/Caddyfile](./deploy/Caddyfile) já está pronto para fazer proxy reverso com certificado TLS Let's Encrypt automático.
