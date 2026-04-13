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
    `Boa notícia! Tenho 3 opções pensadas pra perfis diferentes, vou te explicar cada uma 😊

1️⃣ *Plano Inicial* — R$ ${process.env.VALOR_PLANO_INICIAL ?? '???'}
Uma consulta completa de 60min com avaliação física (antropometria e bioimpedância) e um plano alimentar personalizado pra 30 dias. Ideal pra quem quer dar o primeiro passo!

2️⃣ *Plano Acompanhamento — 3 meses* — R$ ${process.env.VALOR_PLANO_ACOMPANHAMENTO ?? '???'}
Além da consulta inicial, você tem 3 reavaliações ao longo do processo, o plano vai sendo ajustado conforme sua evolução e tem suporte semanal via chat. Pra quem quer resultado de verdade!

3️⃣ *Plano Premium — 6 meses* — R$ ${process.env.VALOR_PLANO_PREMIUM ?? '???'}
Tudo do plano anterior, mais suporte prioritário e receitas totalmente customizadas pra sua rotina. Pra quem quer uma transformação completa! 🌟

Com qual você se identificou mais?`,

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

  // ─── Fluxo de vendas premium ──────────────────────────────────

  VENDAS_SAUDACAO: () =>
    `Olá! 👋 Que bom ter você aqui!

Sou o assistente da ${process.env.NUTRICIONISTA_NOME ?? 'nutricionista'} e estou aqui para te ajudar a dar um passo importante na sua saúde e bem-estar.

Antes de tudo, qual é o seu nome? 😊`,

  VENDAS_APRESENTACAO: (nome: string) =>
    `Que nome lindo, ${nome}! 😄

Deixa eu te apresentar o nosso *Acompanhamento Nutricional Premium*:

_"O plano mais completo e individualizado para quem busca resultados reais e sustentáveis. Aqui você não recebe apenas um plano alimentar, mas um acompanhamento completo, com ajustes constantes e suporte próximo durante todo o processo."_

Quer saber mais sobre o que está incluído? 🌿`,

  VENDAS_BENEFICIOS_1: () =>
    `Vou te contar como funciona o acompanhamento 💪

✅ Plano alimentar 100% individualizado para você
✅ Consultas presenciais ou on-line a cada 30 dias
✅ Avaliação física completa
✅ Check-in semanal para acompanhar sua evolução
✅ Ajustes contínuos conforme você for progredindo
✅ Suporte direto via WhatsApp sempre que precisar

Isso é só o começo! Temos também ferramentas exclusivas que facilitam muito o processo do dia a dia. Posso te contar? 🛠️`,

  VENDAS_BENEFICIOS_2: () =>
    `Trabalhamos com ferramentas que fazem toda a diferença 📱

📋 *WebDiet* — seu plano alimentar sempre atualizado e acessível no celular
📊 *Wellts* — check-ins organizados e acompanhados de perto
🏃 *Move Health* — acompanhamento dos seus hábitos no dia a dia
🎯 *iMetas* — definição e acompanhamento das suas metas pessoais

Tudo integrado para que você e a nutricionista tenham uma visão completa da sua jornada.

E ainda tem alguns benefícios exclusivos que nossos pacientes adoram muito 🎁 Posso te contar?`,

  VENDAS_BENEFICIOS_3: () =>
    `Além de tudo que já te falei, você também tem acesso a 🌟

👥 *Grupo exclusivo de pacientes* — troca de experiências, receitas e motivação com outras pessoas que estão no mesmo processo que você
🎁 *Garrafinha personalizada* — um presente nosso pra você começar a jornada com o pé direito!

Que tal eu te contar sobre o investimento? 💬`,

  VENDAS_PRECOS: (nome: string) =>
    `${nome}, temos três opções de duração para o Acompanhamento Premium 👇

⏱️ *3 meses:* 3x de R$ 380
⏱️ *6 meses:* 6x de R$ 350
⏱️ *12 meses:* 12x de R$ 330

💳 *Formas de pagamento:*
• Pix ou dinheiro: à vista (valor integral do plano)
• Cartão de crédito: parcelado conforme os meses escolhidos

Quanto mais longo o plano, menor o valor mensal — e maiores os resultados! 😊

Qual das opções faz mais sentido para você? Digite *3*, *6* ou *12* meses.`,

  VENDAS_FECHAMENTO: (nome: string, meses: string) =>
    `Excelente escolha, ${nome}! 🌟

O plano de *${meses} meses* é perfeito para construir resultados reais e duradouros.

Para dar início ao seu acompanhamento, entre em contato diretamente com a nutricionista — ela vai te orientar sobre os próximos passos: pagamento, agendamento da primeira consulta e acesso às ferramentas 😊

📞 *${process.env.NUTRICIONISTA_WHATSAPP ?? 'Em breve'}*

Estamos muito animados em ter você nessa jornada! Qualquer dúvida, é só chamar aqui 💪`,

  VENDAS_FORA_ESCOPO: () =>
    `Essa é uma ótima dúvida, mas está fora do que posso te responder por aqui 😊

A melhor pessoa para te ajudar com isso é a própria nutricionista! Entra em contato com ela diretamente:

📞 *${process.env.NUTRICIONISTA_WHATSAPP ?? 'Em breve'}*

Posso te ajudar com mais alguma coisa sobre o Acompanhamento Premium?`,
};
