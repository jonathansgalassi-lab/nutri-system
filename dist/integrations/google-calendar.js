"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CALENDAR_ID = exports.calendar = void 0;
exports.buscarSlotsDisponiveis = buscarSlotsDisponiveis;
exports.criarEvento = criarEvento;
exports.cancelarEvento = cancelarEvento;
const googleapis_1 = require("googleapis");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const oauth2Client = new googleapis_1.google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
if (process.env.GOOGLE_REFRESH_TOKEN) {
    oauth2Client.setCredentials({
        refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
    });
}
exports.calendar = googleapis_1.google.calendar({ version: 'v3', auth: oauth2Client });
exports.CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID ?? 'primary';
async function buscarSlotsDisponiveis(quantidadeDias = 7, duracaoMinutos = 60) {
    const agora = new Date();
    const fim = new Date(agora);
    fim.setDate(fim.getDate() + quantidadeDias);
    const response = await exports.calendar.freebusy.query({
        requestBody: {
            timeMin: agora.toISOString(),
            timeMax: fim.toISOString(),
            items: [{ id: exports.CALENDAR_ID }],
        },
    });
    const ocupados = response.data.calendars?.[exports.CALENDAR_ID]?.busy ?? [];
    const slots = [];
    const horarioInicio = 8;
    const horarioFim = 18;
    for (let d = 0; d < quantidadeDias && slots.length < 6; d++) {
        const dia = new Date(agora);
        dia.setDate(dia.getDate() + d);
        // Pula fins de semana
        if (dia.getDay() === 0 || dia.getDay() === 6)
            continue;
        for (let hora = horarioInicio; hora < horarioFim; hora += 1) {
            if (slots.length >= 6)
                break;
            const slotInicio = new Date(dia);
            slotInicio.setHours(hora, 0, 0, 0);
            const slotFim = new Date(slotInicio);
            slotFim.setMinutes(slotFim.getMinutes() + duracaoMinutos);
            if (slotInicio <= agora)
                continue;
            const conflito = ocupados.some((b) => {
                const bInicio = new Date(b.start);
                const bFim = new Date(b.end);
                return slotInicio < bFim && slotFim > bInicio;
            });
            if (!conflito) {
                slots.push({ inicio: slotInicio, fim: slotFim });
            }
        }
    }
    return slots;
}
async function criarEvento(params) {
    const response = await exports.calendar.events.insert({
        calendarId: exports.CALENDAR_ID,
        requestBody: {
            summary: params.titulo,
            description: params.descricao,
            location: params.local,
            start: { dateTime: params.inicio.toISOString(), timeZone: 'America/Sao_Paulo' },
            end: { dateTime: params.fim.toISOString(), timeZone: 'America/Sao_Paulo' },
        },
    });
    return response.data.id;
}
async function cancelarEvento(eventId) {
    await exports.calendar.events.delete({
        calendarId: exports.CALENDAR_ID,
        eventId,
    });
}
//# sourceMappingURL=google-calendar.js.map