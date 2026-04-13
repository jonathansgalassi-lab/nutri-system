import { interpolar } from '../../shared/utils';

export const TEMPLATES = {
  RECEPCAO: () =>
    `Oi! 👋 Que legal você estar aqui! Sou o assistente da ${process.env.NUTRICIONISTA_NOME ?? 'nutricionista'}, nutricionista clínica. Estou aqui para ajudar!

Me conta: qual é seu principal objetivo agora?
1️⃣ Emagrecimento/Definição
2️⃣ Ganho de massa
3️⃣ Saúde geral
4️⃣ Energia e performance
5️⃣ Condição específica (diabetes, pressão, etc)
6️⃣ Outros`,

  QUALIFICACAO: (nome: string) =>
    `Ótimo, ${nome}! 💪 Para te ajudar melhor, me diz:

Você já faz algum acompanhamento nutricional atualmente?
1️⃣ Não, é minha primeira vez
2️⃣ Já fiz antes, mas parei
3️⃣ Estou com outro profissional, mas quero mudar
4️⃣ Tenho acompanhamento médico (passar detalhes)`,

  APRESENTACAO_PLANOS: () =>
    `Temos 3 opções para te ajudar:

📋 *PLANO INICIAL* — R$ ${process.env.VALOR_PLANO_INICIAL ?? '???'}
• 1 Consulta de 60min
• Avaliação completa (antropometria, bioimpedância)
• Plano básico 30 dias

📈 *PLANO ACOMPANHAMENTO (3 meses)* — R$ ${process.env.VALOR_PLANO_ACOMPANHAMENTO ?? '???'}
• Consulta Inicial + 3 Reavaliações
• Plano personalizado ajustável
• Acompanhamento semanal via chat

⭐ *PLANO PREMIUM (6 meses)* — R$ ${process.env.VALOR_PLANO_PREMIUM ?? '???'}
• Tudo do Acompanhamento
• Suporte prioritário
• Receitas customizadas

Qual faz mais sentido para você?`,

  AGENDAMENTO: (slots: { dia: string; horas: string[] }[]) => {
    const linhas = slots.map((s, i) => `📅 ${s.dia}:\n• ${s.horas.join(' | ')}`);
    return `Ótimo! Vamos agendar sua consulta? 📅

Tenho esses horários disponíveis:

${linhas.join('\n\n')}

Qual prefere? Responde com o número do horário (ex: "1")`;
  },

  CONFIRMACAO_AGENDAMENTO: (data: string, hora: string, local: string) =>
    `✅ Consulta confirmada!

📅 Data: ${data}
⏰ Horário: ${hora}
🏥 Local: ${local}
📞 Contato: ${process.env.NUTRICIONISTA_WHATSAPP ?? ''}

💡 Para aproveitar ao máximo sua consulta, preencha o formulário de pré-consulta: {LINK_FORM}`,

  FORMS_PRECONSULTA: (link: string) =>
    `📋 Antes da sua consulta, preencha o formulário de pré-avaliação:

${link}

Leva menos de 5 minutos e ajuda a nutricionista a personalizar seu atendimento desde o primeiro momento! 🎯`,

  DEPOIMENTO: () =>
    `Ótima pergunta! 😊 Alguns resultados dos nossos pacientes:

💬 *"Perdi 8kg em 3 meses sem passar fome"* — Mariana, 32 anos
💬 *"Ganhei 4kg de massa em 4 meses"* — Rafael, 28 anos
💬 *"Controlei minha diabetes com alimentação"* — Carlos, 55 anos

Cada caso é único e o plano é 100% personalizado para você!

Quer saber mais? Digite "quero agendar" para conhecer os planos 🌿`,

  ALERGIA_REGISTRADA: () =>
    `Anotado! ✅ Trabalhamos com restrições alimentares, alergias e intolerâncias.

O plano será 100% adaptado para você, sem nenhum risco. Pode ficar tranquilo(a)! 🌿`,

  URGENTE: (slots: string) =>
    `Entendo a urgência! ⚡ Tenho esses horários disponíveis nos próximos dias:

${slots}

Quer garantir um deles agora?`,

  ONLINE_CONFIRMADO: () =>
    `Sim! Atendemos online via videochamada 💻

Funciona exatamente como o presencial — avaliação completa, plano personalizado e acompanhamento — tudo no conforto da sua casa.

Quer saber mais sobre os planos? Digite "planos" 📋`,

  NAO_ENTENDEU: () =>
    `Hmm, não entendi bem 😅 Pode reformular?

Ou se preferir, pode digitar:
• "planos" para ver os planos disponíveis
• "agendar" para marcar uma consulta
• "dúvida" para falar com a nutricionista`,
};
