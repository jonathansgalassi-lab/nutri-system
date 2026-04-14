import puppeteer, { Browser, Page } from 'puppeteer';
import dotenv from 'dotenv';

dotenv.config();

const WEBDIET_LOGIN_URL = 'https://pt.webdiet.com.br/login/';
const WEBDIET_PAINEL_URL = 'https://pt.webdiet.com.br/painel/v4/';

async function loginWebdiet(browser: Browser): Promise<Page> {
  const page = await browser.newPage();
  await page.goto(WEBDIET_LOGIN_URL, { waitUntil: 'networkidle2' });

  // Preenche email
  await page.waitForSelector('input[placeholder="email de acesso"]');
  await page.click('input[placeholder="email de acesso"]');
  await page.type('input[placeholder="email de acesso"]', process.env.WEBDIET_EMAIL ?? '', { delay: 50 });

  // Preenche senha
  await page.click('input[placeholder="senha de acesso"]');
  await page.type('input[placeholder="senha de acesso"]', process.env.WEBDIET_PASSWORD ?? '', { delay: 50 });

  // Clica em entrar
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('*'));
    const entrar = btns.find(el => el.textContent?.trim() === 'entrar');
    (entrar as HTMLElement)?.click();
  });

  // Aguarda navegar para o painel
  await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 });

  return page;
}

export interface DadosPacienteWebdiet {
  nome: string;
  apelido?: string;
  sexo?: 'M' | 'F';
  dataNascimento?: string;   // DD/MM/AAAA
  cpf?: string;
  telefone?: string;          // apenas números com DDD, ex: 43991622448
  email?: string;
  tags?: string;
}

export async function inserirPacienteWebdiet(dados: DadosPacienteWebdiet): Promise<boolean> {
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH ?? undefined,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    const page = await loginWebdiet(browser);

    // Garante que está no painel v4
    if (!page.url().includes('/painel/v4')) {
      await page.goto(WEBDIET_PAINEL_URL, { waitUntil: 'networkidle2' });
    }

    // Clica em "adicionar paciente"
    await page.waitForSelector('[placeholder="Busque pelo nome, apelido, CPF, telefone ou pela tag do paciente"]');
    await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll('*'));
      const btn = els.find(el => el.textContent?.trim() === 'adicionar paciente');
      (btn as HTMLElement)?.click();
    });

    // Aguarda o modal abrir
    await page.waitForSelector('[placeholder="Nome completo"]', { timeout: 8000 });

    // Nome completo
    await page.click('[placeholder="Nome completo"]');
    await page.type('[placeholder="Nome completo"]', dados.nome, { delay: 30 });

    // Apelido
    if (dados.apelido) {
      await page.click('[placeholder="Apelido (opcional)"]');
      await page.type('[placeholder="Apelido (opcional)"]', dados.apelido, { delay: 30 });
    }

    // Gênero
    if (dados.sexo) {
      await page.select('select', dados.sexo);
    }

    // Data de nascimento
    if (dados.dataNascimento) {
      await page.click('[placeholder="Data de nascimento"]');
      await page.type('[placeholder="Data de nascimento"]', dados.dataNascimento, { delay: 30 });
    }

    // CPF
    if (dados.cpf) {
      await page.click('[placeholder="Número do CPF"]');
      await page.type('[placeholder="Número do CPF"]', dados.cpf, { delay: 30 });
    }

    // Telefone (apenas números)
    if (dados.telefone) {
      const tel = dados.telefone.replace(/\D/g, '');
      await page.click('[placeholder="Celular com DDD"]');
      await page.type('[placeholder="Celular com DDD"]', tel, { delay: 30 });
    }

    // Email
    if (dados.email) {
      await page.click('[placeholder="Email de contato"]');
      await page.type('[placeholder="Email de contato"]', dados.email, { delay: 30 });
    }

    // Tags
    if (dados.tags) {
      await page.click('[placeholder="Tags para o paciente"]');
      await page.type('[placeholder="Tags para o paciente"]', dados.tags, { delay: 30 });
    }

    // Clica em cadastrar
    await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll('*'));
      const btn = els.find(el => el.textContent?.trim() === 'cadastrar');
      (btn as HTMLElement)?.click();
    });

    // Aguarda modal fechar (paciente cadastrado)
    await page.waitForFunction(
      () => !document.querySelector('[placeholder="Nome completo"]'),
      { timeout: 10000 }
    );

    console.log(`[webdiet] Paciente cadastrado: ${dados.nome}`);
    return true;

  } catch (err) {
    console.error('[webdiet] Erro ao cadastrar paciente:', err);
    return false;
  } finally {
    await browser.close();
  }
}
