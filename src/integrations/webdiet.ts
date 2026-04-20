import puppeteer, { Browser, Page } from 'puppeteer';
import dotenv from 'dotenv';
import { gerarTextoIA } from './openai';
import { ConteudoPlano, OpcaoRefeicao } from '../shared/types';

dotenv.config();

const WEBDIET_LOGIN_URL    = 'https://pt.webdiet.com.br/login/';
const WEBDIET_PAINEL_URL   = 'https://pt.webdiet.com.br/painel/v4/';
const WEBDIET_FINANCEIRO_URL = 'https://pt.webdiet.com.br/painel/v4/financeiro.php';
const WEBDIET_STATS_URL    = 'https://pt.webdiet.com.br/painel/v4/estatisticas.php';

const FORMA_PAGAMENTO_MAP: Record<string, string> = {
  PIX: '7', CREDIT_CARD: '3', DEBIT_CARD: '2', BOLETO: '1', TRANSFERENCIA: '6',
};

function detectChromePath(): string | undefined {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  if (process.platform === 'darwin') return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  return '/usr/bin/chromium';
}

function getPuppeteerOptions() {
  return {
    headless: true as const,
    executablePath: detectChromePath(),
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    timeout: 60000,
  };
}

// ─── Tipos ────────────────────────────────────────────────────

export interface DadosPacienteWebdiet {
  nome: string;
  apelido?: string;
  sexo?: 'M' | 'F';
  dataNascimento?: string;
  cpf?: string;
  telefone?: string;
  email?: string;
  tags?: string;
  peso?: number;
  altura?: number;
  objetivo?: string;
  alergias?: string;
  medicamentos?: string;
  historicoFamiliar?: string[];
  praticaExercicio?: string;
  tipoExercicio?: string;
  refeicoesPorDia?: number;
  alimentosQueGosta?: string;
  alimentosQueNaoGosta?: string;
  comeFora?: string;
  ondeComeFora?: string;
  dificuldadesAlimentacao?: string;
  dietasAnteriores?: string;
  expectativas?: string;
  // Plano gerado pela IA (para inserção completa)
  planoAlimentar?: ConteudoPlano;
}

// ─── Login ────────────────────────────────────────────────────

async function loginWebdiet(browser: Browser): Promise<Page> {
  const page = await browser.newPage();
  page.setDefaultTimeout(60000);
  page.setDefaultNavigationTimeout(60000);

  await page.goto(WEBDIET_LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('input[placeholder="email de acesso"]', { timeout: 20000 });

  await page.click('input[placeholder="email de acesso"]', { clickCount: 3 });
  await page.keyboard.press('Backspace');
  await page.type('input[placeholder="email de acesso"]', process.env.WEBDIET_EMAIL ?? '', { delay: 30 });

  await page.click('input[placeholder="senha de acesso"]', { clickCount: 3 });
  await page.keyboard.press('Backspace');
  await page.type('input[placeholder="senha de acesso"]', process.env.WEBDIET_PASSWORD ?? '', { delay: 30 });

  await new Promise(r => setTimeout(r, 300));
  await page.click('div.botao');

  await page.waitForFunction(
    () => window.location.href.includes('/painel/v4'),
    { timeout: 30000, polling: 500 }
  );
  await page.waitForSelector(
    '[placeholder="Busque pelo nome, apelido, CPF, telefone ou pela tag do paciente"]',
    { timeout: 20000 }
  );

  return page;
}

// ─── Geração de conteúdo via Gemini ──────────────────────────

async function gerarAnamnese(dados: DadosPacienteWebdiet): Promise<string> {
  const sexoTexto = dados.sexo === 'M' ? 'Masculino' : 'Feminino';
  const imc = dados.peso && dados.altura
    ? (dados.peso / Math.pow(dados.altura / 100, 2)).toFixed(1)
    : null;

  try {
    const prompt = `Você é um nutricionista clínico. Gere um resumo de anamnese em HTML profissional para ser inserido no sistema WebDiet. Use <p>, <strong>, <ul>, <li>. Seja objetivo e clínico.

DADOS DO PACIENTE:
- Nome: ${dados.nome} | Sexo: ${sexoTexto} | Nasc: ${dados.dataNascimento ?? '—'}
- Peso: ${dados.peso ? dados.peso + ' kg' : '—'} | Altura: ${dados.altura ? dados.altura + ' cm' : '—'} | IMC: ${imc ?? '—'}
- Objetivo: ${dados.objetivo ?? '—'}
- Alergias/Intolerâncias: ${dados.alergias || 'Nenhuma'}
- Medicamentos: ${dados.medicamentos || 'Nenhum'}
- Histórico familiar: ${dados.historicoFamiliar?.join(', ') || '—'}
- Exercício: ${dados.praticaExercicio ?? '—'} — ${dados.tipoExercicio || ''}
- Refeições/dia: ${dados.refeicoesPorDia ?? '—'}
- Gosta de: ${dados.alimentosQueGosta || '—'}
- Não gosta de: ${dados.alimentosQueNaoGosta || '—'}
- Come fora: ${dados.comeFora ?? '—'} ${dados.ondeComeFora ? '(' + dados.ondeComeFora + ')' : ''}
- Dificuldades: ${dados.dificuldadesAlimentacao || '—'}
- Dietas anteriores: ${dados.dietasAnteriores || '—'}
- Expectativas: ${dados.expectativas || '—'}

Retorne APENAS o HTML da anamnese, sem explicações.`;

    const resultado = await gerarTextoIA(prompt);
    // Remove markdown code blocks se existir
    return resultado.replace(/```html?\n?/gi, '').replace(/```/g, '').trim();
  } catch {
    // Fallback HTML estruturado
    const sexoTextoFallback = dados.sexo === 'M' ? 'Masculino' : 'Feminino';
    return `<p><strong>📋 Pré-Consulta — ${new Date().toLocaleDateString('pt-BR')}</strong></p>
<p><strong>Dados Pessoais</strong><br>Sexo: ${sexoTextoFallback} | Nasc: ${dados.dataNascimento ?? '—'} | Peso: ${dados.peso ? dados.peso + ' kg' : '—'} | Altura: ${dados.altura ? dados.altura + ' cm' : '—'}${imc ? ' | IMC: ' + imc : ''}</p>
<p><strong>🎯 Objetivo</strong><br>${dados.objetivo ?? '—'}</p>
<p><strong>⚠️ Saúde</strong></p>
<ul><li>Alergias: ${dados.alergias || 'Nenhuma'}</li><li>Medicamentos: ${dados.medicamentos || 'Nenhum'}</li><li>Histórico: ${dados.historicoFamiliar?.join(', ') || '—'}</li></ul>
<p><strong>🏋️ Exercício</strong><br>${dados.praticaExercicio ?? '—'} — ${dados.tipoExercicio || ''}</p>
<p><strong>🍽️ Hábitos</strong></p>
<ul><li>Refeições/dia: ${dados.refeicoesPorDia ?? '—'}</li><li>Gosta de: ${dados.alimentosQueGosta || '—'}</li><li>Não gosta: ${dados.alimentosQueNaoGosta || '—'}</li><li>Come fora: ${dados.comeFora ?? '—'}</li></ul>
<p><strong>💬 Expectativas</strong><br>${dados.expectativas || '—'}</p>`.trim();
  }
}

async function gerarMetas(dados: DadosPacienteWebdiet): Promise<string> {
  const plano = dados.planoAlimentar;
  try {
    const prompt = `Você é um nutricionista. Gere metas nutricionais claras e motivadoras em HTML para o paciente abaixo. Use <p>, <strong>, <ul>, <li>. Formato: metas de curto prazo (4 semanas), médio prazo (3 meses) e longo prazo.

Paciente: ${dados.nome} | Objetivo: ${dados.objetivo ?? '—'}
${plano ? `Meta calórica: ${plano.resumo.meta_calorica} kcal/dia | Proteína: ${plano.resumo.macros.ptn_g}g | Carbo: ${plano.resumo.macros.cho_g}g | Gordura: ${plano.resumo.macros.lip_g}g` : ''}
Exercício: ${dados.praticaExercicio ?? '—'} | Peso atual: ${dados.peso ?? '—'} kg

Retorne APENAS o HTML, sem explicações.`;

    const resultado = await gerarTextoIA(prompt);
    return resultado.replace(/```html?\n?/gi, '').replace(/```/g, '').trim();
  } catch {
    const metaCal = plano?.resumo.meta_calorica;
    return `<p><strong>🎯 Metas Nutricionais — ${new Date().toLocaleDateString('pt-BR')}</strong></p>
<p><strong>Curto Prazo (4 semanas)</strong></p>
<ul><li>Atingir ingestão de ${metaCal ?? '—'} kcal/dia</li><li>Realizar ${dados.refeicoesPorDia ?? 5} refeições diárias nos horários definidos</li><li>Eliminar alimentos ultraprocessados</li><li>Ingerir ao menos 2L de água por dia</li></ul>
<p><strong>Médio Prazo (3 meses)</strong></p>
<ul><li>Consolidar hábitos alimentares saudáveis</li><li>Atingir 80% de aderência ao plano alimentar</li><li>Resultado visível: ${dados.objetivo ?? 'Melhora na composição corporal'}</li></ul>
<p><strong>Longo Prazo</strong></p>
<ul><li>Manutenção do peso e composição corporal atingida</li><li>Autonomia alimentar com escolhas conscientes</li><li>Estilo de vida saudável e sustentável</li></ul>`.trim();
  }
}

async function gerarOrientacoes(dados: DadosPacienteWebdiet): Promise<string> {
  const plano = dados.planoAlimentar;
  try {
    const prompt = `Você é um nutricionista. Gere orientações nutricionais práticas em HTML para o paciente abaixo. Use <p>, <strong>, <ul>, <li>. Inclua: hidratação, horários das refeições, preparo dos alimentos, comportamento alimentar e dicas específicas.

Paciente: ${dados.nome} | Objetivo: ${dados.objetivo ?? '—'}
Alergias: ${dados.alergias || 'Nenhuma'} | Não gosta de: ${dados.alimentosQueNaoGosta || '—'}
Come fora: ${dados.comeFora ?? '—'} | Exercício: ${dados.praticaExercicio ?? '—'}
${plano?.recomendacoes?.length ? 'Recomendações da IA: ' + plano.recomendacoes.join('; ') : ''}

Retorne APENAS o HTML, sem explicações.`;

    const resultado = await gerarTextoIA(prompt);
    return resultado.replace(/```html?\n?/gi, '').replace(/```/g, '').trim();
  } catch {
    return `<p><strong>📌 Orientações Nutricionais — ${new Date().toLocaleDateString('pt-BR')}</strong></p>
<p><strong>💧 Hidratação</strong></p>
<ul><li>Mínimo 2 litros de água por dia</li><li>Evitar refrigerantes e sucos industrializados</li><li>Dar preferência à água, chás sem açúcar e água de coco</li></ul>
<p><strong>⏰ Horários das Refeições</strong></p>
<ul><li>Não ficar mais de 3-4h sem se alimentar</li><li>Realizar ${dados.refeicoesPorDia ?? 5} refeições diárias</li><li>Evitar comer nas 2h antes de dormir</li></ul>
<p><strong>🍳 Preparo dos Alimentos</strong></p>
<ul><li>Dar preferência a métodos: cozido, grelhado, assado, vapor</li><li>Evitar frituras e excesso de óleo</li><li>Temperar com ervas, limão e azeite — reduzir sal</li></ul>
<p><strong>🧠 Comportamento Alimentar</strong></p>
<ul><li>Comer devagar e mastigar bem</li><li>Evitar distrações durante as refeições (celular, TV)</li><li>Respeitar a saciedade — parar antes de se sentir muito cheio</li></ul>
${dados.alergias ? `<p><strong>⚠️ Atenção</strong><br>Evitar: ${dados.alergias}</p>` : ''}
${plano?.recomendacoes?.length ? `<p><strong>📋 Recomendações Específicas</strong></p><ul>${plano.recomendacoes.map(r => `<li>${r}</li>`).join('')}</ul>` : ''}`.trim();
  }
}

// ─── Formata plano alimentar em HTML para WebDiet ────────────

function formatarPlanoHtml(plano: ConteudoPlano, dados: DadosPacienteWebdiet): string {
  const semana = plano.plano.semana_1_4;
  const nomesRefeicao: Record<string, string> = {
    cafe_manha: '☀️ Café da Manhã',
    lanche_manha: '🍎 Lanche da Manhã',
    almoco: '🍽️ Almoço',
    lanche_tarde: '🥗 Lanche da Tarde',
    jantar: '🌙 Jantar',
    ceia: '🫖 Ceia',
  };

  let html = `<p><strong>📋 Plano Alimentar — ${dados.nome}</strong></p>
<p>Meta calórica: <strong>${plano.resumo.meta_calorica} kcal/dia</strong> |
Proteína: <strong>${plano.resumo.macros.ptn_g}g</strong> |
Carboidrato: <strong>${plano.resumo.macros.cho_g}g</strong> |
Gordura: <strong>${plano.resumo.macros.lip_g}g</strong></p>`;

  for (const [chave, nomeRefeicao] of Object.entries(nomesRefeicao)) {
    const opcoes = (semana as unknown as Record<string, { nome: string; calorias: number; ingredientes: { item: string; quantidade: string }[] }[]>)[chave];
    if (!opcoes?.length) continue;

    html += `<p><strong>${nomeRefeicao}</strong></p><ul>`;
    for (const op of opcoes.slice(0, 3)) {
      const ingredientes = op.ingredientes?.map(i => `${i.item} (${i.quantidade})`).join(', ') ?? '';
      html += `<li><strong>${op.nome}</strong> — ${op.calorias} kcal<br><em>${ingredientes}</em></li>`;
    }
    html += '</ul>';
  }

  if (plano.recomendacoes?.length) {
    html += `<p><strong>📌 Recomendações</strong></p><ul>${plano.recomendacoes.map(r => `<li>${r}</li>`).join('')}</ul>`;
  }

  if (plano.alertas_nutricionista?.length) {
    html += `<p><strong>⚠️ Alertas para o Nutricionista</strong></p><ul>${plano.alertas_nutricionista.map(a => `<li>${a}</li>`).join('')}</ul>`;
  }

  return html;
}

// ─── Cria uma entrada de anamnese no perfil do paciente ───────

async function criarAnamnese(page: Page, titulo: string, htmlConteudo: string): Promise<void> {
  // Clica em "Anamnese geral" no menu lateral
  await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll<HTMLElement>('*'));
    const link = links.find(el => el.textContent?.trim() === 'Anamnese geral');
    link?.click();
  });
  await new Promise(r => setTimeout(r, 1000));

  // Clica em "nova anamnese"
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll<HTMLElement>('*'));
    btns.find(el => el.textContent?.trim() === 'nova anamnese')?.click();
  });
  await new Promise(r => setTimeout(r, 700));

  // Clica em "nova anamnese em branco"
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll<HTMLElement>('*'));
    btns.find(el => el.textContent?.trim() === 'nova anamnese em branco')?.click();
  });
  await new Promise(r => setTimeout(r, 800));

  // Preenche título
  await page.evaluate((t) => {
    const el = document.querySelector<HTMLInputElement>('#tituloAnamnese')
      ?? document.querySelector<HTMLInputElement>('[placeholder*="Título da anamnese"]');
    if (!el) return;
    el.focus(); el.value = t;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, titulo);

  // Insere HTML no TinyMCE
  await page.evaluate((html) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tmc = (window as any).tinymce;
    if (tmc) {
      const editor = tmc.get('anamneseContent') ?? tmc.activeEditor;
      if (editor) editor.setContent(html);
    }
  }, htmlConteudo);

  await new Promise(r => setTimeout(r, 400));

  // Salva
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll<HTMLElement>('button, [class*="salvar"]'));
    btns.find(el => el.textContent?.toLowerCase().includes('salvar'))?.click();
  });

  await new Promise(r => setTimeout(r, 800));
  console.log(`[webdiet] Anamnese criada: "${titulo}"`);
}

// ─── Helpers internos ─────────────────────────────────────────

function clicarPorTexto(page: Page, texto: string, parcial = false) {
  return page.evaluate((t, p) => {
    const el = Array.from(document.querySelectorAll<HTMLElement>('*'))
      .find(e => p ? e.textContent?.toLowerCase().includes(t.toLowerCase())
                   : e.textContent?.trim() === t);
    if (el) { el.click(); return true; }
    return false;
  }, texto, parcial);
}

async function esperarEClicar(page: Page, texto: string, parcial = false, timeout = 5000): Promise<boolean> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const ok = await clicarPorTexto(page, texto, parcial);
    if (ok) return true;
    await new Promise(r => setTimeout(r, 300));
  }
  return false;
}

// ─── Busca paciente existente no WebDiet ──────────────────────

async function buscarEAbrirPaciente(page: Page, nome: string, telefone?: string): Promise<boolean> {
  const searchSel = '[placeholder="Busque pelo nome, apelido, CPF, telefone ou pela tag do paciente"]';
  await page.waitForSelector(searchSel, { timeout: 15000 });

  const primeiroNome = nome.split(' ')[0];

  // Foca e limpa o campo
  await page.click(searchSel, { clickCount: 3 });
  await page.keyboard.press('Backspace');
  await new Promise(r => setTimeout(r, 300));

  // Digita caractere por caractere com delay generoso para acionar debounce do Angular
  await page.type(searchSel, primeiroNome, { delay: 120 });

  // Reforça disparo de eventos via evaluate (Angular 2+ precisa do setter nativo)
  await page.evaluate((sel, valor) => {
    const input = document.querySelector<HTMLInputElement>(sel);
    if (!input) return;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    if (setter) setter.call(input, valor);
    ['input', 'keyup', 'change'].forEach(ev =>
      input.dispatchEvent(new Event(ev, { bubbles: true, cancelable: true }))
    );
    // AngularJS fallback
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ng = (window as any).angular;
      if (ng) ng.element(input).triggerHandler('input');
    } catch { /* noop */ }
  }, searchSel, primeiroNome);

  // Aguarda debounce + chamada de API de busca (WebDiet usa ~800ms)
  await new Promise(r => setTimeout(r, 4000));

  // Verifica se apareceu algum resultado com o nome
  const achou = await page.evaluate((nomeBusca, tel) => {
    // O WebDiet usa .pacienteLinha como classe dos itens da lista
    const seletores = [
      '.pacienteLinha', '.pacienteItem', '[class*="paciente-item"]',
      'ul li[onclick]', '[data-id]', '.listaPacientes li',
      '[class*="pacienteLinha"]', '[class*="itemLista"]',
    ];
    let items: HTMLElement[] = [];
    for (const sel of seletores) {
      items = Array.from(document.querySelectorAll<HTMLElement>(sel));
      if (items.length) break;
    }
    if (!items.length) return false;

    // Filtra somente itens que contêm o nome buscado
    const primeiroNome = nomeBusca.split(' ')[0].toLowerCase();
    const comNome = items.filter(el => el.textContent?.toLowerCase().includes(primeiroNome));
    const lista = comNome.length ? comNome : items;

    // Tenta achar pelo telefone (mais preciso)
    if (tel) {
      const telLimpo = tel.replace(/\D/g, '').slice(-8);
      const porTel = lista.find(el => el.textContent?.replace(/\D/g,'').includes(telLimpo));
      if (porTel) { porTel.click(); return true; }
    }

    lista[0].click();
    return true;
  }, nome, telefone);

  if (achou) {
    // Fecha modal "nova consulta?" se aparecer
    await new Promise(r => setTimeout(r, 2000));
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll<HTMLElement>('button, *'));
      btns.find(el => el.textContent?.toLowerCase().includes('não registrar'))?.click();
    });
    await new Promise(r => setTimeout(r, 1000));
  }

  return achou;
}

// ─── Cria prescrição alimentar com o plano da IA (Plano A: texto via TinyMCE) ─
// Fluxo simplificado — sem busca de alimentos, sem APIs internas:
//   1. Navega para Planejamento Alimentar → nova prescrição
//   2. Para cada refeição: cria via UI e insere HTML formatado via TinyMCE
//   3. HTML contém as 3 opções rotativas com ingredientes, macros e preparo

async function criarPrescricaoAlimentar(page: Page, dados: DadosPacienteWebdiet): Promise<void> {
  const plano = dados.planoAlimentar;
  if (!plano) return;

  const refeicoesCfg = [
    { chave: 'cafe_manha',   nome: 'Café da Manhã',   horario: '07:00', sugestao: '08:00 - Café da manhã' },
    { chave: 'lanche_manha', nome: 'Lanche da Manhã', horario: '10:00', sugestao: null },
    { chave: 'almoco',       nome: 'Almoço',           horario: '12:30', sugestao: '13:00 - Almoço' },
    { chave: 'lanche_tarde', nome: 'Lanche da Tarde', horario: '15:30', sugestao: '17:00 - Lanche' },
    { chave: 'jantar',       nome: 'Jantar',           horario: '19:00', sugestao: '21:00 - Jantar' },
    { chave: 'ceia',         nome: 'Ceia',             horario: '21:30', sugestao: null },
  ];

  const semana = plano.plano.semana_1_4 as unknown as Record<string, OpcaoRefeicao[]>;
  const refeicoesFiltradas = refeicoesCfg.filter(r => semana[r.chave]?.length);

  // Helper: clica num elemento pelo texto, com retry até timeout
  const clicar = async (texto: string, timeout = 8000, parcial = false): Promise<boolean> => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const ok = await page.evaluate((t, p) => {
        const todos = Array.from(document.querySelectorAll<HTMLElement>('*'))
          .filter(e => e.offsetWidth > 0);
        const el = todos.find(e => e.children.length === 0 &&
          (p ? e.textContent?.toLowerCase().includes(t.toLowerCase()) : e.textContent?.trim() === t));
        if (el) { el.click(); return true; }
        const el2 = todos.find(e =>
          p ? e.textContent?.toLowerCase().includes(t.toLowerCase()) : e.textContent?.trim() === t);
        if (el2) { el2.click(); return true; }
        return false;
      }, texto, parcial);
      if (ok) return true;
      await new Promise(r => setTimeout(r, 400));
    }
    return false;
  };

  // Helper: insere HTML no TinyMCE ativo ou no contenteditable visível
  const inserirHtml = async (html: string): Promise<void> => {
    await page.evaluate((h) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tmc = (window as any).tinymce;
      if (tmc?.activeEditor) { tmc.activeEditor.setContent(h); return; }
      const ed = Array.from(document.querySelectorAll<HTMLElement>('[contenteditable="true"]'))
        .filter(el => el.offsetWidth > 0).pop();
      if (ed) { ed.innerHTML = h; ed.dispatchEvent(new Event('input', { bubbles: true })); }
    }, html);
  };

  try {
    // ── 1. Abre Planejamento Alimentar ──
    const p1 = await esperarEClicar(page, 'Planejamento alimentar', false, 8000);
    console.log(`[webdiet] Clicou "Planejamento alimentar": ${p1}`);
    await new Promise(r => setTimeout(r, 3000)); // aguarda lista de prescrições carregar

    // ── 2. Nova prescrição (busca parcial — texto pode variar: "+", maiúscula, etc.) ──
    const p2 = await esperarEClicar(page, 'nova prescrição', true, 8000);
    console.log(`[webdiet] Clicou "nova prescrição": ${p2}`);
    await new Promise(r => setTimeout(r, 2500));

    // ── 3. Nome da prescrição ──
    const nomePrescricao = `Plano IA — ${dados.nome} — ${new Date().toLocaleDateString('pt-BR')}`;
    const preencheuNome = await page.evaluate((nome) => {
      const input = document.querySelector<HTMLInputElement>(
        'input[placeholder*="Nome"], input[placeholder*="Cardápio"], input[placeholder*="prescrição"], input[placeholder*="plano"]'
      );
      if (!input) return false;
      input.focus(); input.value = nome;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }, nomePrescricao);
    console.log(`[webdiet] Preencheu nome da prescrição: ${preencheuNome}`);

    // ── 4. Avança (exact match para não clicar elemento errado) ──
    const p4 = await clicar('avançar', 8000);
    console.log(`[webdiet] Clicou "avançar": ${p4}`);
    await new Promise(r => setTimeout(r, 2000));

    // Debug: loga qualquer request de rede após confirmar
    const requestsFeitos: string[] = [];
    const reqHandler = (req: { url: () => string }) => {
      const url = req.url();
      if (url.includes('webdiet') || url.includes('.php')) requestsFeitos.push(url);
    };
    page.on('request', reqHandler);

    // ── 5. Confirma modelo em branco ──
    const p5 = await clicar('confirmar', 8000);
    console.log(`[webdiet] Clicou "confirmar": ${p5}`);
    await new Promise(r => setTimeout(r, 2000));
    console.log(`[webdiet] Requests após confirmar: ${JSON.stringify(requestsFeitos.slice(-5))}`);
    page.off('request', reqHandler);

    // ── 6. Aguarda navegação para metodoPlanning.php ──
    try {
      await page.waitForFunction(
        () => window.location.href.includes('metodoPlanning'),
        { timeout: 45000 }
      );
    } catch {
      const url = page.url();
      console.warn(`[webdiet] Timeout metodoPlanning — URL atual: ${url}`);
      if (!url.includes('metodoPlanning')) {
        // Tenta clicar confirmar de novo (modal pode ter ficado aberto)
        await clicar('confirmar', 3000);
        await new Promise(r => setTimeout(r, 6000));
        if (!page.url().includes('metodoPlanning')) {
          throw new Error(`Não navegou para metodoPlanning. URL atual: ${page.url()}`);
        }
      }
    }
    await new Promise(r => setTimeout(r, 3000));
    console.log(`[webdiet] Editor aberto: ${page.url()}`);

    // ── 6. Adiciona cada refeição ──
    for (const { chave, nome, horario, sugestao } of refeicoesFiltradas) {
      const opcoes = semana[chave];

      // Monta HTML com as 3 opções rotativas
      const html = opcoes.slice(0, 3).map((op, i) =>
        `<p><strong>🔄 Opção ${i + 1}: ${op.nome}</strong> &nbsp;|&nbsp; ${op.calorias} kcal</p>` +
        `<ul>${op.ingredientes.map(ing => `<li>${ing.item} — <em>${ing.quantidade}</em></li>`).join('')}</ul>` +
        `<p><em>🍳 ${op.modo_preparo}</em></p>` +
        `<p><small>PTN ${op.macros.ptn_g}g &nbsp;|&nbsp; CHO ${op.macros.cho_g}g &nbsp;|&nbsp; LIP ${op.macros.lip_g}g</small></p>`
      ).join('<hr>');

      // ── 6a. Nova refeição ──
      const abriu = await clicar('nova refeição ou hábito', 8000);
      if (!abriu) { console.warn(`[webdiet] "nova refeição" não encontrado — pulando "${nome}"`); continue; }
      await new Promise(r => setTimeout(r, 1000));

      await clicar('criar nova refeição');
      await new Promise(r => setTimeout(r, 1000));

      // ── 6b. Seleciona nome da refeição ──
      if (sugestao) {
        // Tenta sugestão rápida; se não achar, preenche manualmente
        const usouSugestao = await clicar(sugestao, 3000);
        if (!usouSugestao) {
          await preencherNomeRefeicao(page, nome, horario);
          await clicar('confirmar');
        }
      } else {
        await preencherNomeRefeicao(page, nome, horario);
        await clicar('confirmar');
      }

      // ── 6c. Aguarda modal do editor abrir ──
      await new Promise(r => setTimeout(r, 3000));

      // ── 6d. Insere HTML das 3 opções via TinyMCE ──
      await inserirHtml(html);
      await new Promise(r => setTimeout(r, 800));

      // ── 6e. Confirma e fecha ──
      const fechou = await clicar('confirmar e fechar', 5000);
      if (!fechou) await page.keyboard.press('Escape');
      await new Promise(r => setTimeout(r, 1500));

      console.log(`[webdiet] ✓ Refeição "${nome}" inserida (${opcoes.length} opções)`);
    }

    await new Promise(r => setTimeout(r, 2000));
    console.log(`[webdiet] ✅ Prescrição concluída para: ${dados.nome}`);

  } catch (err) {
    console.error('[webdiet] Erro em criarPrescricaoAlimentar:', err);
    throw err;
  }
}

// Helper separado: preenche nome e horário da refeição manualmente
async function preencherNomeRefeicao(page: Page, nome: string, horario: string): Promise<void> {
  await page.evaluate((n, h) => {
    // Horário
    const timeInput = Array.from(document.querySelectorAll<HTMLInputElement>('input'))
      .filter(el => el.offsetWidth > 0)
      .find(el => el.type === 'time' || el.placeholder?.includes(':'));
    if (timeInput) {
      timeInput.focus(); timeInput.value = h;
      timeInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
    // Nome
    const textInputs = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="text"], input:not([type])'))
      .filter(el => el.offsetWidth > 0);
    const nameInput = textInputs[textInputs.length - 1];
    if (nameInput) {
      nameInput.focus(); nameInput.value = n;
      nameInput.dispatchEvent(new Event('input', { bubbles: true }));
      nameInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }, nome, horario);
}

// ─── Função principal: inserir paciente + conteúdo completo ───
// • Se paciente já existe no WebDiet: abre perfil existente
//   - com planoAlimentar → só cria prescrição
//   - sem planoAlimentar → cria anamnese/metas/orientações
// • Se não existe: cria + anamnese + metas + orientações + (se plano) prescrição

export async function inserirPacienteWebdiet(dados: DadosPacienteWebdiet): Promise<boolean> {
  const browser = await puppeteer.launch(getPuppeteerOptions());

  try {
    const page = await loginWebdiet(browser);
    if (!page.url().includes('/painel/v4')) {
      await page.goto(WEBDIET_PAINEL_URL, { waitUntil: 'networkidle2' });
    }

    // ── 1. Tenta encontrar paciente já existente ──────────────
    let pacienteJaExistia = await buscarEAbrirPaciente(page, dados.nome, dados.telefone);

    if (!pacienteJaExistia) {
      // ── 2. Cria novo paciente ─────────────────────────────
      await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll<HTMLElement>('*'))
          .find(el => el.textContent?.trim() === 'adicionar paciente');
        btn?.click();
      });
      await page.waitForSelector('#nomeAtalho', { visible: true, timeout: 15000 });

      await page.focus('#nomeAtalho');
      await page.keyboard.type(dados.nome, { delay: 30 });

      if (dados.sexo)           await page.select('#generoAtalho', dados.sexo);
      if (dados.dataNascimento) { await page.focus('#nascimentoAtalho'); await page.keyboard.type(dados.dataNascimento, { delay: 30 }); }
      if (dados.cpf)            { await page.focus('#cpfAtalho'); await page.keyboard.type(dados.cpf, { delay: 30 }); }
      if (dados.telefone)       { await page.focus('#telefoneAtalho'); await page.keyboard.type(dados.telefone.replace(/\D/g,''), { delay: 30 }); }
      if (dados.email)          { await page.focus('#emailAtalho'); await page.keyboard.type(dados.email, { delay: 30 }); }
      if (dados.tags) {
        const tagsEl = await page.$('[placeholder="Tags para o paciente"]');
        if (tagsEl) { await tagsEl.focus(); await page.keyboard.type(dados.tags, { delay: 30 }); }
      }

      await page.evaluate(() => {
        Array.from(document.querySelectorAll<HTMLElement>('button, div.botao, [class*="btn"]'))
          .find(el => el.textContent?.trim().toLowerCase() === 'cadastrar')?.click();
      });
      await page.waitForFunction(
        () => { const el = document.querySelector<HTMLElement>('#nomeAtalho'); return !el || el.offsetWidth === 0; },
        { timeout: 10000 }
      );
      console.log(`[webdiet] Paciente cadastrado: ${dados.nome}`);

      // Abre o perfil recém-criado
      await new Promise(r => setTimeout(r, 1500));
      pacienteJaExistia = await buscarEAbrirPaciente(page, dados.nome, dados.telefone);
    } else {
      console.log(`[webdiet] Paciente já existia, abrindo perfil: ${dados.nome}`);
    }

    await new Promise(r => setTimeout(r, 1500));

    // ── 3. Se tem plano → só cria prescrição (paciente já tem anamnese) ──
    if (dados.planoAlimentar) {
      console.log(`[webdiet] Criando prescrição alimentar para: ${dados.nome}`);
      await criarPrescricaoAlimentar(page, dados);
      console.log(`[webdiet] ✅ Prescrição publicada: ${dados.nome}`);
      return true;
    }

    // ── 4. Sem plano → cria anamnese, metas e orientações ──
    console.log(`[webdiet] Gerando conteúdo com IA para: ${dados.nome}`);
    const [htmlAnamnese, htmlMetas, htmlOrientacoes] = await Promise.all([
      gerarAnamnese(dados),
      gerarMetas(dados),
      gerarOrientacoes(dados),
    ]);

    const hoje = new Date().toLocaleDateString('pt-BR');
    await criarAnamnese(page, `Pré-Consulta — ${hoje}`, htmlAnamnese);
    await criarAnamnese(page, `Metas e Objetivos — ${hoje}`, htmlMetas);
    await criarAnamnese(page, `Orientações Nutricionais — ${hoje}`, htmlOrientacoes);

    console.log(`[webdiet] ✅ Inserção completa para: ${dados.nome}`);
    return true;

  } catch (err) {
    console.error('[webdiet] Erro:', err);
    return false;
  } finally {
    await browser.close();
  }
}

// ─── Pagamento financeiro ─────────────────────────────────────

export interface DadosPagamentoWebdiet {
  nomePaciente: string;
  nomeLancamento: string;
  valor: number;
  formaPagamento: 'PIX' | 'CREDIT_CARD' | 'DEBIT_CARD' | 'BOLETO' | string;
  categoria?: 'Consulta' | 'Retorno';
  cpfPaciente?: string;
  observacao?: string;
}

export async function lancarPagamentoWebdiet(dados: DadosPagamentoWebdiet): Promise<boolean> {
  const browser = await puppeteer.launch(getPuppeteerOptions());
  try {
    const page = await loginWebdiet(browser);
    await page.goto(WEBDIET_FINANCEIRO_URL, { waitUntil: 'networkidle2' });

    await page.evaluate(() => {
      Array.from(document.querySelectorAll<HTMLElement>('*'))
        .find(el => el.textContent?.trim() === 'adicionar nova movimentação')?.click();
    });
    await new Promise(r => setTimeout(r, 600));

    await page.evaluate(() => {
      Array.from(document.querySelectorAll<HTMLElement>('*'))
        .find(el => el.textContent?.trim() === 'entrada')?.click();
    });
    await new Promise(r => setTimeout(r, 800));

    await page.evaluate(() => {
      (document.querySelector<HTMLElement>('#pacienteDiv')
        ?? Array.from(document.querySelectorAll<HTMLElement>('*'))
            .find(el => el.textContent?.trim() === 'Vincular paciente'))?.click();
    });
    await page.waitForSelector('#barraBuscaPacienteAtalho', { visible: true, timeout: 8000 });
    await new Promise(r => setTimeout(r, 400));

    await page.focus('#barraBuscaPacienteAtalho');
    await page.keyboard.type(dados.nomePaciente.split(' ')[0], { delay: 40 });
    await new Promise(r => setTimeout(r, 1500));

    await page.evaluate((nome) => {
      const items = Array.from(document.querySelectorAll<HTMLElement>('.modal.show li, .listaPacientes li, li[onclick], ul li'));
      (items.find(el => el.textContent?.includes(nome.split(' ')[0])) ?? items[0])?.click();
    }, dados.nomePaciente);
    await new Promise(r => setTimeout(r, 800));

    await page.click('[name="nome"]');
    await page.type('[name="nome"]', dados.nomeLancamento, { delay: 30 });

    if (dados.categoria) await page.select('#categoriaAtalho', dados.categoria);

    await page.evaluate((val) => {
      const input = document.querySelector<HTMLInputElement>('#valor');
      if (input) { input.value = val; input.dispatchEvent(new Event('input', { bubbles: true })); }
    }, dados.valor.toFixed(2).replace('.', ','));

    await page.select('#forma', FORMA_PAGAMENTO_MAP[dados.formaPagamento] ?? '7');

    if (dados.cpfPaciente) { await page.click('[name="cpf"]'); await page.type('[name="cpf"]', dados.cpfPaciente, { delay: 20 }); }
    if (dados.observacao)  { await page.click('[name="observacao"]'); await page.type('[name="observacao"]', dados.observacao, { delay: 20 }); }

    await page.evaluate(() => {
      Array.from(document.querySelectorAll<HTMLElement>('*'))
        .find(el => el.textContent?.trim() === 'confirmar')?.click();
    });
    await new Promise(r => setTimeout(r, 1500));

    console.log(`[webdiet] Pagamento lançado: ${dados.nomePaciente} — R$ ${dados.valor.toFixed(2)}`);
    return true;
  } catch (err) {
    console.error('[webdiet] Erro ao lançar pagamento:', err);
    return false;
  } finally {
    await browser.close();
  }
}

// ─── Estatísticas ─────────────────────────────────────────────

export interface EstatisticasWebdiet {
  totalConsultas: number;
  totalPacientes: number;
  totalPrescricoes: number;
  totalAntropometrias: number;
}

export async function obterEstatisticasWebdiet(): Promise<EstatisticasWebdiet | null> {
  const browser = await puppeteer.launch(getPuppeteerOptions());
  try {
    const page = await loginWebdiet(browser);
    await page.goto(WEBDIET_STATS_URL, { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 1500));

    const stats = await page.evaluate(() => {
      const totalTexto = Array.from(document.querySelectorAll<HTMLElement>('*'))
        .find(el => el.textContent?.includes('Total de consultas:'))?.textContent ?? '';
      const totalConsultas = parseInt(totalTexto.match(/Total de consultas:\s*(\d+)/)?.[1] ?? '0');
      const numeros = Array.from(document.querySelectorAll<HTMLElement>('*'))
        .filter(el => el.children.length === 0 && /^\d+$/.test(el.textContent?.trim() ?? '') && parseInt(el.textContent?.trim() ?? '0') > 0)
        .map(el => parseInt(el.textContent?.trim() ?? '0'));
      return { totalConsultas, numeros: numeros.slice(0, 10) };
    });

    const [totalPacientes = 0, totalAntropometrias = 0, totalPrescricoes = 0] = stats.numeros;
    return { totalConsultas: stats.totalConsultas, totalPacientes, totalAntropometrias, totalPrescricoes };
  } catch (err) {
    console.error('[webdiet] Erro ao buscar estatísticas:', err);
    return null;
  } finally {
    await browser.close();
  }
}
