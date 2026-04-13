import { google } from 'googleapis';
import dotenv from 'dotenv';

dotenv.config();

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
);

if (process.env.GOOGLE_REFRESH_TOKEN) {
  oauth2Client.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
  });
}

export const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
export const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID ?? 'primary';

export interface SlotDisponivel {
  inicio: Date;
  fim: Date;
}

export async function buscarSlotsDisponiveis(
  quantidadeDias: number = 7,
  duracaoMinutos: number = 60
): Promise<SlotDisponivel[]> {
  const agora = new Date();
  const fim = new Date(agora);
  fim.setDate(fim.getDate() + quantidadeDias);

  const response = await calendar.freebusy.query({
    requestBody: {
      timeMin: agora.toISOString(),
      timeMax: fim.toISOString(),
      items: [{ id: CALENDAR_ID }],
    },
  });

  const ocupados = response.data.calendars?.[CALENDAR_ID]?.busy ?? [];

  const slots: SlotDisponivel[] = [];
  const horarioInicio = 8;
  const horarioFim = 18;

  for (let d = 0; d < quantidadeDias && slots.length < 6; d++) {
    const dia = new Date(agora);
    dia.setDate(dia.getDate() + d);

    // Pula fins de semana
    if (dia.getDay() === 0 || dia.getDay() === 6) continue;

    for (let hora = horarioInicio; hora < horarioFim; hora += 1) {
      if (slots.length >= 6) break;

      const slotInicio = new Date(dia);
      slotInicio.setHours(hora, 0, 0, 0);
      const slotFim = new Date(slotInicio);
      slotFim.setMinutes(slotFim.getMinutes() + duracaoMinutos);

      if (slotInicio <= agora) continue;

      const conflito = ocupados.some((b) => {
        const bInicio = new Date(b.start!);
        const bFim = new Date(b.end!);
        return slotInicio < bFim && slotFim > bInicio;
      });

      if (!conflito) {
        slots.push({ inicio: slotInicio, fim: slotFim });
      }
    }
  }

  return slots;
}

export async function criarEvento(params: {
  titulo: string;
  descricao: string;
  inicio: Date;
  fim: Date;
  local?: string;
}): Promise<string> {
  const response = await calendar.events.insert({
    calendarId: CALENDAR_ID,
    requestBody: {
      summary: params.titulo,
      description: params.descricao,
      location: params.local,
      start: { dateTime: params.inicio.toISOString(), timeZone: 'America/Sao_Paulo' },
      end: { dateTime: params.fim.toISOString(), timeZone: 'America/Sao_Paulo' },
    },
  });

  return response.data.id!;
}

export async function cancelarEvento(eventId: string): Promise<void> {
  await calendar.events.delete({
    calendarId: CALENDAR_ID,
    eventId,
  });
}
