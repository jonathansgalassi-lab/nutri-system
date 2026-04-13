import { interpolar } from '../../shared/utils';

export const TEMPLATES = {
  RECEPCAO: () =>
    `Oi! 👋 Que legal você estar aqui! Sou o assistente do Nutr. ${process.env.NUTRICIONISTA_NOME ?? 'Jonathan Galassi'}, nutricionista clínico. Estou aqui para te ajudar! 🥦

Me conta: qual é seu principal objetivo agora?
1️⃣ Emagrecimento/Definição
2️⃣ Ganho de massa muscular
3️⃣ Saúde geral e qualidade de vida
4️⃣ Energia e performance
5️⃣ Condição específica (diabetes, pressão, colesterol…)
6️⃣ Outros`,

  QUALIFICACAO: (nome: string) =>
    `Ótimo, ${nome}! 💪 Para te ajudar melhor, me diz:

Você já faz algum acompanhamento nutricional atualmente?
1️⃣ Não, é minha primeira vez
2️⃣ Já fiz antes, mas parei
3️⃣ Estou com outro profissional, mas quero mudar
4️⃣ Tenho acompanhamento médico (passar detalhes)`,

  APRESENTACAO_PLANOS: () =>
    `⭐ *ACOMPANHAMENTO NUTRICIONAL PREMIUM*

O método mais completo e individualizado para quem busca resultados reais e sustentáveis. Aqui você não recebe apenas um plano alimentar, mas um acompanhamento completo com ajustes constantes e suporte próximo.

✅ *O que está incluído:*
✔ Plano alimentar 100% individualizado
✔ Consultas presenciais ou on-line a cada 30 dias
✔ Avaliação física completa
✔ Check-in semanal
✔ Ajustes contínuos conforme sua evolução
✔ Suporte direto via WhatsApp

🛠 *Ferramentas exclusivas:*
✔ WebDiet • Wellts • Move Health • iMetas

🎁 *Bônus:* Grupo exclusivo de pacientes + Garrafinha personalizada

💰 *Investimento:*
• 3 meses: ${process.env.PLANO_3MESES ?? '3x de R$380'}
• 6 meses: ${process.env.PLANO_6MESES ?? '6x de R$350'}
• 12 meses: ${process.env.PLANO_12MESES ?? '12x de R$330'}

💳 *Pagamento:* Pix/dinheiro à vista ou cartão parcelado

Qual período faz mais sentido para você? 😊`,

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
🏥 Local: ${local || (process.env.NUTRICIONISTA_ENDERECO ?? 'A confirmar')}
📞 Contato: ${process.env.NUTRICIONISTA_WHATSAPP ?? '+5543991622448'}

💡 Para aproveitar ao máximo sua consulta, preencha o formulário de pré-avaliação: {LINK_FORM}

_Até lá! Qualquer dúvida é só chamar aqui_ 😊`,

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
