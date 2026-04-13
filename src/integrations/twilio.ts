import twilio from 'twilio';
import dotenv from 'dotenv';

dotenv.config();

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_WHATSAPP_NUMBER ?? 'whatsapp:+55XXXXXXXXXXX';

if (!accountSid || !authToken) {
  console.warn('Credenciais Twilio não configuradas. WhatsApp desabilitado.');
}

export const twilioClient = accountSid && authToken
  ? twilio(accountSid, authToken)
  : null;

export async function enviarWhatsApp(para: string, mensagem: string): Promise<void> {
  if (!twilioClient) {
    console.log(`[WhatsApp MOCK] Para: ${para}\n${mensagem}`);
    return;
  }

  const numero = para.startsWith('whatsapp:') ? para : `whatsapp:${para}`;

  await twilioClient.messages.create({
    from: fromNumber,
    to: numero,
    body: mensagem,
  });
}
