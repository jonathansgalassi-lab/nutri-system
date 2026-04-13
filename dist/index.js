"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const morgan_1 = __importDefault(require("morgan"));
const node_cron_1 = __importDefault(require("node-cron"));
const path_1 = __importDefault(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
const connection_1 = require("./database/connection");
// Módulos
const agendamento_1 = require("./modules/agendamento");
const chatbot_1 = require("./modules/chatbot");
const preconsulta_1 = require("./modules/preconsulta");
const acompanhamento_1 = require("./modules/acompanhamento");
const financeiro_1 = require("./modules/financeiro");
const planos_1 = require("./modules/planos");
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT ?? 3000;
// ── Middlewares ────────────────────────────────────────────────
app.use((0, helmet_1.default)({ contentSecurityPolicy: false }));
app.use((0, cors_1.default)());
app.use((0, morgan_1.default)('dev'));
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true })); // Twilio envia form-encoded
// ── Arquivos estáticos ─────────────────────────────────────────
app.use(express_1.default.static(path_1.default.join(__dirname, '..', 'public')));
app.get('/preconsulta', (_req, res) => {
    res.sendFile(path_1.default.join(__dirname, '..', 'public', 'preconsulta.html'));
});
// ── Health check ───────────────────────────────────────────────
app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
// ── Rotas ──────────────────────────────────────────────────────
app.use('/webhook/whatsapp', chatbot_1.chatbotRouter);
app.use('/webhook', financeiro_1.financeiroRouter); // /webhook/asaas
app.use('/api/forms/preconsulta', preconsulta_1.preconsultaRouter);
app.use('/api/agenda', agendamento_1.agendamentoRouter);
app.use('/api/acompanhamento', acompanhamento_1.acompanhamentoRouter);
app.use('/api/planos', planos_1.planosRouter);
app.use('/api', financeiro_1.financeiroRouter); // /api/contratos, /api/pagamentos
// Interface de revisão do plano
app.get('/revisar-plano', (_req, res) => {
    res.sendFile(path_1.default.join(__dirname, '..', 'public', 'revisar-plano.html'));
});
// ── Crons ──────────────────────────────────────────────────────
// Lembretes de consulta — a cada hora
node_cron_1.default.schedule('0 * * * *', async () => {
    console.log('[cron] Lembretes de consulta...');
    try {
        await (0, agendamento_1.enviarLembretesConsulta)();
    }
    catch (err) {
        console.error('[cron] Erro lembretes consulta:', err);
    }
});
// Check-ins semanais — toda segunda-feira às 08h
node_cron_1.default.schedule('0 8 * * 1', async () => {
    console.log('[cron] Enviando check-ins semanais...');
    try {
        await (0, acompanhamento_1.enviarCheckinsSemana)();
    }
    catch (err) {
        console.error('[cron] Erro check-ins:', err);
    }
});
// Alertas de vencimento — todo dia às 08h
node_cron_1.default.schedule('0 8 * * *', async () => {
    console.log('[cron] Verificando vencimentos...');
    try {
        await (0, financeiro_1.verificarVencimentos)();
    }
    catch (err) {
        console.error('[cron] Erro vencimentos:', err);
    }
});
// Relatório mensal — todo dia 1 às 09h
node_cron_1.default.schedule('0 9 1 * *', async () => {
    console.log('[cron] Enviando relatório mensal...');
    try {
        await (0, financeiro_1.enviarRelatorioMensal)();
    }
    catch (err) {
        console.error('[cron] Erro relatório mensal:', err);
    }
});
// ── Inicialização ──────────────────────────────────────────────
async function start() {
    // Inicia o servidor imediatamente — o healthcheck não vai falhar
    app.listen(PORT, () => {
        console.log(`\n🥦 Nutri-System rodando na porta ${PORT}`);
        console.log(`   Formulário:     http://localhost:${PORT}/preconsulta`);
        console.log(`   Webhook WPP:    http://localhost:${PORT}/webhook/whatsapp`);
        console.log(`   Webhook Asaas:  http://localhost:${PORT}/webhook/asaas`);
        console.log(`   Health:         http://localhost:${PORT}/health\n`);
    });
    // Conecta ao banco com retries (não bloqueia o start)
    let tentativas = 0;
    const conectar = async () => {
        try {
            await (0, connection_1.checkConnection)();
        }
        catch (err) {
            tentativas++;
            if (tentativas < 5) {
                console.warn(`[db] Tentativa ${tentativas} falhou. Retentando em 5s...`);
                setTimeout(conectar, 5000);
            }
            else {
                console.error('[db] Não foi possível conectar ao banco após 5 tentativas:', err);
            }
        }
    };
    conectar();
}
start().catch((err) => {
    console.error('Falha ao iniciar servidor:', err);
    process.exit(1);
});
exports.default = app;
//# sourceMappingURL=index.js.map