"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GATILHOS = void 0;
exports.buscarOuCriarConversa = buscarOuCriarConversa;
exports.atualizarEstado = atualizarEstado;
exports.atualizarContexto = atualizarContexto;
exports.processarMensagem = processarMensagem;
const connection_1 = require("../../database/connection");
const twilio_1 = require("../../integrations/twilio");
const google_calendar_1 = require("../../integrations/google-calendar");
const templates_1 = require("./templates");
const date_fns_1 = require("date-fns");
const locale_1 = require("date-fns/locale");
// ─── Utilitários ────────────────────────────────────────────
function normalizarTexto(texto) {
    return texto.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
exports.GATILHOS = [
    {
        palavras: ['quanto custa', 'valor', 'preco', 'precos', 'planos', 'investimento'],
        handler: async (whatsapp) => {
            // 1ª mensagem: apresenta o acompanhamento
            await (0, twilio_1.enviarWhatsApp)(whatsapp, templates_1.TEMPLATES.APRESENTACAO_PLANOS_INFO());
            // pequena pausa para parecer mais natural
            await new Promise((r) => setTimeout(r, 1500));
            // 2ª mensagem: envia os valores
            await (0, twilio_1.enviarWhatsApp)(whatsapp, templates_1.TEMPLATES.APRESENTACAO_PLANOS_VALOR());
            await atualizarEstado(whatsapp, 'APRESENTACAO_PLANOS');
        },
    },
    {
        palavras: ['funciona', 'resultado', 'depoimento', 'prova'],
        handler: async (whatsapp) => {
            await (0, twilio_1.enviarWhatsApp)(whatsapp, templates_1.TEMPLATES.DEPOIMENTO());
        },
    },
    {
        palavras: ['alergi', 'intoleran', 'restricao', 'restricoes', 'celiaco', 'lactose'],
        handler: async (whatsapp, conversa) => {
            await (0, twilio_1.enviarWhatsApp)(whatsapp, templates_1.TEMPLATES.ALERGIA_REGISTRADA());
            await atualizarContexto(whatsapp, { ...conversa.contexto, tem_alergia: true });
        },
    },
    {
        palavras: ['urgente', 'rapido', 'logo', 'essa semana', 'hoje', 'amanha'],
        handler: async (whatsapp) => {
            const slots = await (0, google_calendar_1.buscarSlotsDisponiveis)(3);
            const texto = slots
                .slice(0, 4)
                .map((s) => `• ${(0, date_fns_1.format)(s.inicio, "dd/MM 'às' HH:mm", { locale: locale_1.ptBR })}`)
                .join('\n');
            await (0, twilio_1.enviarWhatsApp)(whatsapp, templates_1.TEMPLATES.URGENTE(texto || 'Nenhum horário disponível no momento. Fale diretamente com a nutricionista.'));
        },
    },
    {
        palavras: ['online', 'remoto', 'videochamada', 'virtual'],
        handler: async (whatsapp, conversa) => {
            await (0, twilio_1.enviarWhatsApp)(whatsapp, templates_1.TEMPLATES.ONLINE_CONFIRMADO());
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
async function buscarOuCriarConversa(whatsapp) {
    const existente = await (0, connection_1.queryOne)('SELECT * FROM conversas_bot WHERE whatsapp = $1', [whatsapp]);
    if (existente)
        return { conversa: existente, nova: false };
    const [nova] = await (0, connection_1.query)(`INSERT INTO conversas_bot (whatsapp, estado_atual, contexto, ultima_mensagem)
     VALUES ($1, 'RECEPCAO', '{}', NOW())
     RETURNING *`, [whatsapp]);
    return { conversa: nova, nova: true };
}
async function atualizarEstado(whatsapp, estado) {
    await (0, connection_1.query)(`UPDATE conversas_bot SET estado_atual = $1, ultima_mensagem = NOW() WHERE whatsapp = $2`, [estado, whatsapp]);
}
async function atualizarContexto(whatsapp, contexto) {
    await (0, connection_1.query)(`UPDATE conversas_bot SET contexto = $1, ultima_mensagem = NOW() WHERE whatsapp = $2`, [JSON.stringify(contexto), whatsapp]);
}
// ─── Máquina de estados ──────────────────────────────────────
async function processarMensagem(whatsapp, texto) {
    const { conversa, nova } = await buscarOuCriarConversa(whatsapp);
    // Se for a primeira mensagem, envia boas-vindas e aguarda próxima resposta
    if (nova) {
        await enviarWelcome(whatsapp);
        return;
    }
    const textoNorm = normalizarTexto(texto);
    // Verifica gatilhos independentes de estado
    for (const gatilho of exports.GATILHOS) {
        if (gatilho.palavras.some((p) => textoNorm.includes(p))) {
            await gatilho.handler(whatsapp, conversa);
            return;
        }
    }
    // Processa por estado atual
    switch (conversa.estado_atual) {
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
async function enviarWelcome(whatsapp) {
    await (0, twilio_1.enviarWhatsApp)(whatsapp, templates_1.TEMPLATES.RECEPCAO());
    await atualizarEstado(whatsapp, 'RECEPCAO');
}
async function handleRecepcao(whatsapp, texto, conversa) {
    const opcoesObjetivo = {
        '1': 'Emagrecimento/Definição',
        '2': 'Ganho de massa',
        '3': 'Saúde geral',
        '4': 'Energia e performance',
        '5': 'Condição específica',
        '6': 'Outros',
    };
    const objetivo = opcoesObjetivo[texto.trim()] ?? texto;
    // Busca o nome do paciente se já cadastrado
    const paciente = await (0, connection_1.queryOne)('SELECT * FROM pacientes WHERE whatsapp = $1', [whatsapp]);
    await atualizarContexto(whatsapp, { ...conversa.contexto, objetivo });
    await atualizarEstado(whatsapp, 'QUALIFICACAO');
    const primeiroNome = paciente?.nome?.split(' ')[0] ?? 'por aí';
    await (0, twilio_1.enviarWhatsApp)(whatsapp, templates_1.TEMPLATES.QUALIFICACAO(primeiroNome));
}
async function handleQualificacao(whatsapp, _texto, conversa) {
    await atualizarEstado(whatsapp, 'APRESENTACAO_PLANOS');
    await (0, twilio_1.enviarWhatsApp)(whatsapp, templates_1.TEMPLATES.APRESENTACAO_PLANOS_INFO());
    await new Promise((r) => setTimeout(r, 1500));
    await (0, twilio_1.enviarWhatsApp)(whatsapp, templates_1.TEMPLATES.APRESENTACAO_PLANOS_VALOR());
}
async function handleApresentacaoPlanos(whatsapp, texto, conversa) {
    const planosMap = {
        '1': 'inicial',
        '2': 'acompanhamento',
        '3': 'premium',
    };
    const plano = planosMap[texto.trim()];
    if (!plano) {
        await (0, twilio_1.enviarWhatsApp)(whatsapp, 'Escolha uma das opções: *1*, *2* ou *3* 😊');
        return;
    }
    await atualizarContexto(whatsapp, { ...conversa.contexto, plano_interesse: plano });
    await iniciarAgendamento(whatsapp);
}
async function iniciarAgendamento(whatsapp) {
    await atualizarEstado(whatsapp, 'AGENDAMENTO');
    const slots = await (0, google_calendar_1.buscarSlotsDisponiveis)(7);
    if (slots.length === 0) {
        await (0, twilio_1.enviarWhatsApp)(whatsapp, `No momento não há horários disponíveis na agenda online 😅\n\nFale diretamente com a nutricionista pelo WhatsApp: ${process.env.NUTRICIONISTA_WHATSAPP ?? ''}`);
        return;
    }
    // Agrupa slots por dia (máx 2 dias, 3 horários cada)
    const diasMap = new Map();
    for (const slot of slots) {
        const dia = (0, date_fns_1.format)(slot.inicio, "EEEE, dd/MM", { locale: locale_1.ptBR });
        const hora = (0, date_fns_1.format)(slot.inicio, 'HH:mm');
        if (!diasMap.has(dia))
            diasMap.set(dia, []);
        const horas = diasMap.get(dia);
        if (horas.length < 3)
            horas.push(hora);
        if (diasMap.size >= 2 && [...diasMap.values()].every((h) => h.length >= 3))
            break;
    }
    const slotsFormatados = [...diasMap.entries()]
        .slice(0, 2)
        .map(([dia, horas]) => ({ dia, horas }));
    // Salva opções no contexto para o próximo passo
    const slotsParaContexto = slots.slice(0, 6).map((s) => s.inicio.toISOString());
    const { conversa } = await buscarOuCriarConversa(whatsapp);
    await atualizarContexto(whatsapp, { ...conversa.contexto, slots_disponiveis: slotsParaContexto });
    await (0, twilio_1.enviarWhatsApp)(whatsapp, templates_1.TEMPLATES.AGENDAMENTO(slotsFormatados));
}
async function handleAgendamento(whatsapp, texto, conversa) {
    const escolha = parseInt(texto.trim()) - 1;
    const slots = conversa.contexto?.slots_disponiveis ?? [];
    if (isNaN(escolha) || escolha < 0 || escolha >= slots.length) {
        await (0, twilio_1.enviarWhatsApp)(whatsapp, `Responde com o número do horário desejado (ex: "1") 😊`);
        return;
    }
    const dataEscolhida = new Date(slots[escolha]);
    const dia = (0, date_fns_1.format)(dataEscolhida, "dd/MM/yyyy", { locale: locale_1.ptBR });
    const hora = (0, date_fns_1.format)(dataEscolhida, 'HH:mm');
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
    const msgConfirmacao = templates_1.TEMPLATES.CONFIRMACAO_AGENDAMENTO(dia, hora, local)
        .replace('{LINK_FORM}', linkForm);
    await (0, twilio_1.enviarWhatsApp)(whatsapp, msgConfirmacao);
    // Aguarda 30s e envia o link do formulário separado
    setTimeout(async () => {
        await (0, twilio_1.enviarWhatsApp)(whatsapp, templates_1.TEMPLATES.FORMS_PRECONSULTA(linkForm));
    }, 30_000);
    // Notifica a nutricionista
    const nutriWpp = process.env.NUTRICIONISTA_WHATSAPP;
    if (nutriWpp) {
        await (0, twilio_1.enviarWhatsApp)(nutriWpp, `📅 *NOVO AGENDAMENTO*\n\nWhatsApp: ${whatsapp}\nData: ${dia} às ${hora}\nPlano: ${conversa.contexto?.plano_interesse ?? 'a confirmar'}\nObjetivo: ${conversa.contexto?.objetivo ?? '—'}`);
    }
}
async function handleFormsPreconsulta(whatsapp, _texto, _conversa) {
    const baseUrl = process.env.BASE_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;
    const linkForm = `${baseUrl}/preconsulta?wpp=${encodeURIComponent(whatsapp)}`;
    await (0, twilio_1.enviarWhatsApp)(whatsapp, `Aqui está o link do formulário novamente:\n\n${linkForm}\n\nQualquer dúvida é só chamar! 😊`);
}
//# sourceMappingURL=estados.js.map