import puppeteer, { Browser, Page } from 'puppeteer';
import dotenv from 'dotenv';
import OpenAI from 'openai';

dotenv.config();

const WEBDIET_LOGIN_URL = 'https://pt.webdiet.com.br/login/';
const WEBDIET_PAINEL_URL = 'https://pt.webdiet.com.br/painel/v4/';
const WEBDIET_FINANCEIRO_URL = 'https://pt.webdiet.com.br/painel/v4/financeiro.php';
const WEBDIET_STATS_URL = 'https://pt.webdiet.com.br/painel/v4/estatisticas.php';

// Mapeamento Asaas billingType → select "forma" no WebDiet
const FORMA_PAGAMENTO_MAP: Record<string, string> = {
  PIX: '7',
  CREDIT_CARD: '3',
  DEBIT_CARD: '2',
  BOLETO: '1',
  TRANSFERENCIA: '6',
};

// Detecta o executável do Chrome disponível
function detectChromePath(): string | undefined {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }
  // macOS — Google Chrome instalado
  if (process.platform === 'darwin') {
    return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  }
  // Linux — Chromium via apt (Railway/Docker)
  return '/usr/bin/chromium';
}

// Opções de lançamento do Puppeteer (compatível macOS + Linux/Docker)
function getPuppeteerOptions() {
  return {
    headless: true as const,
    executablePath: detectChromePath(),
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
    timeout: 60000,
  };
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ─── Login ────────────────────────────────────────────────────

async function loginWebdiet(browser: Browser): Promise<Page> {
  const page = await browser.newPage();
  page.setDefaultTimeout(60000);
  page.setDefaultNavigationTimeout(60000);

  await page.goto(WEBDIET_LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('input[placeholder="email de acesso"]', { timeout: 20000 });

  // Limpa e preenche email — triple-click seleciona todo o conteúdo antes de digitar
  await page.click('input[placeholder="email de acesso"]', { clickCount: 3 });
  await page.keyboard.press('Backspace');
  await page.type('input[placeholder="email de acesso"]', process.env.WEBDIET_EMAIL ?? '', { delay: 30 });

  // Limpa e preenche senha
  await page.click('input[placeholder="senha de acesso"]', { clickCount: 3 });
  await page.keyboard.press('Backspace');
  await page.type('input[placeholder="senha de acesso"]', process.env.WEBDIET_PASSWORD ?? '', { delay: 30 });

  // Verifica o que está nos campos antes de submeter
  const camposPreenchidos = await page.evaluate(() => ({
    email: (document.querySelector<HTMLInputElement>('input[placeholder="email de acesso"]'))?.value,
    senhaLen: (document.querySelector<HTMLInputElement>('input[placeholder="senha de acesso"]'))?.value.length,
  }));
  console.log('[webdiet] Login — campos:', camposPreenchidos);

  await new Promise(r => setTimeout(r, 300));

  // Clica em "entrar" via page.click() (simula mouse real — mais confiável em headless)
  await page.click('div.botao');

  // Aguarda URL mudar para o painel
  await page.waitForFunction(
    () => window.location.href.includes('/painel/v4'),
    { timeout: 30000, polling: 500 }
  );

  // Aguarda o campo de busca de pacientes aparecer (confirma que o painel carregou)
  await page.waitForSelector(
    '[placeholder="Busque pelo nome, apelido, CPF, telefone ou pela tag do paciente"]',
    { timeout: 20000 }
  );

  return page;
}

// ─── Gera resumo da anamnese (IA ou fallback HTML) ───────────

function gerarResumoAnamneseFallback(dados: DadosPacienteWebdiet): string {
  const sexoTexto = dados.sexo === 'M' ? 'Masculino' : 'Feminino';
  const imc = dados.peso && dados.altura
    ? (dados.peso / Math.pow(dados.altura / 100, 2)).toFixed(1)
    : null;

  return `
<p><strong>📋 Pré-Consulta — ${new Date().toLocaleDateString('pt-BR')}</strong></p>

<p><strong>Dados Pessoais</strong><br>
Sexo: ${sexoTexto} | Nascimento: ${dados.dataNascimento ?? '—'} |
Peso: ${dados.peso ? dados.peso + ' kg' : '—'} | Altura: ${dados.altura ? dados.altura + ' cm' : '—'}
${imc ? `| IMC: ${imc}` : ''}</p>

<p><strong>🎯 Objetivo Principal</strong><br>${dados.objetivo ?? '—'}</p>

<p><strong>⚠️ Saúde</strong></p>
<ul>
  <li>Alergias/Intolerâncias: ${dados.alergias || 'Nenhuma relatada'}</li>
  <li>Medicamentos: ${dados.medicamentos || 'Nenhum'}</li>
  <li>Histórico familiar: ${dados.historicoFamiliar?.join(', ') || '—'}</li>
</ul>

<p><strong>🏋️ Atividade Física</strong><br>
${dados.praticaExercicio ?? '—'} — ${dados.tipoExercicio || ''}</p>

<p><strong>🍽️ Hábitos Alimentares</strong></p>
<ul>
  <li>Refeições/dia: ${dados.refeicoesPorDia ?? '—'}</li>
  <li>Gosta de: ${dados.alimentosQueGosta || '—'}</li>
  <li>Não gosta de: ${dados.alimentosQueNaoGosta || '—'}</li>
  <li>Come fora: ${dados.comeFora ?? '—'} ${dados.ondeComeFora ? '(' + dados.ondeComeFora + ')' : ''}</li>
  <li>Dificuldades: ${dados.dificuldadesAlimentacao || '—'}</li>
  <li>Dietas anteriores: ${dados.dietasAnteriores || '—'}</li>
</ul>

<p><strong>💬 Expectativas</strong><br>${dados.expectativas || '—'}</p>
`.trim();
}

async function gerarResumoAnamnese(dados: DadosPacienteWebdiet): Promise<string> {
  // Se não há chave OpenAI, usa o fallback estruturado
  if (!process.env.OPENAI_API_KEY) {
    console.log('[webdiet] OPENAI_API_KEY não definida — usando template HTML padrão');
    return gerarResumoAnamneseFallback(dados);
  }

  const sexoTexto = dados.sexo === 'M' ? 'Masculino' : 'Feminino';

  const prompt = `Você é um assistente de nutrição. Com base nos dados da pré-consulta abaixo, gere um resumo clínico estruturado em HTML para ser inserido na anamnese do paciente no sistema WebDiet. Use títulos em negrito, listas e parágrafos curtos. Seja objetivo e profissional.

DADOS DO PACIENTE:
- Nome: ${dados.nome}
- Sexo: ${sexoTexto}
- Data de nascimento: ${dados.dataNascimento ?? 'não informada'}
- Peso: ${dados.peso ? dados.peso + ' kg' : 'não informado'}
- Altura: ${dados.altura ? dados.altura + ' cm' : 'não informada'}
- Objetivo principal: ${dados.objetivo ?? 'não informado'}
- Alergias/Intolerâncias: ${dados.alergias || 'nenhuma relatada'}
- Medicamentos: ${dados.medicamentos || 'nenhum'}
- Histórico familiar: ${dados.historicoFamiliar?.join(', ') || 'não informado'}
- Exercício físico: ${dados.praticaExercicio ?? 'não informado'} — ${dados.tipoExercicio || ''}
- Refeições por dia: ${dados.refeicoesPorDia ?? 'não informado'}
- Alimentos que gosta: ${dados.alimentosQueGosta || 'não informado'}
- Alimentos que não gosta: ${dados.alimentosQueNaoGosta || 'não informado'}
- Come fora: ${dados.comeFora ?? 'não informado'} ${dados.ondeComeFora ? '(' + dados.ondeComeFora + ')' : ''}
- Dificuldades com alimentação: ${dados.dificuldadesAlimentacao || 'não informado'}
- Dietas anteriores: ${dados.dietasAnteriores || 'não informado'}
- Expectativas: ${dados.expectativas || 'não informado'}

Gere o HTML da anamnese agora:`;

  try {
    const resp = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 1000,
    });
    return resp.choices[0]?.message?.content ?? gerarResumoAnamneseFallback(dados);
  } catch (err) {
    console.warn('[webdiet] Falha na IA, usando template padrão:', err);
    return gerarResumoAnamneseFallback(dados);
  }
}

// ─── Tipos ────────────────────────────────────────────────────

export interface DadosPacienteWebdiet {
  nome: string;
  apelido?: string;
  sexo?: 'M' | 'F';
  dataNascimento?: string;       // DD/MM/AAAA
  cpf?: string;
  telefone?: string;             // apenas números com DDD
  email?: string;
  tags?: string;
  // Dados da pré-consulta para anamnese
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
}

// ─── Função principal ─────────────────────────────────────────

export async function inserirPacienteWebdiet(dados: DadosPacienteWebdiet): Promise<boolean> {
  const browser = await puppeteer.launch(getPuppeteerOptions());

  try {
    const page = await loginWebdiet(browser);

    if (!page.url().includes('/painel/v4')) {
      await page.goto(WEBDIET_PAINEL_URL, { waitUntil: 'networkidle2' });
    }

    // ── 1. Abre modal "adicionar paciente" ──────────────────
    await page.waitForSelector('[placeholder="Busque pelo nome, apelido, CPF, telefone ou pela tag do paciente"]');
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll<HTMLElement>('*'))
        .find(el => el.textContent?.trim() === 'adicionar paciente');
      btn?.click();
    });

    // Aguarda o campo #nomeAtalho (id específico do modal de atalho) ficar visível
    await page.waitForSelector('#nomeAtalho', { visible: true, timeout: 15000 });

    // ── 2. Preenche o formulário usando IDs do modal "Atalho" ──
    await page.focus('#nomeAtalho');
    await page.keyboard.type(dados.nome, { delay: 30 });

    if (dados.apelido) {
      await page.focus('#apelidoAtalho');
      await page.keyboard.type(dados.apelido, { delay: 30 });
    }

    if (dados.sexo) {
      await page.select('#generoAtalho', dados.sexo);
    }

    if (dados.dataNascimento) {
      await page.focus('#nascimentoAtalho');
      await page.keyboard.type(dados.dataNascimento, { delay: 30 });
    }

    if (dados.cpf) {
      await page.focus('#cpfAtalho');
      await page.keyboard.type(dados.cpf, { delay: 30 });
    }

    if (dados.telefone) {
      const tel = dados.telefone.replace(/\D/g, '');
      await page.focus('#telefoneAtalho');
      await page.keyboard.type(tel, { delay: 30 });
    }

    if (dados.email) {
      await page.focus('#emailAtalho');
      await page.keyboard.type(dados.email, { delay: 30 });
    }

    if (dados.tags) {
      // Campo de tags não tem ID fixo, usa placeholder
      const tagsEl = await page.$('[placeholder="Tags para o paciente"]');
      if (tagsEl) {
        await tagsEl.focus();
        await page.keyboard.type(dados.tags, { delay: 30 });
      }
    }

    // ── 3. Salva o paciente ─────────────────────────────────
    await page.evaluate(() => {
      // Botão "cadastrar" dentro do swal2 ou do modal de atalho
      const btn = Array.from(document.querySelectorAll<HTMLElement>('button, div.botao, [class*="btn"]'))
        .find(el => el.textContent?.trim().toLowerCase() === 'cadastrar');
      btn?.click();
    });

    // Aguarda o campo #nomeAtalho sumir (modal fechou)
    await page.waitForFunction(
      () => {
        const el = document.querySelector<HTMLElement>('#nomeAtalho');
        return !el || el.offsetWidth === 0;
      },
      { timeout: 10000 }
    );

    console.log(`[webdiet] Paciente cadastrado: ${dados.nome}`);

    // ── 4. Busca o paciente recém-criado ────────────────────
    await new Promise(r => setTimeout(r, 1500));

    // Busca pelo nome no campo de search
    const searchInput = await page.$('[placeholder="Busque pelo nome, apelido, CPF, telefone ou pela tag do paciente"]');
    if (searchInput) {
      await searchInput.click();
      await searchInput.type(dados.nome.split(' ')[0], { delay: 40 });
      await new Promise(r => setTimeout(r, 1500));

      // Clica no primeiro resultado
      await page.evaluate(() => {
        const resultados = document.querySelectorAll<HTMLElement>('.paciente-item, [data-paciente], .lista-paciente li');
        if (resultados.length > 0) (resultados[0] as HTMLElement).click();
      });

      // Aguarda perfil do paciente abrir
      await page.waitForSelector('[placeholder="Título da anamnese (exemplo: Histórico familiar, histórico patológico, rotina alimentar, etc.)"]', { timeout: 10000 }).catch(() => {
        // Tenta clicar via função abrirPaciente
      });
    }

    // ── 5. Navega para Anamnese geral ───────────────────────
    const anamnese = await page.$('[placeholder="Título da anamnese (exemplo: Histórico familiar, histórico patológico, rotina alimentar, etc.)"]');

    if (!anamnese) {
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
        const btn = btns.find(el => el.textContent?.trim() === 'nova anamnese');
        btn?.click();
      });
      await new Promise(r => setTimeout(r, 800));

      // Clica em "nova anamnese em branco"
      await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll<HTMLElement>('*'));
        const btn = btns.find(el => el.textContent?.trim() === 'nova anamnese em branco');
        btn?.click();
      });
      await new Promise(r => setTimeout(r, 1000));
    }

    // ── 6. Preenche o título da anamnese ────────────────────
    const hoje = new Date().toLocaleDateString('pt-BR');
    const tituloAnamnese = `Pré-Consulta — ${hoje}`;
    const tituloPreenchido = await page.evaluate((titulo) => {
      const el = document.querySelector<HTMLInputElement>('#tituloAnamnese')
        ?? document.querySelector<HTMLInputElement>('[placeholder*="Título da anamnese"]');
      if (!el) return false;
      el.focus();
      el.value = titulo;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }, tituloAnamnese);
    console.log(`[webdiet] Título da anamnese preenchido: ${tituloPreenchido}`);

    // ── 7. Gera resumo com IA e insere no TinyMCE ──────────
    const resumoHtml = await gerarResumoAnamnese(dados);

    await page.evaluate((html) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tmc = (window as any).tinymce;
      if (tmc) {
        const editor = tmc.get('anamneseContent');
        if (editor) editor.setContent(html);
      }
    }, resumoHtml);

    // ── 8. Salva a anamnese ─────────────────────────────────
    await new Promise(r => setTimeout(r, 500));
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll<HTMLElement>('button, [class*="salvar"], [class*="save"]'));
      const salvar = btns.find(el =>
        el.textContent?.toLowerCase().includes('salvar') ||
        el.textContent?.toLowerCase().includes('save')
      );
      salvar?.click();
    });

    await new Promise(r => setTimeout(r, 1000));
    console.log(`[webdiet] Anamnese criada para: ${dados.nome}`);

    // ── 9. Cria prescrição alimentar com protocolo automático ──
    await criarPrescricaoComProtocolo(page, dados);

    return true;

  } catch (err) {
    console.error('[webdiet] Erro:', err);
    return false;
  } finally {
    await browser.close();
  }
}

// ─── Seleciona protocolo baseado nos dados da pré-consulta ────

function selecionarProtocolo(dados: DadosPacienteWebdiet): string | null {
  const objetivo = (dados.objetivo ?? '').toLowerCase();
  const historico = (dados.historicoFamiliar ?? []).join(' ').toLowerCase();
  const alergias = (dados.alergias ?? '').toLowerCase();

  if (historico.includes('diabetes') || alergias.includes('diabetes')) return 'Diabetes Tipo 2';
  if (historico.includes('hipertens') || historico.includes('pressão')) return 'Hipertensão arterial sistêmica (HAS)';
  if (historico.includes('triglicérides') || historico.includes('triglicerides')) return 'Triglicerídeos muito elevados (> 500mg/dL)';
  if (historico.includes('síndrome metabólica') || historico.includes('sindrome metabolica')) return 'Síndrome metabólica';
  if (historico.includes('esteatose') || historico.includes('fígado')) return 'Esteatose hepática não alcoólica';
  if (objetivo.includes('emagrec') || objetivo.includes('perder peso') || objetivo.includes('defini')) return 'Emagrecimento';
  if (objetivo.includes('massa') || objetivo.includes('hipertrofia') || objetivo.includes('ganho')) return 'Hipertrofia';
  if (objetivo.includes('low carb')) return 'Low-carb';
  if (objetivo.includes('mediterr')) return 'Mediterrâneo';

  return 'Emagrecimento'; // padrão
}

async function criarPrescricaoComProtocolo(page: Page, dados: DadosPacienteWebdiet): Promise<void> {
  try {
    // Clica em "Planejamento alimentar" no menu lateral
    await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll<HTMLElement>('*'));
      const item = items.find(el => el.textContent?.trim() === 'Planejamento alimentar');
      item?.click();
    });
    await new Promise(r => setTimeout(r, 1000));

    // Clica em "nova prescrição alimentar"
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll<HTMLElement>('*'));
      const btn = btns.find(el => el.textContent?.trim() === 'nova prescrição alimentar');
      btn?.click();
    });

    // Aguarda navegar para a página de edição da prescrição
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 1500));

    // Clica em "protocolo nutricional"
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll<HTMLElement>('*'));
      const btn = btns.find(el => el.textContent?.trim() === 'protocolo nutricional');
      btn?.click();
    });
    await new Promise(r => setTimeout(r, 800));

    // Clica em "Usar protocolo modelo"
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll<HTMLElement>('*'));
      const btn = btns.find(el => el.textContent?.trim() === 'Usar protocolo modelo');
      btn?.click();
    });
    await new Promise(r => setTimeout(r, 800));

    // Seleciona o protocolo correto baseado nos dados
    const protocolo = selecionarProtocolo(dados);
    if (protocolo) {
      await page.evaluate((nomeProtocolo) => {
        const items = Array.from(document.querySelectorAll<HTMLElement>('li, [class*="item"]'));
        const item = items.find(el => el.textContent?.trim() === nomeProtocolo);
        item?.click();
      }, protocolo);
      await new Promise(r => setTimeout(r, 500));

      // Confirma a seleção
      await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll<HTMLElement>('button, *'));
        const btn = btns.find(el => el.textContent?.trim() === 'confirmar');
        btn?.click();
      });
      await new Promise(r => setTimeout(r, 1000));

      console.log(`[webdiet] Protocolo "${protocolo}" aplicado para: ${dados.nome}`);
    }
  } catch (err) {
    console.error('[webdiet] Erro ao criar prescrição:', err);
  }
}

// ─── Tipos: lançamento financeiro ─────────────────────────────

export interface DadosPagamentoWebdiet {
  nomePaciente: string;
  nomeLancamento: string;       // ex: "Acompanhamento Anual - Parcela 1/12"
  valor: number;                // ex: 300.00
  formaPagamento: 'PIX' | 'CREDIT_CARD' | 'DEBIT_CARD' | 'BOLETO' | string;
  categoria?: 'Consulta' | 'Retorno';
  cpfPaciente?: string;
  observacao?: string;
}

// ─── Lança pagamento no Financeiro do WebDiet ─────────────────

export async function lancarPagamentoWebdiet(dados: DadosPagamentoWebdiet): Promise<boolean> {
  const browser = await puppeteer.launch(getPuppeteerOptions());

  try {
    const page = await loginWebdiet(browser);
    await page.goto(WEBDIET_FINANCEIRO_URL, { waitUntil: 'networkidle2' });

    // ── 1. Abre modal ───────────────────────────────────────────
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll<HTMLElement>('*'))
        .find(el => el.textContent?.trim() === 'adicionar nova movimentação');
      btn?.click();
    });
    await new Promise(r => setTimeout(r, 600));

    // ── 2. Seleciona tipo "entrada" ─────────────────────────────
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll<HTMLElement>('*'))
        .find(el => el.textContent?.trim() === 'entrada');
      btn?.click();
    });
    await new Promise(r => setTimeout(r, 800));

    // ── 3. Vincula paciente pelo nome ───────────────────────────
    await page.evaluate(() => {
      // O botão "Vincular paciente" é a div#pacienteDiv com class="conjunto-input"
      const btn = document.querySelector<HTMLElement>('#pacienteDiv')
        ?? Array.from(document.querySelectorAll<HTMLElement>('*'))
             .find(el => el.textContent?.trim() === 'Vincular paciente');
      btn?.click();
    });
    // Aguarda o input de busca aparecer
    await page.waitForSelector('#barraBuscaPacienteAtalho', { visible: true, timeout: 8000 });
    await new Promise(r => setTimeout(r, 400));

    const primeiroNome = dados.nomePaciente.split(' ')[0];
    await page.focus('#barraBuscaPacienteAtalho');
    await page.keyboard.type(primeiroNome, { delay: 40 });
    await new Promise(r => setTimeout(r, 1500));

    // Clica no primeiro resultado da lista
    await page.evaluate((nomeCompleto) => {
      // Resultados ficam em li dentro do modal de busca de paciente
      const items = Array.from(document.querySelectorAll<HTMLElement>(
        '.modal.show li, .modal.fade.show li, .listaPacientes li, li[onclick], ul li'
      ));
      const encontrado = items.find(el => el.textContent?.includes(nomeCompleto.split(' ')[0]));
      (encontrado ?? items[0])?.click();
    }, dados.nomePaciente);
    await new Promise(r => setTimeout(r, 800));

    // ── 4. Preenche nome do lançamento ──────────────────────────
    await page.click('[name="nome"]');
    await page.type('[name="nome"]', dados.nomeLancamento, { delay: 30 });

    // ── 5. Categoria ────────────────────────────────────────────
    if (dados.categoria) {
      await page.select('#categoriaAtalho', dados.categoria);
    }

    // ── 6. Valor ────────────────────────────────────────────────
    await page.evaluate((val) => {
      const input = document.querySelector<HTMLInputElement>('#valor');
      if (input) {
        input.value = val;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, dados.valor.toFixed(2).replace('.', ','));

    // ── 7. Forma de pagamento ───────────────────────────────────
    const formaId = FORMA_PAGAMENTO_MAP[dados.formaPagamento] ?? '7';
    await page.select('#forma', formaId);

    // ── 8. CPF / nº documento (opcional) ───────────────────────
    if (dados.cpfPaciente) {
      await page.click('[name="cpf"]');
      await page.type('[name="cpf"]', dados.cpfPaciente, { delay: 20 });
    }

    // ── 9. Observação ───────────────────────────────────────────
    if (dados.observacao) {
      await page.click('[name="observacao"]');
      await page.type('[name="observacao"]', dados.observacao, { delay: 20 });
    }

    // ── 10. Confirma ────────────────────────────────────────────
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll<HTMLElement>('*'))
        .find(el => el.textContent?.trim() === 'confirmar');
      btn?.click();
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

// ─── Busca estatísticas do WebDiet ────────────────────────────

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
      // Consultas registradas — texto "Total de consultas: N"
      const totalTexto = Array.from(document.querySelectorAll<HTMLElement>('*'))
        .find(el => el.textContent?.includes('Total de consultas:'))?.textContent ?? '';
      const totalConsultas = parseInt(totalTexto.match(/Total de consultas:\s*(\d+)/)?.[1] ?? '0');

      // Cards Pacientes / Antropometrias / Prescrições
      const cards = Array.from(document.querySelectorAll<HTMLElement>('[class*="card"] h2, [class*="card"] span, td, th'));
      const textos = cards.map(el => el.textContent?.trim() ?? '');

      // Tenta ler os valores dos 4 cards (Pacientes, Antropometrias, Prescrições, Manipulados)
      const numeros = Array.from(document.querySelectorAll<HTMLElement>('*'))
        .filter(el =>
          el.children.length === 0 &&
          /^\d+$/.test(el.textContent?.trim() ?? '') &&
          parseInt(el.textContent?.trim() ?? '0') > 0
        )
        .map(el => parseInt(el.textContent?.trim() ?? '0'));

      void textos;
      return { totalConsultas, numeros: numeros.slice(0, 10) };
    });

    // Os cards aparecem na ordem: Pacientes, Antropometrias, Prescrições, Manipulados
    // Encontra os 4 maiores valores consistentes
    const [totalPacientes = 0, totalAntropometrias = 0, totalPrescricoes = 0] = stats.numeros;

    return {
      totalConsultas: stats.totalConsultas,
      totalPacientes,
      totalAntropometrias,
      totalPrescricoes,
    };

  } catch (err) {
    console.error('[webdiet] Erro ao buscar estatísticas:', err);
    return null;
  } finally {
    await browser.close();
  }
}
