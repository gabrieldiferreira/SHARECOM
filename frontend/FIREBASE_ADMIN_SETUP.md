# 🔥 Guia Completo: Configurar Firebase Admin

## ⚠️ IMPORTANTE
O Firebase Admin é **OPCIONAL**. Sua aplicação funciona perfeitamente sem ele!
Configure apenas se precisar de funcionalidades server-side avançadas.

---

## 📖 Método 1: Script Automático (Recomendado)

### Passo 1: Baixar Service Account Key
1. Acesse: https://console.firebase.google.com/project/unidoc-493609/settings/serviceaccounts/adminsdk
2. Clique no botão **"Generate new private key"**
3. Confirme clicando em **"Generate key"**
4. Um arquivo `unidoc-493609-firebase-adminsdk-xxxxx.json` será baixado

### Passo 2: Executar o Script
```bash
cd /var/home/gabrielferreira/UNiDoc/frontend
./setup-firebase-admin.sh
```

### Passo 3: Seguir as Instruções
O script vai pedir o caminho do arquivo JSON e configurar tudo automaticamente!

### Passo 4: Rebuild
```bash
npm run build && npm run start
```

---

## 📝 Método 2: Manual

### Passo 1: Baixar Service Account Key
Mesmo processo do Método 1 (passos 1-4)

### Passo 2: Abrir o Arquivo JSON
Abra o arquivo baixado em um editor de texto e localize:

```json
{
  "type": "service_account",
  "project_id": "unidoc-493609",
  "private_key_id": "...",
  "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBg...\n-----END PRIVATE KEY-----\n",
  "client_email": "firebase-adminsdk-xxxxx@unidoc-493609.iam.gserviceaccount.com",
  "client_id": "...",
  ...
}
```

### Passo 3: Copiar os Valores
Você precisa de dois valores:
- **client_email**: `firebase-adminsdk-xxxxx@unidoc-493609.iam.gserviceaccount.com`
- **private_key**: `-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n`

### Passo 4: Adicionar ao .env.local
Abra o arquivo `.env.local` e adicione no final:

```bash
# Firebase Admin (Server-side)
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@unidoc-493609.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...
-----END PRIVATE KEY-----
"
```

⚠️ **ATENÇÃO:** 
- Mantenha as aspas duplas ao redor da PRIVATE_KEY
- Mantenha as quebras de linha (\n) na chave
- NÃO remova os marcadores BEGIN/END PRIVATE KEY

### Passo 5: Rebuild
```bash
npm run build && npm run start
```

---

## ✅ Como Verificar se Funcionou

Após o rebuild, você NÃO deve mais ver estas mensagens:
```
Firebase Admin credentials not configured. Some features will be limited.
Firebase Admin not initialized, returning defaults
```

Se ainda aparecer, verifique:
1. ✓ As variáveis estão no arquivo `.env.local` (não `.env`)
2. ✓ O nome das variáveis está correto (FIREBASE_CLIENT_EMAIL e FIREBASE_PRIVATE_KEY)
3. ✓ A PRIVATE_KEY está entre aspas duplas
4. ✓ Você fez rebuild após adicionar as variáveis

---

## 🔒 Segurança

### ⚠️ NUNCA faça commit do .env.local
O arquivo `.env.local` já está no `.gitignore`, mas verifique:

```bash
# Verificar se está ignorado
cat .gitignore | grep .env.local
```

### 🗑️ Deletar o arquivo JSON após configurar
```bash
rm ~/Downloads/unidoc-493609-firebase-adminsdk-*.json
```

---

## 🆘 Troubleshooting

### Erro: "Service account object must contain a string 'private_key' property"
**Causa:** PRIVATE_KEY não está formatada corretamente

**Solução:**
1. Certifique-se de que a chave está entre aspas duplas
2. Mantenha as quebras de linha (\n)
3. Não adicione espaços extras

### Erro: "Invalid service account"
**Causa:** CLIENT_EMAIL incorreto ou projeto errado

**Solução:**
1. Verifique se o email termina com `@unidoc-493609.iam.gserviceaccount.com`
2. Baixe uma nova chave do Firebase Console

### Ainda não funciona?
Execute o script automático:
```bash
./setup-firebase-admin.sh
```

---

## 🎯 Funcionalidades que Requerem Firebase Admin

Com Firebase Admin configurado, você terá:
- ✅ Sincronização de preferências do usuário no servidor
- ✅ Validação de tokens no backend
- ✅ Acesso a recursos administrativos do Firebase

Sem Firebase Admin:
- ✅ Autenticação funciona normalmente (Firebase Client)
- ✅ Todas as funcionalidades principais funcionam
- ✅ Dados salvos localmente (IndexedDB)
- ⚠️ Preferências não sincronizam entre dispositivos

---

## 📞 Precisa de Ajuda?

Se ainda tiver problemas, compartilhe:
1. O conteúdo do seu `.env.local` (SEM a private key completa)
2. Os erros que aparecem no console
3. A versão do Node.js: `node --version`
