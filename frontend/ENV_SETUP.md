# Configuração de Variáveis de Ambiente

## Variáveis Obrigatórias

### Firebase Client (Público)
Essas variáveis são necessárias para autenticação do usuário:

```bash
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=
```

**Como obter:**
1. Acesse [Firebase Console](https://console.firebase.google.com/)
2. Selecione seu projeto
3. Vá em Project Settings (⚙️) > General
4. Role até "Your apps" e copie as configurações

### Backend API
```bash
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
BACKEND_API_BASE_URL=http://127.0.0.1:8000
```

## Variáveis Opcionais

### Firebase Admin (Server-side)
**OPCIONAL** - Necessário apenas para funcionalidades server-side avançadas:

```bash
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=
```

**Como obter:**
1. Firebase Console > Project Settings > Service Accounts
2. Clique em "Generate New Private Key"
3. Baixe o arquivo JSON
4. Use `client_email` e `private_key` do arquivo

**⚠️ IMPORTANTE:** Se não configurar, a aplicação funcionará normalmente com configurações padrão.

### Database (Prisma)
**OPCIONAL** - Para persistência em PostgreSQL:

```bash
DATABASE_URL="postgresql://user:password@localhost:5432/dbname"
```

### Redis (Upstash)
**OPCIONAL** - Para cache e melhor performance:

```bash
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

**Como obter:**
1. Crie conta gratuita em [Upstash](https://upstash.com/)
2. Crie um novo Redis database
3. Copie as credenciais REST API

## Setup Rápido

1. Copie o arquivo de exemplo:
```bash
cp .env.example .env.local
```

2. Preencha as variáveis obrigatórias (Firebase Client + Backend API)

3. Reinicie o servidor:
```bash
npm run build && npm run start
```

## Troubleshooting

### "Service account object must contain a string 'private_key' property"
- **Solução:** Isso é apenas um aviso. A aplicação funciona sem Firebase Admin.
- **Opcional:** Configure `FIREBASE_CLIENT_EMAIL` e `FIREBASE_PRIVATE_KEY` se precisar de funcionalidades server-side.

### "Redis not configured"
- **Solução:** Isso é apenas um aviso. A aplicação funciona sem Redis.
- **Opcional:** Configure Upstash Redis para melhor performance.

### "Prisma not available"
- **Solução:** Isso é apenas um aviso. A aplicação usa IndexedDB no navegador.
- **Opcional:** Configure PostgreSQL para persistência server-side.
