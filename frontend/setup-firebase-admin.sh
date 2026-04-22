#!/bin/bash

echo "🔥 Firebase Admin Setup Script"
echo "================================"
echo ""
echo "Siga os passos abaixo para configurar o Firebase Admin:"
echo ""
echo "1. Acesse: https://console.firebase.google.com/project/unidoc-493609/settings/serviceaccounts/adminsdk"
echo "2. Clique em 'Generate new private key'"
echo "3. Baixe o arquivo JSON"
echo ""
read -p "Pressione ENTER quando tiver baixado o arquivo JSON..."
echo ""
read -p "Cole o caminho completo do arquivo JSON baixado: " JSON_FILE

if [ ! -f "$JSON_FILE" ]; then
    echo "❌ Arquivo não encontrado: $JSON_FILE"
    exit 1
fi

echo ""
echo "📝 Extraindo credenciais..."

# Extrair client_email e private_key do JSON
CLIENT_EMAIL=$(grep -o '"client_email": *"[^"]*"' "$JSON_FILE" | sed 's/"client_email": *"\(.*\)"/\1/')
PRIVATE_KEY=$(grep -o '"private_key": *"[^"]*"' "$JSON_FILE" | sed 's/"private_key": *"\(.*\)"/\1/')

if [ -z "$CLIENT_EMAIL" ] || [ -z "$PRIVATE_KEY" ]; then
    echo "❌ Erro ao extrair credenciais do arquivo JSON"
    exit 1
fi

echo "✅ Client Email: $CLIENT_EMAIL"
echo "✅ Private Key: [REDACTED]"
echo ""

# Verificar se .env.local existe
if [ ! -f ".env.local" ]; then
    echo "⚠️  Arquivo .env.local não encontrado. Criando..."
    touch .env.local
fi

# Remover linhas antigas se existirem
sed -i '/^FIREBASE_CLIENT_EMAIL=/d' .env.local
sed -i '/^FIREBASE_PRIVATE_KEY=/d' .env.local

# Adicionar novas credenciais
echo "" >> .env.local
echo "# Firebase Admin (Server-side)" >> .env.local
echo "FIREBASE_CLIENT_EMAIL=$CLIENT_EMAIL" >> .env.local
echo "FIREBASE_PRIVATE_KEY=\"$PRIVATE_KEY\"" >> .env.local

echo "✅ Credenciais adicionadas ao .env.local"
echo ""
echo "🚀 Agora execute:"
echo "   npm run build && npm run start"
echo ""
echo "⚠️  IMPORTANTE: Nunca commite o arquivo .env.local no Git!"
