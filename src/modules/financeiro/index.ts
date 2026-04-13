import { Router, Request, Response } from 'express';
import { query, queryOne } from '../../database/connection';
import { Contrato, Paciente, Pagamento } from '../../shared/types';
import { enviarWhatsApp } from '../../integrations/twilio';
import { criarCobranca, criarClienteAsaas, validarWebhookAsaas } from '../../integrations/pagamentos';
import { format, addDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export const financeiroRouter = Router();

// ─── CRUD de Contratos ────────────────────────────────────────

// POST /api/contratos
financeiroRouter.post('/contratos', async (req: Request, res: Response) => {
  const { paciente_id, plano, valor, data_inicio, data_fim, forma_pagamento } = req.body as {
    paciente_id: string;
    plano: 'inicial' | 'acompanhamento' | 'premium';
    valor: number;
    data_inicio: string;
    data_fim: string;
    forma_pagamento: string;
  };

  if (!paciente_id || !plano || !valor || !data_inicio || !data_fim) {
    res.status(400).json({ error: 'Campos obrigatórios: paciente_id, plano, valor, data_inicio, data_fim' });
    return;
  }

  const [contrato] = await query<Contrato>(
    `INSERT INTO contratos (paciente_id, plano, valor, data_inicio, data_fim, forma_pagamento, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'ativo')
     RETURNING *`,
    [paciente_id, plano, valor, data_inicio, data_fim, forma_pagamento ?? 'pix']
  );

  // Atualiza status do paciente para ativo
  await query(
    `UPDATE pacientes SET status = 'ativo' WHERE id = $1`,
    [paciente_id]
  );

  res.status(201).json({ contrato });
});

// GET /api/contratos
financeiroRouter.get('/contratos', async (req: Request, res: Response) => {
  const { status, paciente_id } = req.query;

  let sql = `
    SELECT c.*, p.nome, p.whatsapp, p.email
    FROM contratos c
    JOIN pacientes p ON p.id = c.paciente_id
    WHERE 1=1
  `;
  const params: unknown[] = [];

  if (status) { sql += ` AND c.status = $${params.length + 1}`; params.push(status); }
  if (paciente_id) { sql += ` AND c.paciente_id = $${params.length + 1}`; params.push(paciente_id); }

  sql += ' ORDER BY c.created_at DESC LIMIT 100';

  const contratos = await query(sql, params);
  res.json({ contratos });
});

// PATCH /api/contratos/:id
financeiroRouter.patch('/contratos/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status } = req.body as { status: string };

  const [contrato] = await query<Contrato>(
    `UPDATE contratos SET status = $1 WHERE id = $2 RETURNING *`,
    [status, id]
  );

  if (!contrato) {
    res.status(404).json({ error: 'Contrato não encontrado' });
    return;
  }

  res.json({ contrato });
});

// GET /api/contratos/relatorio/:mes (formato: YYYY-MM)
financeiroRouter.get('/contratos/relatorio/:mes', async (req: Request, res: Response) => {
  const { mes } = req.params; // ex: "2026-04"
  const relatorio = await gerarRelatorio(mes);
  res.json(relatorio);
});

// ─── Pagamentos ───────────────────────────────────────────────

// POST /api/pagamentos/criar-cobranca
financeiroRouter.post('/pagamentos/criar-cobranca', async (req: Request, res: Response) => {
  const { contrato_id, forma_pagamento } = req.body as {
    contrato_id: string;
    forma_pagamento: 'BOLETO' | 'CREDIT_CARD' | 'PIX';
  };

  const contrato = await queryOne<Contrato & { nome: string; email: string; whatsapp: string }>(
    `SELECT c.*, p.nome, p.email, p.whatsapp
     FROM contratos c JOIN pacientes p ON p.id = c.paciente_id
     WHERE c.id = $1`,
    [contrato_id]
  );

  if (!contrato) {
    res.status(404).json({ error: 'Contrato não encontrado' });
    return;
  }

  try {
    // Cria cliente no Asaas se necessário
    const customerId = await criarClienteAsaas({
      name: contrato.nome,
      email: contrato.email,
      phone: contrato.whatsapp,
    });

    // Gera cobrança
    const vencimento = format(addDays(new Date(), 3), 'yyyy-MM-dd');
    const cobranca = await criarCobranca({
      customer: customerId,
      billingType: forma_pagamento ?? 'PIX',
      value: contrato.valor,
      dueDate: vencimento,
      description: `Plano ${contrato.plano} — ${contrato.nome}`,
    });

    // Salva pagamento pendente
    await query(
      `INSERT INTO pagamentos (contrato_id, valor, forma_pagamento, referencia_externa, status)
       VALUES ($1, $2, $3, $4, 'pendente')`,
      [contrato_id, contrato.valor, forma_pagamento, cobranca.id]
    );

    res.json({ cobranca });
  } catch (err) {
    console.error('[financeiro] Erro ao criar cobrança:', err);
    res.status(500).json({ error: 'Erro ao gerar cobrança no Asaas' });
  }
});

// POST /webhook/asaas — confirmação de pagamento
financeiroRouter.post('/webhook/asaas', async (req: Request, res: Response) => {
  const signature = req.headers['asaas-access-token'] as string ?? '';

  if (!validarWebhookAsaas(req.body, signature)) {
    res.status(401).json({ error: 'Assinatura inválida' });
    return;
  }

  const { event, payment } = req.body as {
    event: string;
    payment: { id: string; status: string; value: number; billingType: string };
  };

  if (event === 'PAYMENT_CONFIRMED' || event === 'PAYMENT_RECEIVED') {
    // Busca pagamento pelo ID externo
    const pagamento = await queryOne<Pagamento & { paciente_id: string; nome: string; whatsapp: string; plano: string }>(
      `SELECT pg.*, c.paciente_id, p.nome, p.whatsapp, c.plano
       FROM pagamentos pg
       JOIN contratos c ON c.id = pg.contrato_id
       JOIN pacientes p ON p.id = c.paciente_id
       WHERE pg.referencia_externa = $1`,
      [payment.id]
    );

    if (pagamento) {
      await query(
        `UPDATE pagamentos SET status = 'pago', data_pagamento = NOW() WHERE referencia_externa = $1`,
        [payment.id]
      );

      // Notifica o nutricionista
      const nutriWpp = process.env.NUTRICIONISTA_WHATSAPP;
      if (nutriWpp) {
        await enviarWhatsApp(
          nutriWpp,
          `💰 *PAGAMENTO CONFIRMADO*\n\n` +
          `👤 ${pagamento.nome}\n` +
          `📋 Plano: ${pagamento.plano}\n` +
          `💵 Valor: R$ ${payment.value.toFixed(2)}\n` +
          `💳 ${payment.billingType}`
        );
      }
    }
  }

  res.sendStatus(200);
});

// ─── Job diário: alertas de vencimento (às 08h) ───────────────

export async function verificarVencimentos(): Promise<void> {
  const em5Dias = format(addDays(new Date(), 5), 'yyyy-MM-dd');
  const em6Dias = format(addDays(new Date(), 6), 'yyyy-MM-dd');

  const contratos = await query<Contrato & { nome: string; whatsapp: string; email: string }>(
    `SELECT c.*, p.nome, p.whatsapp, p.email
     FROM contratos c
     JOIN pacientes p ON p.id = c.paciente_id
     WHERE c.status = 'ativo'
       AND c.data_fim BETWEEN $1 AND $2`,
    [em5Dias, em6Dias]
  );

  const nutriWpp = process.env.NUTRICIONISTA_WHATSAPP;

  for (const contrato of contratos) {
    const dataFim = format(new Date(contrato.data_fim), "dd/MM/yyyy", { locale: ptBR });
    const valorRenovacao = contrato.valor;

    // Mensagem para o PACIENTE
    await enviarWhatsApp(
      contrato.whatsapp,
      `Oi ${contrato.nome.split(' ')[0]}! 👋\n\n` +
      `Seu plano expira em *5 dias* (${dataFim}).\n\n` +
      `📋 Plano atual: *${contrato.plano}*\n` +
      `💰 Valor de renovação: R$ ${valorRenovacao.toFixed(2)}\n\n` +
      `Quer renovar? Me responda aqui que já gero seu link de pagamento! 💳\n` +
      `💬 Tem dúvida? É só me chamar!`
    );

    // Notificação para o NUTRICIONISTA
    if (nutriWpp) {
      await enviarWhatsApp(
        nutriWpp,
        `⚠️ *VENCIMENTO EM 5 DIAS*\n\n` +
        `👤 Paciente: ${contrato.nome}\n` +
        `📋 Plano: ${contrato.plano}\n` +
        `💰 Valor: R$ ${valorRenovacao.toFixed(2)}\n` +
        `📅 Data: ${dataFim}\n` +
        `📱 ${contrato.whatsapp}`
      );
    }

    console.log(`[financeiro] Alerta de vencimento enviado: ${contrato.nome}`);
  }

  // Contratos expirados — atualiza status
  await query(
    `UPDATE contratos SET status = 'expirado'
     WHERE status = 'ativo' AND data_fim < CURRENT_DATE`
  );
}

// ─── Relatório mensal (todo dia 1 às 09h) ────────────────────

export async function gerarRelatorio(mes: string): Promise<Record<string, unknown>> {
  const [ano, mesNum] = mes.split('-').map(Number);
  const inicio = `${mes}-01`;
  const fim = `${mes}-${new Date(ano, mesNum, 0).getDate()}`;

  // Receita total
  const [receita] = await query<{ total: string; pix: string; cartao: string }>(
    `SELECT
       COALESCE(SUM(valor), 0) AS total,
       COALESCE(SUM(CASE WHEN forma_pagamento = 'PIX' THEN valor ELSE 0 END), 0) AS pix,
       COALESCE(SUM(CASE WHEN forma_pagamento IN ('CREDIT_CARD','DEBIT_CARD') THEN valor ELSE 0 END), 0) AS cartao
     FROM pagamentos
     WHERE status = 'pago'
       AND data_pagamento BETWEEN $1 AND $2`,
    [inicio, fim]
  );

  // Pacientes por plano
  const planos = await query<{ plano: string; qtd: string; total: string }>(
    `SELECT c.plano, COUNT(*) AS qtd, SUM(c.valor) AS total
     FROM contratos c
     WHERE c.status = 'ativo'
     GROUP BY c.plano`
  );

  const nAtivos = planos.reduce((acc, p) => acc + parseInt(p.qtd), 0);

  // Vencimentos próximos (7 dias)
  const vencimentos = await query<{ nome: string; plano: string; data_fim: Date }>(
    `SELECT p.nome, c.plano, c.data_fim
     FROM contratos c
     JOIN pacientes p ON p.id = c.paciente_id
     WHERE c.status = 'ativo'
       AND c.data_fim BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'
     ORDER BY c.data_fim ASC`
  );

  // Taxa de renovação
  const [renovacoes] = await query<{ renovados: string; expirados: string }>(
    `SELECT
       COUNT(CASE WHEN status = 'ativo' THEN 1 END) AS renovados,
       COUNT(CASE WHEN status = 'expirado' THEN 1 END) AS expirados
     FROM contratos
     WHERE data_fim BETWEEN $1 AND $2`,
    [inicio, fim]
  );

  const totalContratos = parseInt(renovacoes.renovados) + parseInt(renovacoes.expirados);
  const taxaRenovacao = totalContratos > 0
    ? Math.round((parseInt(renovacoes.renovados) / totalContratos) * 100)
    : 0;

  // Novos pacientes no mês
  const [novos] = await query<{ qtd: string }>(
    `SELECT COUNT(*) AS qtd FROM pacientes
     WHERE created_at BETWEEN $1 AND $2`,
    [inicio + 'T00:00:00', fim + 'T23:59:59']
  );

  const totalReceita = parseFloat(receita.total);
  const totalPix = parseFloat(receita.pix);
  const totalCartao = parseFloat(receita.cartao);

  const planoPopular = planos.sort((a, b) => parseInt(b.qtd) - parseInt(a.qtd))[0]?.plano ?? '—';

  return {
    mes,
    receita: {
      total: totalReceita,
      pix: totalPix,
      pix_pct: totalReceita > 0 ? Math.round((totalPix / totalReceita) * 100) : 0,
      cartao: totalCartao,
      cartao_pct: totalReceita > 0 ? Math.round((totalCartao / totalReceita) * 100) : 0,
    },
    pacientes: {
      ativos: nAtivos,
      por_plano: Object.fromEntries(planos.map((p) => [p.plano, { qtd: parseInt(p.qtd), total: parseFloat(p.total) }])),
    },
    vencimentos_proximos: vencimentos.map((v) => ({
      nome: v.nome,
      plano: v.plano,
      data_fim: format(new Date(v.data_fim), 'dd/MM/yyyy', { locale: ptBR }),
    })),
    metricas: {
      taxa_renovacao: taxaRenovacao,
      plano_popular: planoPopular,
      novos_pacientes: parseInt(novos.qtd),
    },
  };
}

export async function enviarRelatorioMensal(): Promise<void> {
  const nutriWpp = process.env.NUTRICIONISTA_WHATSAPP;
  if (!nutriWpp) return;

  const agora = new Date();
  const mes = format(agora, 'yyyy-MM');
  const mesAnterior = format(new Date(agora.getFullYear(), agora.getMonth() - 1, 1), 'yyyy-MM');
  const rel = await gerarRelatorio(mesAnterior);

  const [anoStr, mesStr] = mesAnterior.split('-');
  const mesFormatado = format(new Date(parseInt(anoStr), parseInt(mesStr) - 1), 'MMMM/yyyy', { locale: ptBR }).toUpperCase();

  const planos = rel.pacientes as { ativos: number; por_plano: Record<string, { qtd: number; total: number }> };
  const receita = rel.receita as { total: number; pix: number; pix_pct: number; cartao: number; cartao_pct: number };
  const metricas = rel.metricas as { taxa_renovacao: number; plano_popular: string; novos_pacientes: number };
  const vencimentos = rel.vencimentos_proximos as { nome: string; plano: string; data_fim: string }[];

  const listaVenc = vencimentos.length
    ? vencimentos.map((v) => `• ${v.nome} (${v.plano}) — ${v.data_fim}`).join('\n')
    : '• Nenhum vencimento nos próximos 7 dias';

  const mensagem =
    `📊 *RELATÓRIO FINANCEIRO — ${mesFormatado}*\n\n` +
    `💰 *RECEITA TOTAL: R$ ${receita.total.toFixed(2)}*\n` +
    `   Pix: R$ ${receita.pix.toFixed(2)} (${receita.pix_pct}%)\n` +
    `   Cartão: R$ ${receita.cartao.toFixed(2)} (${receita.cartao_pct}%)\n\n` +
    `📈 *PACIENTES ATIVOS: ${planos.ativos}*\n` +
    Object.entries(planos.por_plano).map(([p, d]) =>
      `   ${p}: ${d.qtd} pacientes — R$ ${d.total.toFixed(2)}`
    ).join('\n') + '\n\n' +
    `⚠️ *VENCIMENTOS PRÓXIMOS (7 dias):*\n${listaVenc}\n\n` +
    `🎯 *MÉTRICAS:*\n` +
    `   Taxa de renovação: ${metricas.taxa_renovacao}%\n` +
    `   Plano mais popular: ${metricas.plano_popular}\n` +
    `   Novos pacientes: ${metricas.novos_pacientes}`;

  await enviarWhatsApp(nutriWpp, mensagem);
  console.log('[financeiro] Relatório mensal enviado.');
}
