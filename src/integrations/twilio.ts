import twilio from 'twilio';
import dotenv from 'dotenv';

dotenv.config();

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_WHATSAPP_NUMBER ?? 'whatsapp:+55XXXXXXXXXXX';

const evolutionApiUrl = process.env.EVOLUTION_API_URL;
const evolutionApiKey = process.env.EVOLUTION_API_KEY;
const evolutionInstance = process.env.EVOLUTION_INSTANCE ?? 'nutri-system';

if (!accountSid && !authToken && !evolutionApiUrl) {
  console.warn('[whatsapp] Nenhuma integração WhatsApp configurada (Twilio ou Evolution API). Mensagens em modo MOCK.');
}

export const twilioClient = accountSid && authToken
  ? twilio(accountSid, authToken)
  : null;

// ── Envio via Evolution API ────────────────────────────────────

async function enviarViaEvolution(para: string, mensagem: string): Promise<void> {
  // Remove caracteres não numéricos e garante código do país
  const numero = para.replace(/\D/g, '');

  const url = `${evolutionApiUrl}/message/sendText/${evolutionInstance}`;

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: evolutionApiKey ?? '',
    },
    body: JSON.stringify({
      number: numero,
      options: { delay: 500, presence: 'composing' },
      textMessage: { text: mensagem },
    }),
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`[Evolution] HTTP ${resp.status}: ${body}`);
  }
}

// ── Envio via Twilio ───────────────────────────────────────────

async function enviarViaTwilio(para: string, mensagem: string): Promise<void> {
  if (!twilioClient) throw new Error('[Twilio] Cliente não inicializado');
  const numero = para.startsWith('whatsapp:') ? para : `whatsapp:${para}`;
  await twilioClient.messages.create({ from: fromNumber, to: numero, body: mensagem });
}

// ── Função pública ─────────────────────────────────────────────

export async function enviarWhatsApp(para: string, mensagem: string): Promise<void> {
  // Prioridade: Evolution API > Twilio > MOCK
  if (evolutionApiUrl && evolutionApiKey) {
    await enviarViaEvolution(para, mensagem);
    return;
  }

  if (twilioClient) {
    await enviarViaTwilio(para, mensagem);
    return;
  }

  console.log(`[WhatsApp MOCK] Para: ${para}\n${mensagem}`);
}
