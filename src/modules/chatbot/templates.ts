import { interpolar } from '../../shared/utils';

export const TEMPLATES = {
  RECEPCAO: () =>
    `Olá! Tudo bem? 😊 Seja muito bem-vindo(a)!

Sou o assistente do Nutr. ${process.env.NUTRICIONISTA_NOME ?? 'Jonathan Galassi'} e estou aqui para te ajudar a dar o primeiro passo rumo a uma vida mais saudável! 🥦

Me conta uma coisa: qual é o seu principal objetivo agora?

1️⃣ Emagrecimento e definição corporal
2️⃣ Ganho de massa muscular
3️⃣ Saúde geral e qualidade de vida
4️⃣ Mais energia e performance
5️⃣ Condição específica (diabetes, pressão, colesterol…)
6️⃣ Outro objetivo

_Responde com o número da opção que mais combina com você_ 😉`,

  QUALIFICACAO: (nome: string) =>
    `Que objetivo incrível, ${nome}! 💪 Fico feliz que você esteja buscando isso.

Só pra eu entender melhor o seu histórico:

Você já fez algum acompanhamento nutricional antes?

1️⃣ Não, seria minha primeira vez
2️⃣ Já fiz, mas acabei parando
3️⃣ Estou com outro profissional, mas quero mudar
4️⃣ Tenho acompanhamento médico em paralelo

Pode falar à vontade, tá aqui sem julgamento! 🙂`,

  APRESENTACAO_PLANOS_INFO: () =>
    `Perfeito! Então deixa eu te apresentar o que temos de melhor 🌟

⭐ *ACOMPANHAMENTO NUTRICIONAL PREMIUM*

Esse é o nosso método mais completo — ele foi criado pra quem quer resultados reais, duradouros e com suporte próximo durante todo o caminho.

Aqui você não recebe só um papel com dieta. Você tem um acompanhamento de verdade, com ajustes constantes conforme você for evoluindo. 💚

*O que está incluído:*
✔ Plano alimentar 100% personalizado para você
✔ Consultas presenciais ou online a cada 30 dias
✔ Avaliação física completa
✔ Check-in semanal para acompanhar sua evolução
✔ Ajustes no plano conforme seus resultados
✔ Suporte direto via WhatsApp sempre que precisar

*Ferramentas que você vai ter acesso:*
✔ *WebDiet* — seu plano sempre atualizado no app
✔ *Wellts* — check-ins organizados e fáceis
✔ *Move Health* — acompanhamento de hábitos
✔ *iMetas* — definição e acompanhamento das suas metas

🎁 *Bônus especiais:*
✔ Acesso ao grupo exclusivo de pacientes
✔ Garrafinha personalizada`,

  APRESENTACAO_PLANOS_VALOR: () =>
    `E agora a parte que todo mundo quer saber 😄

💰 *Investimento no Acompanhamento Premium:*

📆 *3 meses* → ${process.env.PLANO_3MESES ?? '3x de R$380'}
📆 *6 meses* → ${process.env.PLANO_6MESES ?? '6x de R$350'}
📆 *12 meses* → ${process.env.PLANO_12MESES ?? '12x de R$330'}

💳 *Formas de pagamento:*
• Pix ou dinheiro — valor integral à vista
• Cartão de crédito — parcelado conforme o período ✅

_Quanto mais tempo de compromisso, melhor o valor e melhores os resultados também!_

Qual período faz mais sentido pra você agora? Se quiser, posso já te agendar uma consulta pra começarmos! 🗓`,

  // mantido para compatibilidade
  APRESENTACAO_PLANOS: () =>
    `Quer conhecer o Acompanhamento Premium? É só digitar *"planos"* que te mostro tudo! 😊`,

  AGENDAMENTO: (slots: { dia: string; horas: string[] }[]) => {
    const linhas = slots.map((s) => `📅 *${s.dia}:*\n• ${s.horas.join(' | ')}`);
    return `Ótimo! Vamos marcar sua consulta? 🗓

Esses são os horários disponíveis agora:

${linhas.join('\n\n')}

Responde com o número do horário que você prefere (ex: *"1"*) e já deixamos confirmado! 😊`;
  },

  CONFIRMACAO_AGENDAMENTO: (data: string, hora: string, local: string) =>
    `✅ *Consulta confirmada!* Que ótimo, mal posso esperar pra te atender! 🎉

📅 *Data:* ${data}
⏰ *Horário:* ${hora}
🏥 *Local:* ${local || (process.env.NUTRICIONISTA_ENDERECO ?? 'A confirmar')}
📞 *Contato:* ${process.env.NUTRICIONISTA_WHATSAPP ?? '+5543991622448'}

💡 Pra aproveitar ao máximo nossa consulta, vou te enviar um formulário rápido de pré-avaliação. Leva menos de 5 minutos e me ajuda a já chegar preparado pra você!

👇 Acesse aqui: {LINK_FORM}

_Qualquer dúvida é só me chamar aqui. Até lá!_ 😊`,

  FORMS_PRECONSULTA: (link: string) =>
    `📋 Aqui está o formulário de pré-avaliação:

${link}

É bem rápido e faz toda a diferença no seu atendimento! Com ele eu já chego na consulta com muito mais informações sobre você 🎯

_Pode preencher com calma, tá?_ 😊`,

  DEPOIMENTO: () =>
    `Que legal que você quer saber mais! 😊

Olha alguns resultados reais de quem passou pelo acompanhamento:

💬 *"Perdi 8kg em 3 meses sem passar fome. Mudou minha relação com a comida!"* — Mariana, 32 anos
💬 *"Ganhei 4kg de massa em 4 meses, com energia lá em cima!"* — Rafael, 28 anos
💬 *"Consegui controlar minha diabetes só com alimentação. Não acreditava que era possível."* — Carlos, 55 anos

Cada pessoa é única e o plano é 100% personalizado pra você. Nada de dieta genérica! 🌿

Quer agendar uma conversa pra eu te contar mais? É só digitar *"agendar"* 😉`,

  ALERGIA_REGISTRADA: () =>
    `Anotado, obrigado por me contar! ✅

Trabalhamos com todo tipo de restrição alimentar — alergias, intolerâncias, preferências. O plano vai ser 100% adaptado pra sua realidade, sem nenhum risco. Pode ficar tranquilo(a)! 🌿

Se tiver mais alguma restrição, pode falar à vontade 😊`,

  URGENTE: (slots: string) =>
    `Entendo, vamos resolver isso rápido! ⚡

Esses são os horários mais próximos disponíveis:

${slots}

Qual funciona melhor pra você? Responde com o número e já garantimos! 🗓`,

  ONLINE_CONFIRMADO: () =>
    `Sim, atendemos online! 💻 E funciona super bem!

É exatamente como o presencial — avaliação completa, plano personalizado e acompanhamento semanal — tudo no conforto da sua casa, sem precisar sair de onde você está.

Quer ver os planos disponíveis? É só digitar *"planos"* 📋`,

  NAO_ENTENDEU: () =>
    `Hmm, acho que não entendi direito 😅 Pode me explicar de outro jeito?

Ou se preferir, pode digitar:
• *"planos"* — ver o Acompanhamento Premium e valores
• *"agendar"* — marcar uma consulta
• *"dúvida"* — falar diretamente com o nutricionista`,
};
