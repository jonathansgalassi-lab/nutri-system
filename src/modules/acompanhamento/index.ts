import { Router, Request, Response } from 'express';
import { query, queryOne } from '../../database/connection';
import { Paciente, Checkin, Consulta } from '../../shared/types';
import { enviarWhatsApp } from '../../integrations/twilio';
import { differenceInWeeks } from 'date-fns';

export const acompanhamentoRouter = Router();

// ─── Templates de check-in ────────────────────────────────────

const CHECKINS_ROTATIVOS = [
  // Semana 1 — Feedback geral
  (nome: string) => `Oi ${nome}! 👋 Como foi sua semana com o plano?

1️⃣ ⭐⭐⭐⭐⭐ Ótimo! Segui certinho
2️⃣ ⭐⭐⭐⭐ Bom, com poucos desvios
3️⃣ ⭐⭐⭐ Normal, com dificuldades
4️⃣ ⭐⭐ Difícil, mas tentei
5️⃣ ⭐ Não consegui seguir

(Responde com o número)`,

  // Semana 2 — Preferências
  (nome: string) => `Oi ${nome}! 🍽️ Alguma refeição que você não tá curtindo?

1️⃣ Não, tá ótimo assim!
2️⃣ O café da manhã tá repetitivo
3️⃣ Tenho dificuldade com o almoço
4️⃣ O jantar não tá me agradando
5️⃣ Quero trocar várias refeições`,

  // Semana 3 — Dificuldades
  (nome: string) => `Oi ${nome}! Você tá tendo alguma dificuldade? 🤔

1️⃣ Nenhuma, tudo certo!
2️⃣ Falta de tempo para preparar
3️⃣ Custo dos alimentos
4️⃣ Situações sociais (festas, almoços fora)
5️⃣ Outro motivo`,

  // Semana 4 — Reavaliação
  (nome: string) => `Oi ${nome}! Já se passou 1 mês! 🎉

Que tal agendarmos sua reavaliação para ver os resultados?

1️⃣ Sim, quero agendar!
2️⃣ Prefiro em mais 2 semanas
3️⃣ Tenho uma dúvida antes`,
];

// ─── Respostas ao feedback ────────────────────────────────────

async function responderFeedback(
  whatsapp: string,
  pacienteId: string,
  score: number,
  semanaCheckin: number
) {
  let msg = '';

  if (semanaCheckin % 4 === 3 && score === 1) {
    // Semana 4, resposta "sim" → agendamento
    const baseUrl = process.env.BASE_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;
    msg = `Que ótimo! 🎉 Clica aqui para agendar sua reavaliação:\n${baseUrl}/preconsulta?wpp=${encodeURIComponent(whatsapp)}`;
  } else if (score >= 4) {
    msg = `Incrível, ${score === 5 ? 'você está arrasando' : 'ótimo desempenho'}! 🏆\n\nContinue assim! Quer fazer algum ajuste no plano ou está tudo bem?`;
  } else if (score <= 2) {
    msg = `Sem problema, a jornada tem altos e baixos! 💪\n\nMe conta: o que foi mais difícil essa semana? Assim a nutricionista pode ajustar o plano pra ficar mais fácil pra você.`;
  } else {
    msg = `Normal ter dificuldades! 😊\n\nSe precisar de ajuste em alguma refeição, é só me dizer que a nutricionista analisa.`;
  }

  if (msg) await enviarWhatsApp(whatsapp, msg);

  // Salva o check-in
  await query(
    `INSERT INTO checkins (paciente_id, semana_numero, score_aderencia, respondido_em)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT DO NOTHING`,
    [pacienteId, semanaCheckin, score]
  );

  // Verifica alertas
  await verificarAlertas(pacienteId, whatsapp);
}

// ─── Sistema de alertas ───────────────────────────────────────

export async function verificarAlertas(pacienteId: string, whatsapp: string) {
  const nutriWpp = process.env.NUTRICIONISTA_WHATSAPP;
  if (!nutriWpp) return;

  const paciente = await queryOne<Paciente>(
    'SELECT * FROM pacientes WHERE id = $1',
    [pacienteId]
  );
  if (!paciente) return;

  // 🚨 ALERTA VERMELHO: sem resposta há 14+ dias
  const ultimoCheckin = await queryOne<{ respondido_em: Date }>(
    `SELECT respondido_em FROM checkins
     WHERE paciente_id = $1 AND respondido_em IS NOT NULL
     ORDER BY respondido_em DESC LIMIT 1`,
    [pacienteId]
  );

  if (!ultimoCheckin) return;

  const diasSemResposta = Math.floor(
    (Date.now() - new Date(ultimoCheckin.respondido_em).getTime()) / 86_400_000
  );

  if (diasSemResposta >= 14) {
    await enviarWhatsApp(
      nutriWpp,
      `🚨 *ALERTA VERMELHO*\n\n${paciente.nome} está sem responder há ${diasSemResposta} dias.\n📱 ${paciente.whatsapp}`
    );
    return;
  }

  // ⚠️ ALERTA AMARELO: score 1-2 por 2+ semanas consecutivas
  const ultimosCheckins = await query<Checkin>(
    `SELECT * FROM checkins
     WHERE paciente_id = $1
     ORDER BY semana_numero DESC LIMIT 2`,
    [pacienteId]
  );

  if (
    ultimosCheckins.length === 2 &&
    ultimosCheckins.every((c) => c.score_aderencia <= 2)
  ) {
    await enviarWhatsApp(
      nutriWpp,
      `⚠️ *ALERTA AMARELO*\n\n${paciente.nome} está com score baixo (≤2) por 2 semanas seguidas.\nConsidere revisar o plano.\n📱 ${paciente.whatsapp}`
    );
    return;
  }

  // ✅ ALERTA VERDE: score 4-5 por 3+ semanas
  const topCheckins = await query<Checkin>(
    `SELECT * FROM checkins
     WHERE paciente_id = $1
     ORDER BY semana_numero DESC LIMIT 3`,
    [pacienteId]
  );

  if (
    topCheckins.length === 3 &&
    topCheckins.every((c) => c.score_aderencia >= 4)
  ) {
    await enviarWhatsApp(
      nutriWpp,
      `✅ *ALERTA VERDE*\n\n${paciente.nome} está com aderência excelente por 3 semanas seguidas! 🎉\n📱 ${paciente.whatsapp}`
    );
  }
}

// ─── Job semanal (toda segunda às 08h) ───────────────────────

export async function enviarCheckinsSemana(): Promise<void> {
  // Busca pacientes ativos com pelo menos uma consulta realizada
  const pacientes = await query<Paciente & { data_consulta: Date }>(
    `SELECT DISTINCT p.*, c.data_hora AS data_consulta
     FROM pacientes p
     JOIN consultas c ON c.paciente_id = p.id
     WHERE p.status = 'ativo'
       AND c.status = 'realizada'
     ORDER BY p.id`
  );

  for (const paciente of pacientes) {
    const semanaAtual = differenceInWeeks(new Date(), new Date(paciente.data_consulta)) + 1;
    const tipoCheckin = (semanaAtual - 1) % 4; // 0, 1, 2 ou 3

    const templateFn = CHECKINS_ROTATIVOS[tipoCheckin];
    const primeiroNome = paciente.nome.split(' ')[0];

    try {
      await enviarWhatsApp(paciente.whatsapp, templateFn(primeiroNome));
      console.log(`[acompanhamento] Check-in enviado: ${paciente.nome} (semana ${semanaAtual})`);
    } catch (err) {
      console.error(`[acompanhamento] Erro ao enviar para ${paciente.whatsapp}:`, err);
    }
  }
}

// ─── Webhook: resposta do paciente ao check-in ────────────────
// (integrado ao chatbot — rota aqui para registro manual)

acompanhamentoRouter.post('/resposta', async (req: Request, res: Response) => {
  const { paciente_id, score, semana_numero, dificuldades } = req.body as {
    paciente_id: string;
    score: number;
    semana_numero: number;
    dificuldades?: string;
  };

  if (!paciente_id || !score || !semana_numero) {
    res.status(400).json({ error: 'paciente_id, score e semana_numero são obrigatórios' });
    return;
  }

  const paciente = await queryOne<Paciente>(
    'SELECT * FROM pacientes WHERE id = $1',
    [paciente_id]
  );

  if (!paciente) {
    res.status(404).json({ error: 'Paciente não encontrado' });
    return;
  }

  await query(
    `INSERT INTO checkins (paciente_id, semana_numero, score_aderencia, dificuldades, respondido_em)
     VALUES ($1, $2, $3, $4, NOW())`,
    [paciente_id, semana_numero, score, dificuldades ?? null]
  );

  await responderFeedback(paciente.whatsapp, paciente_id, score, semana_numero);

  res.json({ success: true });
});

// ─── GET /api/acompanhamento/:paciente_id — histórico ─────────

acompanhamentoRouter.get('/:paciente_id', async (req: Request, res: Response) => {
  const { paciente_id } = req.params;

  const checkins = await query<Checkin>(
    `SELECT * FROM checkins WHERE paciente_id = $1 ORDER BY semana_numero ASC`,
    [paciente_id]
  );

  res.json({ checkins });
});

export { responderFeedback };
