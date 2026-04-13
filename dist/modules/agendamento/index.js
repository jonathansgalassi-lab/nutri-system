"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.agendamentoRouter = void 0;
exports.enviarLembretesConsulta = enviarLembretesConsulta;
const express_1 = require("express");
const google_calendar_1 = require("../../integrations/google-calendar");
const connection_1 = require("../../database/connection");
const twilio_1 = require("../../integrations/twilio");
const utils_1 = require("../../shared/utils");
exports.agendamentoRouter = (0, express_1.Router)();
// GET /api/agenda/disponibilidade
exports.agendamentoRouter.get('/disponibilidade', async (_req, res) => {
    try {
        const slots = await (0, google_calendar_1.buscarSlotsDisponiveis)();
        res.json({ slots });
    }
    catch (err) {
        console.error('Erro ao buscar disponibilidade:', err);
        res.status(500).json({ error: 'Erro ao consultar Google Calendar' });
    }
});
// POST /api/agenda/agendar
exports.agendamentoRouter.post('/agendar', async (req, res) => {
    const { paciente_id, data_hora, tipo, local, notas } = req.body;
    if (!paciente_id || !data_hora || !tipo) {
        res.status(400).json({ error: 'paciente_id, data_hora e tipo são obrigatórios' });
        return;
    }
    const paciente = await (0, connection_1.queryOne)('SELECT * FROM pacientes WHERE id = $1', [paciente_id]);
    if (!paciente) {
        res.status(404).json({ error: 'Paciente não encontrado' });
        return;
    }
    const inicio = new Date(data_hora);
    const fim = new Date(inicio);
    fim.setHours(fim.getHours() + 1);
    const googleEventId = await (0, google_calendar_1.criarEvento)({
        titulo: `Consulta — ${paciente.nome}`,
        descricao: `Tipo: ${tipo}\n${notas ?? ''}`,
        inicio,
        fim,
        local,
    });
    const [consulta] = await (0, connection_1.query)(`INSERT INTO consultas (paciente_id, data_hora, tipo, local, google_event_id, notas)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`, [paciente_id, data_hora, tipo, local, googleEventId, notas]);
    const nutriNome = process.env.NUTRICIONISTA_NOME ?? 'nutricionista';
    const nutriWhatsApp = process.env.NUTRICIONISTA_WHATSAPP ?? '';
    const mensagem = (0, utils_1.interpolar)(`✅ Consulta confirmada!\n\n📅 Data: {data}\n⏰ Horário: {hora}\n🏥 Local: {local}\n📞 Contato: {contato}`, {
        data: inicio.toLocaleDateString('pt-BR'),
        hora: inicio.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        local: local ?? 'A definir',
        contato: nutriWhatsApp,
    });
    await (0, twilio_1.enviarWhatsApp)(paciente.whatsapp, mensagem);
    res.status(201).json({ consulta });
});
// DELETE /api/agenda/:id
exports.agendamentoRouter.delete('/:id', async (req, res) => {
    const { id } = req.params;
    const consulta = await (0, connection_1.queryOne)('SELECT * FROM consultas WHERE id = $1', [id]);
    if (!consulta) {
        res.status(404).json({ error: 'Consulta não encontrada' });
        return;
    }
    if (consulta.google_event_id) {
        await (0, google_calendar_1.cancelarEvento)(consulta.google_event_id);
    }
    await (0, connection_1.query)("UPDATE consultas SET status = 'cancelada' WHERE id = $1", [id]);
    res.json({ message: 'Consulta cancelada com sucesso' });
});
// Lembretes automáticos — exportado para uso no cron
async function enviarLembretesConsulta() {
    const agora = new Date();
    // 24h antes
    const amanha24 = new Date(agora);
    amanha24.setHours(amanha24.getHours() + 24);
    const amanha25 = new Date(amanha24);
    amanha25.setHours(amanha25.getHours() + 1);
    const consultasAmanha = await (0, connection_1.query)(`SELECT c.*, p.nome, p.whatsapp
     FROM consultas c
     JOIN pacientes p ON p.id = c.paciente_id
     WHERE c.data_hora BETWEEN $1 AND $2
       AND c.status IN ('agendada', 'confirmada')`, [amanha24.toISOString(), amanha25.toISOString()]);
    for (const consulta of consultasAmanha) {
        const hora = new Date(consulta.data_hora).toLocaleTimeString('pt-BR', {
            hour: '2-digit', minute: '2-digit'
        });
        await (0, twilio_1.enviarWhatsApp)(consulta.whatsapp, `Sua consulta é amanhã às ${hora}! Tudo certo? 📅`);
    }
    // 1h antes
    const em1h = new Date(agora);
    em1h.setHours(em1h.getHours() + 1);
    const em2h = new Date(agora);
    em2h.setHours(em2h.getHours() + 2);
    const consultasEm1h = await (0, connection_1.query)(`SELECT c.*, p.nome, p.whatsapp
     FROM consultas c
     JOIN pacientes p ON p.id = c.paciente_id
     WHERE c.data_hora BETWEEN $1 AND $2
       AND c.status IN ('agendada', 'confirmada')`, [em1h.toISOString(), em2h.toISOString()]);
    for (const consulta of consultasEm1h) {
        await (0, twilio_1.enviarWhatsApp)(consulta.whatsapp, `Faltando 1h para sua consulta! Alguma dúvida de última hora? 😊`);
    }
}
//# sourceMappingURL=index.js.map