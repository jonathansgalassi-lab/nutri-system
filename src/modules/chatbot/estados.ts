import { query, queryOne } from '../../database/connection';
import { ConversaBot, EstadoBot, ContextoBot, Paciente } from '../../shared/types';
import { enviarWhatsApp } from '../../integrations/twilio';
import { buscarSlotsDisponiveis } from '../../integrations/google-calendar';
import { TEMPLATES } from './templates';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// ─── Utilitários ────────────────────────────────────────────

function normalizarTexto(texto: string): string {
  return texto.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// ─── Gatilhos de resposta rápida ────────────────────────────

interface Gatilho {
  palavras: string[];
  handler: (whatsapp: string, conversa: ConversaBot) => Promise<void>;
}

export const GATILHOS: Gatilho[] = [
  {
    palavras: ['quanto custa', 'valor', 'preco', 'precos', 'planos', 'investimento'],
    handler: async (whatsapp) => {
      // 1ª mensagem: apresenta o acompanhamento
      await enviarWhatsApp(whatsapp, TEMPLATES.APRESENTACAO_PLANOS_INFO());
      // pequena pausa para parecer mais natural
      await new Promise((r) => setTimeout(r, 1500));
      // 2ª mensagem: envia os valores
      await enviarWhatsApp(whatsapp, TEMPLATES.APRESENTACAO_PLANOS_VALOR());
      await atualizarEstado(whatsapp, 'APRESENTACAO_PLANOS');
    },
  },
  {
    palavras: ['funciona', 'resultado', 'depoimento', 'prova'],
    handler: async (whatsapp) => {
      await enviarWhatsApp(whatsapp, TEMPLATES.DEPOIMENTO());
    },
  },
  {
    palavras: ['alergi', 'intoleran', 'restricao', 'restricoes', 'celiaco', 'lactose'],
    handler: async (whatsapp, conversa) => {
      await enviarWhatsApp(whatsapp, TEMPLATES.ALERGIA_REGISTRADA());
      await atualizarContexto(whatsapp, { ...conversa.contexto, tem_alergia: true });
    },
  },
  {
    palavras: ['urgente', 'rapido', 'logo', 'essa semana', 'hoje', 'amanha'],
    handler: async (whatsapp) => {
      const slots = await buscarSlotsDisponiveis(3);
      const texto = slots
        .slice(0, 4)
        .map((s) => `• ${format(s.inicio, "dd/MM 'às' HH:mm", { locale: ptBR })}`)
        .join('\n');
      await enviarWhatsApp(whatsapp, TEMPLATES.URGENTE(texto || 'Nenhum horário disponível no momento. Fale diretamente com a nutricionista.'));
    },
  },
  {
    palavras: ['online', 'remoto', 'videochamada', 'virtual'],
    handler: async (whatsapp, conversa) => {
      await enviarWhatsApp(whatsapp, TEMPLATES.ONLINE_CONFIRMADO());
      await atualizarContexto(whatsapp, { ...conversa.contexto, formato_preferido: 'online' });
    },
  },
  {
    palavras: ['agendar', 'marcar', 'consulta', 'horario', 'horarios', 'disponivel'],
    handler: async (whatsapp) => {
      await iniciarAgendamento(whatsapp);
    },
  },
];

// ─── Funções de estado ────────────────────────────────────────

export async function buscarOuCriarConversa(whatsapp: string): Promise<{ conversa: ConversaBot; nova: boolean }> {
  const existente = await queryOne<ConversaBot>(
    'SELECT * FROM conversas_bot WHERE whatsapp = $1',
    [whatsapp]
  );

  if (existente) return { conversa: existente, nova: false };

  const [nova] = await query<ConversaBot>(
    `INSERT INTO conversas_bot (whatsapp, estado_atual, contexto, ultima_mensagem)
     VALUES ($1, 'RECEPCAO', '{}', NOW())
     RETURNING *`,
    [whatsapp]
  );
  return { conversa: nova, nova: true };
}

export async function atualizarEstado(whatsapp: string, estado: EstadoBot): Promise<void> {
  await query(
    `UPDATE conversas_bot SET estado_atual = $1, ultima_mensagem = NOW() WHERE whatsapp = $2`,
    [estado, whatsapp]
  );
}

export async function atualizarContexto(whatsapp: string, contexto: ContextoBot): Promise<void> {
  await query(
    `UPDATE conversas_bot SET contexto = $1, ultima_mensagem = NOW() WHERE whatsapp = $2`,
    [JSON.stringify(contexto), whatsapp]
  );
}

// ─── Máquina de estados ──────────────────────────────────────

export async function processarMensagem(whatsapp: string, texto: string): Promise<void> {
  const { conversa, nova } = await buscarOuCriarConversa(whatsapp);

  // Se for a primeira mensagem, envia boas-vindas e aguarda próxima resposta
  if (nova) {
    await enviarWelcome(whatsapp);
    return;
  }

  const textoNorm = normalizarTexto(texto);

  // Verifica gatilhos independentes de estado
  for (const gatilho of GATILHOS) {
    if (gatilho.palavras.some((p) => textoNorm.includes(p))) {
      await gatilho.handler(whatsapp, conversa);
      return;
    }
  }

  // Processa por estado atual
  switch (conversa.estado_atual as EstadoBot) {
    case 'RECEPCAO':
      await handleRecepcao(whatsapp, texto, conversa);
      break;
    case 'QUALIFICACAO':
      await handleQualificacao(whatsapp, texto, conversa);
      break;
    case 'APRESENTACAO_PLANOS':
      await handleApresentacaoPlanos(whatsapp, texto, conversa);
      break;
    case 'AGENDAMENTO':
      await handleAgendamento(whatsapp, texto, conversa);
      break;
    case 'FORMS_PRECONSULTA':
      await handleFormsPreconsulta(whatsapp, texto, conversa);
      break;
    default:
      await enviarWelcome(whatsapp);
  }
}

// ─── Handlers por estado ──────────────────────────────────────

async function enviarWelcome(whatsapp: string) {
  await enviarWhatsApp(whatsapp, TEMPLATES.RECEPCAO());
  await atualizarEstado(whatsapp, 'RECEPCAO');
}

async function handleRecepcao(whatsapp: string, texto: string, conversa: ConversaBot) {
  const opcoesObjetivo: Record<string, string> = {
    '1': 'Emagrecimento/Definição',
    '2': 'Ganho de massa',
    '3': 'Saúde geral',
    '4': 'Energia e performance',
    '5': 'Condição específica',
    '6': 'Outros',
  };

  const objetivo = opcoesObjetivo[texto.trim()] ?? texto;

  // Busca o nome do paciente se já cadastrado
  const paciente = await queryOne<Paciente>(
    'SELECT * FROM pacientes WHERE whatsapp = $1',
    [whatsapp]
  );

  await atualizarContexto(whatsapp, { ...conversa.contexto, objetivo });
  await atualizarEstado(whatsapp, 'QUALIFICACAO');

  const primeiroNome = paciente?.nome?.split(' ')[0] ?? 'por aí';
  await enviarWhatsApp(whatsapp, TEMPLATES.QUALIFICACAO(primeiroNome));
}

async function handleQualificacao(whatsapp: string, _texto: string, conversa: ConversaBot) {
  await atualizarEstado(whatsapp, 'APRESENTACAO_PLANOS');
  await enviarWhatsApp(whatsapp, TEMPLATES.APRESENTACAO_PLANOS_INFO());
  await new Promise((r) => setTimeout(r, 1500));
  await enviarWhatsApp(whatsapp, TEMPLATES.APRESENTACAO_PLANOS_VALOR());
}

async function handleApresentacaoPlanos(whatsapp: string, texto: string, conversa: ConversaBot) {
  const planosMap: Record<string, string> = {
    '1': 'inicial',
    '2': 'acompanhamento',
    '3': 'premium',
  };

  const plano = planosMap[texto.trim()];

  if (!plano) {
    await enviarWhatsApp(whatsapp, 'Escolha uma das opções: *1*, *2* ou *3* 😊');
    return;
  }

  await atualizarContexto(whatsapp, { ...conversa.contexto, plano_interesse: plano });
  await iniciarAgendamento(whatsapp);
}

async function iniciarAgendamento(whatsapp: string) {
  await atualizarEstado(whatsapp, 'AGENDAMENTO');

  const slots = await buscarSlotsDisponiveis(7);

  if (slots.length === 0) {
    await enviarWhatsApp(
      whatsapp,
      `No momento não há horários disponíveis na agenda online 😅\n\nFale diretamente com a nutricionista pelo WhatsApp: ${process.env.NUTRICIONISTA_WHATSAPP ?? ''}`
    );
    return;
  }

  // Agrupa slots por dia (máx 2 dias, 3 horários cada)
  const diasMap = new Map<string, string[]>();
  for (const slot of slots) {
    const dia = format(slot.inicio, "EEEE, dd/MM", { locale: ptBR });
    const hora = format(slot.inicio, 'HH:mm');
    if (!diasMap.has(dia)) diasMap.set(dia, []);
    const horas = diasMap.get(dia)!;
    if (horas.length < 3) horas.push(hora);
    if (diasMap.size >= 2 && [...diasMap.values()].every((h) => h.length >= 3)) break;
  }

  const slotsFormatados = [...diasMap.entries()]
    .slice(0, 2)
    .map(([dia, horas]) => ({ dia, horas }));

  // Salva opções no contexto para o próximo passo
  const slotsParaContexto = slots.slice(0, 6).map((s) => s.inicio.toISOString());

  const conversa = await buscarOuCriarConversa(whatsapp);
  await atualizarContexto(whatsapp, { ...conversa.contexto, slots_disponiveis: slotsParaContexto });

  await enviarWhatsApp(whatsapp, TEMPLATES.AGENDAMENTO(slotsFormatados));
}

async function handleAgendamento(whatsapp: string, texto: string, conversa: ConversaBot) {
  const escolha = parseInt(texto.trim()) - 1;
  const slots = (conversa.contexto?.slots_disponiveis as string[]) ?? [];

  if (isNaN(escolha) || escolha < 0 || escolha >= slots.length) {
    await enviarWhatsApp(whatsapp, `Responde com o número do horário desejado (ex: "1") 😊`);
    return;
  }

  const dataEscolhida = new Date(slots[escolha]);
  const dia = format(dataEscolhida, "dd/MM/yyyy", { locale: ptBR });
  const hora = format(dataEscolhida, 'HH:mm');

  await atualizarContexto(whatsapp, {
    ...conversa.contexto,
    data_agendamento: dataEscolhida.toISOString(),
  });
  await atualizarEstado(whatsapp, 'FORMS_PRECONSULTA');

  const baseUrl = process.env.BASE_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;
  const linkForm = `${baseUrl}/preconsulta?wpp=${encodeURIComponent(whatsapp)}`;
  const local = conversa.contexto?.formato_preferido === 'online'
    ? 'Videochamada (link será enviado no dia)'
    : (process.env.NUTRICIONISTA_ENDERECO ?? 'A confirmar');

  const msgConfirmacao = TEMPLATES.CONFIRMACAO_AGENDAMENTO(dia, hora, local)
    .replace('{LINK_FORM}', linkForm);

  await enviarWhatsApp(whatsapp, msgConfirmacao);

  // Aguarda 30s e envia o link do formulário separado
  setTimeout(async () => {
    await enviarWhatsApp(whatsapp, TEMPLATES.FORMS_PRECONSULTA(linkForm));
  }, 30_000);

  // Notifica a nutricionista
  const nutriWpp = process.env.NUTRICIONISTA_WHATSAPP;
  if (nutriWpp) {
    await enviarWhatsApp(
      nutriWpp,
      `📅 *NOVO AGENDAMENTO*\n\nWhatsApp: ${whatsapp}\nData: ${dia} às ${hora}\nPlano: ${conversa.contexto?.plano_interesse ?? 'a confirmar'}\nObjetivo: ${conversa.contexto?.objetivo ?? '—'}`
    );
  }
}

async function handleFormsPreconsulta(whatsapp: string, _texto: string, _conversa: ConversaBot) {
  const baseUrl = process.env.BASE_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;
  const linkForm = `${baseUrl}/preconsulta?wpp=${encodeURIComponent(whatsapp)}`;
  await enviarWhatsApp(
    whatsapp,
    `Aqui está o link do formulário novamente:\n\n${linkForm}\n\nQualquer dúvida é só chamar! 😊`
  );
}
