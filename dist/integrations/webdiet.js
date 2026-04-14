"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.inserirPacienteWebdiet = inserirPacienteWebdiet;
const puppeteer_1 = __importDefault(require("puppeteer"));
const dotenv_1 = __importDefault(require("dotenv"));
const openai_1 = __importDefault(require("openai"));
dotenv_1.default.config();
const WEBDIET_LOGIN_URL = 'https://pt.webdiet.com.br/login/';
const WEBDIET_PAINEL_URL = 'https://pt.webdiet.com.br/painel/v4/';
const openai = new openai_1.default({ apiKey: process.env.OPENAI_API_KEY });
// ─── Login ────────────────────────────────────────────────────
async function loginWebdiet(browser) {
    const page = await browser.newPage();
    await page.goto(WEBDIET_LOGIN_URL, { waitUntil: 'networkidle2' });
    await page.waitForSelector('input[placeholder="email de acesso"]');
    await page.click('input[placeholder="email de acesso"]');
    await page.type('input[placeholder="email de acesso"]', process.env.WEBDIET_EMAIL ?? '', { delay: 40 });
    await page.click('input[placeholder="senha de acesso"]');
    await page.type('input[placeholder="senha de acesso"]', process.env.WEBDIET_PASSWORD ?? '', { delay: 40 });
    // Clica no botão "entrar"
    await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('*'))
            .find(el => el.textContent?.trim() === 'entrar');
        btn?.click();
    });
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 });
    return page;
}
// ─── Gera resumo da anamnese com IA ──────────────────────────
async function gerarResumoAnamnese(dados) {
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
    const resp = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 1000,
    });
    return resp.choices[0]?.message?.content ?? '';
}
// ─── Função principal ─────────────────────────────────────────
async function inserirPacienteWebdiet(dados) {
    const browser = await puppeteer_1.default.launch({
        headless: true,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH ?? undefined,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    try {
        const page = await loginWebdiet(browser);
        if (!page.url().includes('/painel/v4')) {
            await page.goto(WEBDIET_PAINEL_URL, { waitUntil: 'networkidle2' });
        }
        // ── 1. Abre modal "adicionar paciente" ──────────────────
        await page.waitForSelector('[placeholder="Busque pelo nome, apelido, CPF, telefone ou pela tag do paciente"]');
        await page.evaluate(() => {
            const btn = Array.from(document.querySelectorAll('*'))
                .find(el => el.textContent?.trim() === 'adicionar paciente');
            btn?.click();
        });
        await page.waitForSelector('[placeholder="Nome completo"]', { timeout: 8000 });
        // ── 2. Preenche o formulário ────────────────────────────
        await page.click('[placeholder="Nome completo"]');
        await page.type('[placeholder="Nome completo"]', dados.nome, { delay: 30 });
        if (dados.apelido) {
            await page.click('[placeholder="Apelido (opcional)"]');
            await page.type('[placeholder="Apelido (opcional)"]', dados.apelido, { delay: 30 });
        }
        if (dados.sexo) {
            await page.evaluate((sexo) => {
                const selects = document.querySelectorAll('select');
                selects.forEach(s => {
                    if (Array.from(s.options).some(o => o.value === 'F' || o.value === 'M')) {
                        s.value = sexo;
                        s.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                });
            }, dados.sexo);
        }
        if (dados.dataNascimento) {
            await page.click('[placeholder="Data de nascimento"]');
            await page.type('[placeholder="Data de nascimento"]', dados.dataNascimento, { delay: 30 });
        }
        if (dados.cpf) {
            await page.click('[placeholder="Número do CPF"]');
            await page.type('[placeholder="Número do CPF"]', dados.cpf, { delay: 30 });
        }
        if (dados.telefone) {
            const tel = dados.telefone.replace(/\D/g, '');
            await page.click('[placeholder="Celular com DDD"]');
            await page.type('[placeholder="Celular com DDD"]', tel, { delay: 30 });
        }
        if (dados.email) {
            await page.click('[placeholder="Email de contato"]');
            await page.type('[placeholder="Email de contato"]', dados.email, { delay: 30 });
        }
        if (dados.tags) {
            await page.click('[placeholder="Tags para o paciente"]');
            await page.type('[placeholder="Tags para o paciente"]', dados.tags, { delay: 30 });
        }
        // ── 3. Salva o paciente ─────────────────────────────────
        await page.evaluate(() => {
            const btn = Array.from(document.querySelectorAll('*'))
                .find(el => el.textContent?.trim() === 'cadastrar');
            btn?.click();
        });
        // Aguarda modal fechar
        await page.waitForFunction(() => !document.querySelector('[placeholder="Nome completo"]'), { timeout: 10000 });
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
                const resultados = document.querySelectorAll('.paciente-item, [data-paciente], .lista-paciente li');
                if (resultados.length > 0)
                    resultados[0].click();
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
                const links = Array.from(document.querySelectorAll('*'));
                const link = links.find(el => el.textContent?.trim() === 'Anamnese geral');
                link?.click();
            });
            await new Promise(r => setTimeout(r, 1000));
            // Clica em "nova anamnese"
            await page.evaluate(() => {
                const btns = Array.from(document.querySelectorAll('*'));
                const btn = btns.find(el => el.textContent?.trim() === 'nova anamnese');
                btn?.click();
            });
            await new Promise(r => setTimeout(r, 800));
            // Clica em "nova anamnese em branco"
            await page.evaluate(() => {
                const btns = Array.from(document.querySelectorAll('*'));
                const btn = btns.find(el => el.textContent?.trim() === 'nova anamnese em branco');
                btn?.click();
            });
            await new Promise(r => setTimeout(r, 1000));
        }
        // ── 6. Preenche o título da anamnese ────────────────────
        const hoje = new Date().toLocaleDateString('pt-BR');
        const tituloInput = await page.$('[placeholder="Título da anamnese (exemplo: Histórico familiar, histórico patológico, rotina alimentar, etc.)"]');
        if (tituloInput) {
            await tituloInput.click();
            await tituloInput.type(`Pré-Consulta — ${hoje}`, { delay: 30 });
        }
        // ── 7. Gera resumo com IA e insere no TinyMCE ──────────
        const resumoHtml = await gerarResumoAnamnese(dados);
        await page.evaluate((html) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const tmc = window.tinymce;
            if (tmc) {
                const editor = tmc.get('anamneseContent');
                if (editor)
                    editor.setContent(html);
            }
        }, resumoHtml);
        // ── 8. Salva a anamnese ─────────────────────────────────
        await new Promise(r => setTimeout(r, 500));
        await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button, [class*="salvar"], [class*="save"]'));
            const salvar = btns.find(el => el.textContent?.toLowerCase().includes('salvar') ||
                el.textContent?.toLowerCase().includes('save'));
            salvar?.click();
        });
        await new Promise(r => setTimeout(r, 1000));
        console.log(`[webdiet] Anamnese criada para: ${dados.nome}`);
        return true;
    }
    catch (err) {
        console.error('[webdiet] Erro:', err);
        return false;
    }
    finally {
        await browser.close();
    }
}
//# sourceMappingURL=webdiet.js.map