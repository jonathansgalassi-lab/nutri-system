import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cron from 'node-cron';
import path from 'path';
import dotenv from 'dotenv';

import { checkConnection } from './database/connection';

// Módulos
import { agendamentoRouter, enviarLembretesConsulta } from './modules/agendamento';
import { chatbotRouter } from './modules/chatbot';
import { preconsultaRouter } from './modules/preconsulta';
import { acompanhamentoRouter, enviarCheckinsSemana } from './modules/acompanhamento';
import { financeiroRouter, verificarVencimentos, enviarRelatorioMensal } from './modules/financeiro';
import { planosRouter } from './modules/planos';

dotenv.config();

const app = express();
const PORT = process.env.PORT ?? 3000;

// ── Middlewares ────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // Twilio envia form-encoded

// ── Arquivos estáticos ─────────────────────────────────────────
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/preconsulta', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'preconsulta.html'));
});

// ── Health check ───────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Rotas ──────────────────────────────────────────────────────
app.use('/webhook/whatsapp', chatbotRouter);
app.use('/webhook', financeiroRouter);               // /webhook/asaas

app.use('/api/forms/preconsulta', preconsultaRouter);
app.use('/api/agenda', agendamentoRouter);
app.use('/api/acompanhamento', acompanhamentoRouter);
app.use('/api/planos', planosRouter);
app.use('/api', financeiroRouter);                   // /api/contratos, /api/pagamentos

// Interface de revisão do plano
app.get('/revisar-plano', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'revisar-plano.html'));
});

// ── Crons ──────────────────────────────────────────────────────

// Lembretes de consulta — a cada hora
cron.schedule('0 * * * *', async () => {
  console.log('[cron] Lembretes de consulta...');
  try { await enviarLembretesConsulta(); }
  catch (err) { console.error('[cron] Erro lembretes consulta:', err); }
});

// Check-ins semanais — toda segunda-feira às 08h
cron.schedule('0 8 * * 1', async () => {
  console.log('[cron] Enviando check-ins semanais...');
  try { await enviarCheckinsSemana(); }
  catch (err) { console.error('[cron] Erro check-ins:', err); }
});

// Alertas de vencimento — todo dia às 08h
cron.schedule('0 8 * * *', async () => {
  console.log('[cron] Verificando vencimentos...');
  try { await verificarVencimentos(); }
  catch (err) { console.error('[cron] Erro vencimentos:', err); }
});

// Relatório mensal — todo dia 1 às 09h
cron.schedule('0 9 1 * *', async () => {
  console.log('[cron] Enviando relatório mensal...');
  try { await enviarRelatorioMensal(); }
  catch (err) { console.error('[cron] Erro relatório mensal:', err); }
});

// ── Inicialização ──────────────────────────────────────────────
async function start() {
  await checkConnection();
  app.listen(PORT, () => {
    console.log(`\n🥦 Nutri-System rodando na porta ${PORT}`);
    console.log(`   Formulário:     http://localhost:${PORT}/preconsulta`);
    console.log(`   Webhook WPP:    http://localhost:${PORT}/webhook/whatsapp`);
    console.log(`   Webhook Asaas:  http://localhost:${PORT}/webhook/asaas`);
    console.log(`   Health:         http://localhost:${PORT}/health\n`);
  });
}

start().catch((err) => {
  console.error('Falha ao iniciar servidor:', err);
  process.exit(1);
});

export default app;
