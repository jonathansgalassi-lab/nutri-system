import { Router, Request, Response } from 'express';
import { processarMensagem } from './estados';

export const chatbotRouter = Router();

/**
 * POST /webhook/whatsapp
 * Recebe mensagens do Twilio ou Evolution API
 */
chatbotRouter.post('/', async (req: Request, res: Response) => {
  try {
    // ── Twilio ──────────────────────────────────────────────
    // Twilio envia form-encoded: From=whatsapp:+55..., Body=texto
    if (req.body?.From && req.body?.Body) {
      // Mantém o + internacional: whatsapp:+5543... → +5543...
      const whatsapp = String(req.body.From).replace('whatsapp:', '');
      const texto = String(req.body.Body).trim();

      console.log(`[chatbot] Twilio | ${whatsapp}: "${texto}" (chatbot inativo)`);
      // Chatbot inativo — resposta automática desabilitada
      // await processarMensagem(whatsapp, texto);

      // Twilio espera TwiML ou 200 vazio
      res.set('Content-Type', 'text/xml');
      res.send('<Response></Response>');
      return;
    }

    // ── Evolution API ────────────────────────────────────────
    // Evolution envia JSON com estrutura: data.key.remoteJid + data.message.conversation
    if (req.body?.data?.key?.remoteJid) {
      const remoteJid: string = req.body.data.key.remoteJid;

      // Ignora mensagens de grupos (@g.us), status (@broadcast) e do próprio bot (fromMe)
      if (!remoteJid.endsWith('@s.whatsapp.net')) {
        res.sendStatus(200);
        return;
      }
      if (req.body.data.key.fromMe === true) {
        res.sendStatus(200);
        return;
      }

      const whatsapp = remoteJid.replace('@s.whatsapp.net', '');
      const texto =
        req.body.data.message?.conversation ??
        req.body.data.message?.extendedTextMessage?.text ??
        '';

      if (!texto) {
        res.sendStatus(200);
        return;
      }

      console.log(`[chatbot] Evolution | ${whatsapp}: "${texto}" (chatbot inativo)`);
      // Chatbot inativo — resposta automática desabilitada
      // await processarMensagem(whatsapp, texto);

      res.sendStatus(200);
      return;
    }

    // Payload desconhecido
    res.sendStatus(200);
  } catch (err) {
    console.error('[chatbot] Erro ao processar mensagem:', err);
    res.sendStatus(500);
  }
});

/**
 * GET /webhook/whatsapp
 * Verificação do webhook pelo Twilio/Meta
 */
chatbotRouter.get('/', (req: Request, res: Response) => {
  const challenge = req.query['hub.challenge'];
  if (challenge) {
    res.send(challenge);
  } else {
    res.send('Webhook ativo');
  }
});
