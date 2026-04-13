#!/usr/bin/env node
/**
 * Script para obter o Refresh Token do Google Calendar OAuth2
 * Uso: node scripts/get-refresh-token.js
 */

// Configure via variáveis de ambiente ou edite aqui:
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || 'SEU_CLIENT_ID_AQUI';
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || 'SEU_CLIENT_SECRET_AQUI';
const REDIRECT_URI = 'https://developers.google.com/oauthplayground';

const SCOPE = 'https://www.googleapis.com/auth/calendar';

const authUrl =
  `https://accounts.google.com/o/oauth2/v2/auth?` +
  `client_id=${encodeURIComponent(CLIENT_ID)}&` +
  `redirect_uri=${encodeURIComponent(REDIRECT_URI)}&` +
  `response_type=code&` +
  `scope=${encodeURIComponent(SCOPE)}&` +
  `access_type=offline&` +
  `prompt=consent`;

console.log('\n=== PASSO 1: Abra a URL abaixo no navegador ===\n');
console.log(authUrl);
console.log('\n=== PASSO 2: Faça login com a conta Google do nutricionista ===');
console.log('Após autorizar, você receberá um código. Cole-o abaixo.\n');

const readline = require('readline');
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

rl.question('Cole o código aqui: ', async (code) => {
  rl.close();
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    code: code.trim(),
    grant_type: 'authorization_code',
    redirect_uri: REDIRECT_URI,
  });

  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    const data = await res.json();

    if (data.error) {
      console.error('\n❌ Erro:', data.error, data.error_description);
    } else {
      console.log('\n✅ SUCESSO! Configure as variáveis no Railway:\n');
      console.log(`GOOGLE_CLIENT_ID=${CLIENT_ID}`);
      console.log(`GOOGLE_CLIENT_SECRET=${CLIENT_SECRET}`);
      console.log(`GOOGLE_REFRESH_TOKEN=${data.refresh_token}`);
      console.log('\n⚠️  Copie o GOOGLE_REFRESH_TOKEN acima e salve em local seguro!');
    }
  } catch (e) {
    console.error('Erro na requisição:', e.message);
  }
});
