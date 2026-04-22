# 🚀 Quick Start - Firebase Admin Setup

## TL;DR - Comandos Rápidos

### Opção 1: Script Automático (Recomendado)
```bash
# 1. Baixe a chave do Firebase Console
# 2. Execute:
npm run setup:firebase
```

### Opção 2: Ver Guia Completo
```bash
npm run help:firebase
```

### Opção 3: Manual Rápido
```bash
# 1. Baixe: https://console.firebase.google.com/project/unidoc-493609/settings/serviceaccounts/adminsdk
# 2. Adicione ao .env.local:

FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@unidoc-493609.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----
sua-chave-aqui
-----END PRIVATE KEY-----"

# 3. Rebuild:
npm run build && npm run start
```

## ⚠️ É Obrigatório?

**NÃO!** Sua aplicação funciona perfeitamente sem Firebase Admin.

**Com Firebase Admin:**
- ✅ Sync de preferências entre dispositivos
- ✅ Validação server-side de tokens

**Sem Firebase Admin:**
- ✅ Todas as funcionalidades principais
- ✅ Autenticação funciona (Firebase Client)
- ✅ Dados salvos localmente
- ⚠️ Sem sync entre dispositivos

## 📚 Documentação Completa

- `FIREBASE_ADMIN_SETUP.md` - Guia detalhado passo a passo
- `ENV_SETUP.md` - Todas as variáveis de ambiente
- `.env.example` - Template de configuração

## 🆘 Problemas?

Execute o script automático:
```bash
npm run setup:firebase
```

Ou leia o guia completo:
```bash
npm run help:firebase
```
