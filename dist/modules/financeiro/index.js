"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.financeiroRouter = void 0;
exports.verificarVencimentos = verificarVencimentos;
exports.gerarRelatorio = gerarRelatorio;
exports.enviarRelatorioMensal = enviarRelatorioMensal;
exports.enviarRelatorioSemanal = enviarRelatorioSemanal;
const express_1 = require("express");
const connection_1 = require("../../database/connection");
const twilio_1 = require("../../integrations/twilio");
const pagamentos_1 = require("../../integrations/pagamentos");
const webdiet_1 = require("../../integrations/webdiet");
const date_fns_1 = require("date-fns");
const locale_1 = require("date-fns/locale");
exports.financeiroRouter = (0, express_1.Router)();
// ─── CRUD de Contratos ────────────────────────────────────────
// POST /api/contratos
exports.financeiroRouter.post('/contratos', async (req, res) => {
    const { paciente_id, plano, valor, data_inicio, data_fim, forma_pagamento } = req.body;
    if (!paciente_id || !plano || !valor || !data_inicio || !data_fim) {
        res.status(400).json({ error: 'Campos obrigatórios: paciente_id, plano, valor, data_inicio, data_fim' });
        return;
    }
    const [contrato] = await (0, connection_1.query)(`INSERT INTO contratos (paciente_id, plano, valor, data_inicio, data_fim, forma_pagamento, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'ativo')
     RETURNING *`, [paciente_id, plano, valor, data_inicio, data_fim, forma_pagamento ?? 'pix']);
    // Atualiza status do paciente para ativo
    await (0, connection_1.query)(`UPDATE pacientes SET status = 'ativo' WHERE id = $1`, [paciente_id]);
    res.status(201).json({ contrato });
});
// GET /api/contratos
exports.financeiroRouter.get('/contratos', async (req, res) => {
    const { status, paciente_id } = req.query;
    let sql = `
    SELECT c.*, p.nome, p.whatsapp, p.email
    FROM contratos c
    JOIN pacientes p ON p.id = c.paciente_id
    WHERE 1=1
  `;
    const params = [];
    if (status) {
        sql += ` AND c.status = $${params.length + 1}`;
        params.push(status);
    }
    if (paciente_id) {
        sql += ` AND c.paciente_id = $${params.length + 1}`;
        params.push(paciente_id);
    }
    sql += ' ORDER BY c.created_at DESC LIMIT 100';
    const contratos = await (0, connection_1.query)(sql, params);
    res.json({ contratos });
});
// PATCH /api/contratos/:id
exports.financeiroRouter.patch('/contratos/:id', async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    const [contrato] = await (0, connection_1.query)(`UPDATE contratos SET status = $1 WHERE id = $2 RETURNING *`, [status, id]);
    if (!contrato) {
        res.status(404).json({ error: 'Contrato não encontrado' });
        return;
    }
    res.json({ contrato });
});
// GET /api/contratos/relatorio/:mes (formato: YYYY-MM)
exports.financeiroRouter.get('/contratos/relatorio/:mes', async (req, res) => {
    const { mes } = req.params; // ex: "2026-04"
    const relatorio = await gerarRelatorio(mes);
    res.json(relatorio);
});
// ─── Pagamentos ───────────────────────────────────────────────
// POST /api/pagamentos/criar-cobranca
exports.financeiroRouter.post('/pagamentos/criar-cobranca', async (req, res) => {
    const { contrato_id, forma_pagamento } = req.body;
    const contrato = await (0, connection_1.queryOne)(`SELECT c.*, p.nome, p.email, p.whatsapp
     FROM contratos c JOIN pacientes p ON p.id = c.paciente_id
     WHERE c.id = $1`, [contrato_id]);
    if (!contrato) {
        res.status(404).json({ error: 'Contrato não encontrado' });
        return;
    }
    try {
        // Cria cliente no Asaas se necessário
        const customerId = await (0, pagamentos_1.criarClienteAsaas)({
            name: contrato.nome,
            email: contrato.email,
            phone: contrato.whatsapp,
        });
        // Gera cobrança
        const vencimento = (0, date_fns_1.format)((0, date_fns_1.addDays)(new Date(), 3), 'yyyy-MM-dd');
        const cobranca = await (0, pagamentos_1.criarCobranca)({
            customer: customerId,
            billingType: forma_pagamento ?? 'PIX',
            value: contrato.valor,
            dueDate: vencimento,
            description: `Plano ${contrato.plano} — ${contrato.nome}`,
        });
        // Salva pagamento pendente
        await (0, connection_1.query)(`INSERT INTO pagamentos (contrato_id, valor, forma_pagamento, referencia_externa, status)
       VALUES ($1, $2, $3, $4, 'pendente')`, [contrato_id, contrato.valor, forma_pagamento, cobranca.id]);
        res.json({ cobranca });
    }
    catch (err) {
        console.error('[financeiro] Erro ao criar cobrança:', err);
        res.status(500).json({ error: 'Erro ao gerar cobrança no Asaas' });
    }
});
// POST /webhook/asaas — confirmação de pagamento
exports.financeiroRouter.post('/webhook/asaas', async (req, res) => {
    const signature = req.headers['asaas-access-token'] ?? '';
    if (!(0, pagamentos_1.validarWebhookAsaas)(req.body, signature)) {
        res.status(401).json({ error: 'Assinatura inválida' });
        return;
    }
    const { event, payment } = req.body;
    if (event === 'PAYMENT_CONFIRMED' || event === 'PAYMENT_RECEIVED') {
        // Busca pagamento pelo ID externo
        const pagamento = await (0, connection_1.queryOne)(`SELECT pg.*, c.paciente_id, p.nome, p.whatsapp, c.plano
       FROM pagamentos pg
       JOIN contratos c ON c.id = pg.contrato_id
       JOIN pacientes p ON p.id = c.paciente_id
       WHERE pg.referencia_externa = $1`, [payment.id]);
        if (pagamento) {
            await (0, connection_1.query)(`UPDATE pagamentos SET status = 'pago', data_pagamento = NOW() WHERE referencia_externa = $1`, [payment.id]);
            // Notifica o nutricionista
            const nutriWpp = process.env.NUTRICIONISTA_WHATSAPP;
            if (nutriWpp) {
                await (0, twilio_1.enviarWhatsApp)(nutriWpp, `💰 *PAGAMENTO CONFIRMADO*\n\n` +
                    `👤 ${pagamento.nome}\n` +
                    `📋 Plano: ${pagamento.plano}\n` +
                    `💵 Valor: R$ ${payment.value.toFixed(2)}\n` +
                    `💳 ${payment.billingType}`);
            }
            // Lança automaticamente no Financeiro do WebDiet (background)
            (0, webdiet_1.lancarPagamentoWebdiet)({
                nomePaciente: pagamento.nome,
                nomeLancamento: `Plano ${pagamento.plano}`,
                valor: payment.value,
                formaPagamento: payment.billingType,
                categoria: 'Consulta',
                observacao: `Asaas #${payment.id}`,
            }).catch((err) => {
                console.error('[financeiro] Erro ao lançar no WebDiet:', err.message);
            });
        }
    }
    res.sendStatus(200);
});
// ─── Job diário: alertas de vencimento (às 08h) ───────────────
async function verificarVencimentos() {
    const em5Dias = (0, date_fns_1.format)((0, date_fns_1.addDays)(new Date(), 5), 'yyyy-MM-dd');
    const em6Dias = (0, date_fns_1.format)((0, date_fns_1.addDays)(new Date(), 6), 'yyyy-MM-dd');
    const contratos = await (0, connection_1.query)(`SELECT c.*, p.nome, p.whatsapp, p.email
     FROM contratos c
     JOIN pacientes p ON p.id = c.paciente_id
     WHERE c.status = 'ativo'
       AND c.data_fim BETWEEN $1 AND $2`, [em5Dias, em6Dias]);
    const nutriWpp = process.env.NUTRICIONISTA_WHATSAPP;
    for (const contrato of contratos) {
        const dataFim = (0, date_fns_1.format)(new Date(contrato.data_fim), "dd/MM/yyyy", { locale: locale_1.ptBR });
        const valorRenovacao = contrato.valor;
        // Mensagem para o PACIENTE
        await (0, twilio_1.enviarWhatsApp)(contrato.whatsapp, `Oi ${contrato.nome.split(' ')[0]}! 👋\n\n` +
            `Seu plano expira em *5 dias* (${dataFim}).\n\n` +
            `📋 Plano atual: *${contrato.plano}*\n` +
            `💰 Valor de renovação: R$ ${valorRenovacao.toFixed(2)}\n\n` +
            `Quer renovar? Me responda aqui que já gero seu link de pagamento! 💳\n` +
            `💬 Tem dúvida? É só me chamar!`);
        // Notificação para o NUTRICIONISTA
        if (nutriWpp) {
            await (0, twilio_1.enviarWhatsApp)(nutriWpp, `⚠️ *VENCIMENTO EM 5 DIAS*\n\n` +
                `👤 Paciente: ${contrato.nome}\n` +
                `📋 Plano: ${contrato.plano}\n` +
                `💰 Valor: R$ ${valorRenovacao.toFixed(2)}\n` +
                `📅 Data: ${dataFim}\n` +
                `📱 ${contrato.whatsapp}`);
        }
        console.log(`[financeiro] Alerta de vencimento enviado: ${contrato.nome}`);
    }
    // Contratos expirados — atualiza status
    await (0, connection_1.query)(`UPDATE contratos SET status = 'expirado'
     WHERE status = 'ativo' AND data_fim < CURRENT_DATE`);
}
// ─── Relatório mensal (todo dia 1 às 09h) ────────────────────
async function gerarRelatorio(mes) {
    const [ano, mesNum] = mes.split('-').map(Number);
    const inicio = `${mes}-01`;
    const fim = `${mes}-${new Date(ano, mesNum, 0).getDate()}`;
    // Receita total
    const [receita] = await (0, connection_1.query)(`SELECT
       COALESCE(SUM(valor), 0) AS total,
       COALESCE(SUM(CASE WHEN forma_pagamento = 'PIX' THEN valor ELSE 0 END), 0) AS pix,
       COALESCE(SUM(CASE WHEN forma_pagamento IN ('CREDIT_CARD','DEBIT_CARD') THEN valor ELSE 0 END), 0) AS cartao
     FROM pagamentos
     WHERE status = 'pago'
       AND data_pagamento BETWEEN $1 AND $2`, [inicio, fim]);
    // Pacientes por plano
    const planos = await (0, connection_1.query)(`SELECT c.plano, COUNT(*) AS qtd, SUM(c.valor) AS total
     FROM contratos c
     WHERE c.status = 'ativo'
     GROUP BY c.plano`);
    const nAtivos = planos.reduce((acc, p) => acc + parseInt(p.qtd), 0);
    // Vencimentos próximos (7 dias)
    const vencimentos = await (0, connection_1.query)(`SELECT p.nome, c.plano, c.data_fim
     FROM contratos c
     JOIN pacientes p ON p.id = c.paciente_id
     WHERE c.status = 'ativo'
       AND c.data_fim BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'
     ORDER BY c.data_fim ASC`);
    // Taxa de renovação
    const [renovacoes] = await (0, connection_1.query)(`SELECT
       COUNT(CASE WHEN status = 'ativo' THEN 1 END) AS renovados,
       COUNT(CASE WHEN status = 'expirado' THEN 1 END) AS expirados
     FROM contratos
     WHERE data_fim BETWEEN $1 AND $2`, [inicio, fim]);
    const totalContratos = parseInt(renovacoes.renovados) + parseInt(renovacoes.expirados);
    const taxaRenovacao = totalContratos > 0
        ? Math.round((parseInt(renovacoes.renovados) / totalContratos) * 100)
        : 0;
    // Novos pacientes no mês
    const [novos] = await (0, connection_1.query)(`SELECT COUNT(*) AS qtd FROM pacientes
     WHERE created_at BETWEEN $1 AND $2`, [inicio + 'T00:00:00', fim + 'T23:59:59']);
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
            data_fim: (0, date_fns_1.format)(new Date(v.data_fim), 'dd/MM/yyyy', { locale: locale_1.ptBR }),
        })),
        metricas: {
            taxa_renovacao: taxaRenovacao,
            plano_popular: planoPopular,
            novos_pacientes: parseInt(novos.qtd),
        },
    };
}
async function enviarRelatorioMensal() {
    const nutriWpp = process.env.NUTRICIONISTA_WHATSAPP;
    if (!nutriWpp)
        return;
    const agora = new Date();
    const mes = (0, date_fns_1.format)(agora, 'yyyy-MM');
    const mesAnterior = (0, date_fns_1.format)(new Date(agora.getFullYear(), agora.getMonth() - 1, 1), 'yyyy-MM');
    const rel = await gerarRelatorio(mesAnterior);
    const [anoStr, mesStr] = mesAnterior.split('-');
    const mesFormatado = (0, date_fns_1.format)(new Date(parseInt(anoStr), parseInt(mesStr) - 1), 'MMMM/yyyy', { locale: locale_1.ptBR }).toUpperCase();
    const planos = rel.pacientes;
    const receita = rel.receita;
    const metricas = rel.metricas;
    const vencimentos = rel.vencimentos_proximos;
    const listaVenc = vencimentos.length
        ? vencimentos.map((v) => `• ${v.nome} (${v.plano}) — ${v.data_fim}`).join('\n')
        : '• Nenhum vencimento nos próximos 7 dias';
    const mensagem = `📊 *RELATÓRIO FINANCEIRO — ${mesFormatado}*\n\n` +
        `💰 *RECEITA TOTAL: R$ ${receita.total.toFixed(2)}*\n` +
        `   Pix: R$ ${receita.pix.toFixed(2)} (${receita.pix_pct}%)\n` +
        `   Cartão: R$ ${receita.cartao.toFixed(2)} (${receita.cartao_pct}%)\n\n` +
        `📈 *PACIENTES ATIVOS: ${planos.ativos}*\n` +
        Object.entries(planos.por_plano).map(([p, d]) => `   ${p}: ${d.qtd} pacientes — R$ ${d.total.toFixed(2)}`).join('\n') + '\n\n' +
        `⚠️ *VENCIMENTOS PRÓXIMOS (7 dias):*\n${listaVenc}\n\n` +
        `🎯 *MÉTRICAS:*\n` +
        `   Taxa de renovação: ${metricas.taxa_renovacao}%\n` +
        `   Plano mais popular: ${metricas.plano_popular}\n` +
        `   Novos pacientes: ${metricas.novos_pacientes}`;
    await (0, twilio_1.enviarWhatsApp)(nutriWpp, mensagem);
    console.log('[financeiro] Relatório mensal enviado.');
}
// ─── Relatório semanal com dados do WebDiet (sexta às 18h) ───
async function enviarRelatorioSemanal() {
    const nutriWpp = process.env.NUTRICIONISTA_WHATSAPP;
    if (!nutriWpp)
        return;
    // Janela da semana (últimos 7 dias)
    const hoje = new Date();
    const semanaPassada = new Date(hoje);
    semanaPassada.setDate(hoje.getDate() - 7);
    const inicio = (0, date_fns_1.format)(semanaPassada, 'yyyy-MM-dd');
    const fim = (0, date_fns_1.format)(hoje, 'yyyy-MM-dd');
    // ── Dados do nosso banco ──────────────────────────────────────
    const [pagamentosResult] = await (0, connection_1.query)(`SELECT COALESCE(SUM(valor), 0) AS total, COUNT(*) AS qtd
     FROM pagamentos
     WHERE status = 'pago' AND data_pagamento BETWEEN $1 AND $2`, [inicio + 'T00:00:00', fim + 'T23:59:59']);
    const [novosPacientesResult] = await (0, connection_1.query)(`SELECT COUNT(*) AS qtd FROM pacientes WHERE created_at BETWEEN $1 AND $2`, [inicio + 'T00:00:00', fim + 'T23:59:59']);
    const [ativosResult] = await (0, connection_1.query)(`SELECT COUNT(*) AS qtd FROM contratos WHERE status = 'ativo'`);
    const vencimentos7dias = await (0, connection_1.query)(`SELECT p.nome, c.plano, c.data_fim
     FROM contratos c
     JOIN pacientes p ON p.id = c.paciente_id
     WHERE c.status = 'ativo'
       AND c.data_fim BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'
     ORDER BY c.data_fim ASC LIMIT 5`);
    const receitaSemana = parseFloat(pagamentosResult?.total ?? '0');
    const qtdPagamentos = parseInt(pagamentosResult?.qtd ?? '0');
    const novosPacientes = parseInt(novosPacientesResult?.qtd ?? '0');
    const totalAtivos = parseInt(ativosResult?.qtd ?? '0');
    // ── Dados do WebDiet (best-effort) ────────────────────────────
    let linhaWebDiet = '';
    try {
        const stats = await (0, webdiet_1.obterEstatisticasWebdiet)();
        if (stats) {
            linhaWebDiet =
                `\n📊 *WebDiet esta semana:*\n` +
                    `   🧑‍⚕️ Pacientes cadastrados: ${stats.totalPacientes}\n` +
                    `   📋 Consultas registradas: ${stats.totalConsultas}\n` +
                    `   🥗 Prescrições ativas: ${stats.totalPrescricoes}\n`;
        }
    }
    catch {
        // Ignora falha na busca de stats do WebDiet
    }
    const listaVenc = vencimentos7dias.length
        ? vencimentos7dias.map(v => `• ${v.nome} (${v.plano}) — ${(0, date_fns_1.format)(new Date(v.data_fim), 'dd/MM', { locale: locale_1.ptBR })}`).join('\n')
        : '• Nenhum vencimento esta semana';
    const semanaFormatada = `${(0, date_fns_1.format)(semanaPassada, 'dd/MM', { locale: locale_1.ptBR })} a ${(0, date_fns_1.format)(hoje, 'dd/MM/yyyy', { locale: locale_1.ptBR })}`;
    const mensagem = `📅 *RESUMO SEMANAL — ${semanaFormatada}*\n\n` +
        `💰 *Receita da semana:* R$ ${receitaSemana.toFixed(2)}\n` +
        `   (${qtdPagamentos} pagamento${qtdPagamentos !== 1 ? 's' : ''} confirmado${qtdPagamentos !== 1 ? 's' : ''})\n\n` +
        `👥 *Pacientes ativos:* ${totalAtivos}\n` +
        `🆕 *Novos pacientes:* ${novosPacientes}\n` +
        linhaWebDiet +
        `\n⚠️ *Vencimentos nos próximos 7 dias:*\n${listaVenc}\n\n` +
        `_Tenha um ótimo final de semana! 🌿_`;
    await (0, twilio_1.enviarWhatsApp)(nutriWpp, mensagem);
    console.log('[financeiro] Relatório semanal enviado.');
}
//# sourceMappingURL=index.js.map