"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.inserirPacienteWebdiet = inserirPacienteWebdiet;
exports.lancarPagamentoWebdiet = lancarPagamentoWebdiet;
exports.obterEstatisticasWebdiet = obterEstatisticasWebdiet;
const puppeteer_1 = __importDefault(require("puppeteer"));
const dotenv_1 = __importDefault(require("dotenv"));
const openai_1 = require("./openai");
dotenv_1.default.config();
const WEBDIET_LOGIN_URL = 'https://pt.webdiet.com.br/login/';
const WEBDIET_PAINEL_URL = 'https://pt.webdiet.com.br/painel/v4/';
const WEBDIET_FINANCEIRO_URL = 'https://pt.webdiet.com.br/painel/v4/financeiro.php';
const WEBDIET_STATS_URL = 'https://pt.webdiet.com.br/painel/v4/estatisticas.php';
const FORMA_PAGAMENTO_MAP = {
    PIX: '7', CREDIT_CARD: '3', DEBIT_CARD: '2', BOLETO: '1', TRANSFERENCIA: '6',
};
function detectChromePath() {
    if (process.env.PUPPETEER_EXECUTABLE_PATH)
        return process.env.PUPPETEER_EXECUTABLE_PATH;
    if (process.platform === 'darwin')
        return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    return '/usr/bin/chromium';
}
function getPuppeteerOptions() {
    return {
        headless: true,
        executablePath: detectChromePath(),
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
        timeout: 60000,
    };
}
// ─── Login ────────────────────────────────────────────────────
async function loginWebdiet(browser) {
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
    await page.waitForFunction(() => window.location.href.includes('/painel/v4'), { timeout: 30000, polling: 500 });
    await page.waitForSelector('[placeholder="Busque pelo nome, apelido, CPF, telefone ou pela tag do paciente"]', { timeout: 20000 });
    return page;
}
// ─── Geração de conteúdo via Gemini ──────────────────────────
async function gerarAnamnese(dados) {
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
        const resultado = await (0, openai_1.gerarTextoIA)(prompt);
        // Remove markdown code blocks se existir
        return resultado.replace(/```html?\n?/gi, '').replace(/```/g, '').trim();
    }
    catch {
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
async function gerarMetas(dados) {
    const plano = dados.planoAlimentar;
    try {
        const prompt = `Você é um nutricionista. Gere metas nutricionais claras e motivadoras em HTML para o paciente abaixo. Use <p>, <strong>, <ul>, <li>. Formato: metas de curto prazo (4 semanas), médio prazo (3 meses) e longo prazo.

Paciente: ${dados.nome} | Objetivo: ${dados.objetivo ?? '—'}
${plano ? `Meta calórica: ${plano.resumo.meta_calorica} kcal/dia | Proteína: ${plano.resumo.macros.ptn_g}g | Carbo: ${plano.resumo.macros.cho_g}g | Gordura: ${plano.resumo.macros.lip_g}g` : ''}
Exercício: ${dados.praticaExercicio ?? '—'} | Peso atual: ${dados.peso ?? '—'} kg

Retorne APENAS o HTML, sem explicações.`;
        const resultado = await (0, openai_1.gerarTextoIA)(prompt);
        return resultado.replace(/```html?\n?/gi, '').replace(/```/g, '').trim();
    }
    catch {
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
async function gerarOrientacoes(dados) {
    const plano = dados.planoAlimentar;
    try {
        const prompt = `Você é um nutricionista. Gere orientações nutricionais práticas em HTML para o paciente abaixo. Use <p>, <strong>, <ul>, <li>. Inclua: hidratação, horários das refeições, preparo dos alimentos, comportamento alimentar e dicas específicas.

Paciente: ${dados.nome} | Objetivo: ${dados.objetivo ?? '—'}
Alergias: ${dados.alergias || 'Nenhuma'} | Não gosta de: ${dados.alimentosQueNaoGosta || '—'}
Come fora: ${dados.comeFora ?? '—'} | Exercício: ${dados.praticaExercicio ?? '—'}
${plano?.recomendacoes?.length ? 'Recomendações da IA: ' + plano.recomendacoes.join('; ') : ''}

Retorne APENAS o HTML, sem explicações.`;
        const resultado = await (0, openai_1.gerarTextoIA)(prompt);
        return resultado.replace(/```html?\n?/gi, '').replace(/```/g, '').trim();
    }
    catch {
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
function formatarPlanoHtml(plano, dados) {
    const semana = plano.plano.semana_1_4;
    const nomesRefeicao = {
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
        const opcoes = semana[chave];
        if (!opcoes?.length)
            continue;
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
async function criarAnamnese(page, titulo, htmlConteudo) {
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
        btns.find(el => el.textContent?.trim() === 'nova anamnese')?.click();
    });
    await new Promise(r => setTimeout(r, 700));
    // Clica em "nova anamnese em branco"
    await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('*'));
        btns.find(el => el.textContent?.trim() === 'nova anamnese em branco')?.click();
    });
    await new Promise(r => setTimeout(r, 800));
    // Preenche título
    await page.evaluate((t) => {
        const el = document.querySelector('#tituloAnamnese')
            ?? document.querySelector('[placeholder*="Título da anamnese"]');
        if (!el)
            return;
        el.focus();
        el.value = t;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
    }, titulo);
    // Insere HTML no TinyMCE
    await page.evaluate((html) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tmc = window.tinymce;
        if (tmc) {
            const editor = tmc.get('anamneseContent') ?? tmc.activeEditor;
            if (editor)
                editor.setContent(html);
        }
    }, htmlConteudo);
    await new Promise(r => setTimeout(r, 400));
    // Salva
    await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button, [class*="salvar"]'));
        btns.find(el => el.textContent?.toLowerCase().includes('salvar'))?.click();
    });
    await new Promise(r => setTimeout(r, 800));
    console.log(`[webdiet] Anamnese criada: "${titulo}"`);
}
// ─── Helpers internos ─────────────────────────────────────────
function clicarPorTexto(page, texto, parcial = false) {
    return page.evaluate((t, p) => {
        const el = Array.from(document.querySelectorAll('*'))
            .find(e => p ? e.textContent?.toLowerCase().includes(t.toLowerCase())
            : e.textContent?.trim() === t);
        if (el) {
            el.click();
            return true;
        }
        return false;
    }, texto, parcial);
}
async function esperarEClicar(page, texto, parcial = false, timeout = 5000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
        const ok = await clicarPorTexto(page, texto, parcial);
        if (ok)
            return true;
        await new Promise(r => setTimeout(r, 300));
    }
    return false;
}
// ─── Busca paciente existente no WebDiet ──────────────────────
async function buscarEAbrirPaciente(page, nome, telefone) {
    const searchSel = '[placeholder="Busque pelo nome, apelido, CPF, telefone ou pela tag do paciente"]';
    await page.waitForSelector(searchSel, { timeout: 15000 });
    // Limpa e digita o primeiro nome
    await page.click(searchSel, { clickCount: 3 });
    await page.keyboard.press('Backspace');
    await page.type(searchSel, nome.split(' ')[0], { delay: 40 });
    await new Promise(r => setTimeout(r, 2000));
    // Verifica se apareceu algum resultado com o nome
    const achou = await page.evaluate((nomeBusca, tel) => {
        const items = Array.from(document.querySelectorAll('.pacienteItem, [class*="paciente-item"], ul li[onclick], [data-id], .listaPacientes li'));
        if (!items.length)
            return false;
        // Tenta achar pelo telefone (mais preciso)
        if (tel) {
            const telLimpo = tel.replace(/\D/g, '').slice(-8);
            const porTel = items.find(el => el.textContent?.replace(/\D/g, '').includes(telLimpo));
            if (porTel) {
                porTel.click();
                return true;
            }
        }
        // Fallback: primeiro resultado que contenha o nome
        const primeiroNome = nomeBusca.split(' ')[0].toLowerCase();
        const porNome = items.find(el => el.textContent?.toLowerCase().includes(primeiroNome));
        if (porNome) {
            porNome.click();
            return true;
        }
        items[0].click();
        return true;
    }, nome, telefone);
    if (achou) {
        // Fecha modal "nova consulta?" se aparecer
        await new Promise(r => setTimeout(r, 1500));
        await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button, *'));
            btns.find(el => el.textContent?.includes('não registrar'))?.click();
        });
        await new Promise(r => setTimeout(r, 800));
    }
    return achou;
}
// ─── Cria prescrição qualitativa com o plano da IA ───────────
// Fluxo real (mapeado via browser):
//   1. Clica "Planejamento alimentar"
//   2. Clica "nova prescrição alimentar" → modal: nome + metodologia
//   3. Preenche nome, seleciona "Qualitativa", clica "avançar"
//   4. Modal de modelo: "Criar planejamento em branco" já selecionado → "confirmar"
//   5. Navega para /metodoQualitativo.php?id=XXX
//   6. Página tem 4 slots vazios ("Clique para editar o nome")
//   7. Para cada refeição: clica no slot → preenche nome + horário → clica "nova prescrição" → digita no editor rico
//   8. Usa "+ adicionar nova refeição em branco" para slots extras (acima de 4)
//   9. Clica "salvar alterações e ver planejamento"
async function criarPrescricaoAlimentar(page, dados) {
    const plano = dados.planoAlimentar;
    if (!plano)
        return;
    const refeicoesCfg = [
        { chave: 'cafe_manha', nome: 'Café da Manhã', horario: '07:00' },
        { chave: 'lanche_manha', nome: 'Lanche da Manhã', horario: '10:00' },
        { chave: 'almoco', nome: 'Almoço', horario: '12:30' },
        { chave: 'lanche_tarde', nome: 'Lanche da Tarde', horario: '15:30' },
        { chave: 'jantar', nome: 'Jantar', horario: '19:00' },
        { chave: 'ceia', nome: 'Ceia', horario: '21:30' },
    ];
    const semana = plano.plano.semana_1_4;
    const refeicoesFiltradas = refeicoesCfg.filter(r => semana[r.chave]?.length);
    try {
        // ── 1. Abre Planejamento alimentar ──
        await esperarEClicar(page, 'Planejamento alimentar');
        await new Promise(r => setTimeout(r, 1500));
        // ── 2. Nova prescrição alimentar ──
        await esperarEClicar(page, 'nova prescrição alimentar');
        await new Promise(r => setTimeout(r, 2000));
        // ── 3. Preenche nome da prescrição no modal ──
        const nomePrescricao = `Plano IA — ${dados.nome} — ${new Date().toLocaleDateString('pt-BR')}`;
        await page.evaluate((nome) => {
            // O placeholder real é "Nome da prescrição (Ex. Cardápio semanal)"
            const input = document.querySelector('input[placeholder*="Nome da prescrição"], input[placeholder*="Cardápio"], input[placeholder*="prescrição"]');
            if (input) {
                input.focus();
                input.value = nome;
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }, nomePrescricao);
        // ── 4. Seleciona metodologia "Qualitativa" ──
        await page.evaluate(() => {
            const items = Array.from(document.querySelectorAll('*'));
            items.find(el => el.textContent?.trim() === 'Qualitativa')?.click();
        });
        await new Promise(r => setTimeout(r, 500));
        // ── 5. Avança ──
        await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button, *'));
            btns.find(el => el.textContent?.trim() === 'avançar')?.click();
        });
        await new Promise(r => setTimeout(r, 1500));
        // ── 6. "Criar planejamento em branco" já está selecionado → confirmar ──
        await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button, *'));
            btns.find(el => el.textContent?.trim() === 'confirmar')?.click();
        });
        // ── 7. Aguarda navegar para /metodoQualitativo.php ──
        await page.waitForFunction(() => window.location.href.includes('metodoQualitativo'), { timeout: 20000 });
        await new Promise(r => setTimeout(r, 2500));
        console.log(`[webdiet] Editor qualitativo carregado: ${page.url()}`);
        // ── 8. Preenche cada refeição ──
        for (let idx = 0; idx < refeicoesFiltradas.length; idx++) {
            const { chave, nome, horario } = refeicoesFiltradas[idx];
            const opcoes = semana[chave];
            // Se precisar de slot extra (já vêm 4 pré-criados), adiciona um novo
            if (idx >= 4) {
                await page.evaluate(() => {
                    const btns = Array.from(document.querySelectorAll('*'));
                    btns.find(el => el.textContent?.includes('adicionar nova refeição em branco'))?.click();
                });
                await new Promise(r => setTimeout(r, 1000));
            }
            // Clica no texto "Clique para editar o nome" do slot pelo índice
            await page.evaluate((slotIdx) => {
                const slots = Array.from(document.querySelectorAll('*'))
                    .filter(el => el.textContent?.trim() === 'Clique para editar o nome' && el.offsetWidth > 0);
                if (slots[slotIdx])
                    slots[slotIdx].click();
                else if (slots[0])
                    slots[0].click(); // fallback
            }, idx < 4 ? idx : 0);
            await new Promise(r => setTimeout(r, 600));
            // Preenche horário (input de texto "00:00")
            await page.evaluate((mealTime) => {
                const inputs = Array.from(document.querySelectorAll('input'))
                    .filter(el => el.offsetWidth > 0 && (el.value === '00:00' || el.placeholder === '00:00' || el.type === 'time'));
                const last = inputs[inputs.length - 1];
                if (last) {
                    last.focus();
                    last.value = mealTime;
                    last.dispatchEvent(new Event('input', { bubbles: true }));
                    last.dispatchEvent(new Event('change', { bubbles: true }));
                }
            }, horario);
            // Preenche nome da rotina (textbox "Nome da rotina")
            await page.evaluate((mealName) => {
                const inputs = Array.from(document.querySelectorAll('input[type="text"], input:not([type])'))
                    .filter(el => el.offsetWidth > 0 && (el.placeholder?.includes('Nome') || el.placeholder?.includes('rotina') || !el.value));
                const last = inputs[inputs.length - 1];
                if (last) {
                    last.focus();
                    // Limpa e define o valor
                    last.value = '';
                    last.dispatchEvent(new Event('input', { bubbles: true }));
                    last.value = mealName;
                    last.dispatchEvent(new Event('input', { bubbles: true }));
                    last.dispatchEvent(new Event('change', { bubbles: true }));
                }
            }, nome);
            await new Promise(r => setTimeout(r, 400));
            // ── Clica em "nova prescrição" desta refeição ──
            // O botão "nova prescrição" fica na mesma linha do slot ativo
            await page.evaluate(() => {
                const btns = Array.from(document.querySelectorAll('*'))
                    .filter(el => el.textContent?.trim() === 'nova prescrição' && el.offsetWidth > 0);
                // Clica no primeiro botão visível
                if (btns.length > 0)
                    btns[0].click();
            });
            await new Promise(r => setTimeout(r, 1500));
            // ── Monta conteúdo HTML para o editor rico ──
            const conteudoHtml = opcoes.slice(0, 3).map((op, i) => `<p><strong>Opção ${i + 1}: ${op.nome}</strong> — ${op.calorias} kcal</p>` +
                `<ul>${op.ingredientes.map(ing => `<li>${ing.item}: ${ing.quantidade}</li>`).join('')}</ul>` +
                `<p><em>PTN ${op.macros.ptn_g}g | CHO ${op.macros.cho_g}g | LIP ${op.macros.lip_g}g</em></p>`).join('<hr>');
            // ── Insere no editor rico (contenteditable) ──
            await page.evaluate((html) => {
                // Tenta contenteditable (editor rico do WebDiet)
                const editors = Array.from(document.querySelectorAll('[contenteditable="true"]'))
                    .filter(el => el.offsetWidth > 0);
                if (editors.length > 0) {
                    const ed = editors[editors.length - 1];
                    ed.focus();
                    ed.innerHTML = html;
                    ed.dispatchEvent(new Event('input', { bubbles: true }));
                    return 'contenteditable';
                }
                // Fallback: TinyMCE
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const tmc = window.tinymce;
                if (tmc?.activeEditor) {
                    tmc.activeEditor.setContent(html);
                    return 'tinymce';
                }
                return 'none';
            }, conteudoHtml);
            await new Promise(r => setTimeout(r, 500));
            // Fecha o painel do editor clicando em outro lugar
            await page.keyboard.press('Escape');
            await new Promise(r => setTimeout(r, 500));
            console.log(`[webdiet] Refeição "${nome}" preenchida (${opcoes.length} opções)`);
        }
        // ── 9. Salva ──
        await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('*'));
            btns.find(el => el.textContent?.includes('salvar alterações'))?.click();
        });
        await new Promise(r => setTimeout(r, 2500));
        console.log(`[webdiet] ✅ Prescrição qualitativa salva para: ${dados.nome}`);
    }
    catch (err) {
        console.error('[webdiet] Erro ao criar prescrição alimentar:', err);
    }
}
// ─── Função principal: inserir paciente + conteúdo completo ───
// • Se paciente já existe no WebDiet: abre perfil existente
//   - com planoAlimentar → só cria prescrição
//   - sem planoAlimentar → cria anamnese/metas/orientações
// • Se não existe: cria + anamnese + metas + orientações + (se plano) prescrição
async function inserirPacienteWebdiet(dados) {
    const browser = await puppeteer_1.default.launch(getPuppeteerOptions());
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
                const btn = Array.from(document.querySelectorAll('*'))
                    .find(el => el.textContent?.trim() === 'adicionar paciente');
                btn?.click();
            });
            await page.waitForSelector('#nomeAtalho', { visible: true, timeout: 15000 });
            await page.focus('#nomeAtalho');
            await page.keyboard.type(dados.nome, { delay: 30 });
            if (dados.sexo)
                await page.select('#generoAtalho', dados.sexo);
            if (dados.dataNascimento) {
                await page.focus('#nascimentoAtalho');
                await page.keyboard.type(dados.dataNascimento, { delay: 30 });
            }
            if (dados.cpf) {
                await page.focus('#cpfAtalho');
                await page.keyboard.type(dados.cpf, { delay: 30 });
            }
            if (dados.telefone) {
                await page.focus('#telefoneAtalho');
                await page.keyboard.type(dados.telefone.replace(/\D/g, ''), { delay: 30 });
            }
            if (dados.email) {
                await page.focus('#emailAtalho');
                await page.keyboard.type(dados.email, { delay: 30 });
            }
            if (dados.tags) {
                const tagsEl = await page.$('[placeholder="Tags para o paciente"]');
                if (tagsEl) {
                    await tagsEl.focus();
                    await page.keyboard.type(dados.tags, { delay: 30 });
                }
            }
            await page.evaluate(() => {
                Array.from(document.querySelectorAll('button, div.botao, [class*="btn"]'))
                    .find(el => el.textContent?.trim().toLowerCase() === 'cadastrar')?.click();
            });
            await page.waitForFunction(() => { const el = document.querySelector('#nomeAtalho'); return !el || el.offsetWidth === 0; }, { timeout: 10000 });
            console.log(`[webdiet] Paciente cadastrado: ${dados.nome}`);
            // Abre o perfil recém-criado
            await new Promise(r => setTimeout(r, 1500));
            pacienteJaExistia = await buscarEAbrirPaciente(page, dados.nome, dados.telefone);
        }
        else {
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
    }
    catch (err) {
        console.error('[webdiet] Erro:', err);
        return false;
    }
    finally {
        await browser.close();
    }
}
async function lancarPagamentoWebdiet(dados) {
    const browser = await puppeteer_1.default.launch(getPuppeteerOptions());
    try {
        const page = await loginWebdiet(browser);
        await page.goto(WEBDIET_FINANCEIRO_URL, { waitUntil: 'networkidle2' });
        await page.evaluate(() => {
            Array.from(document.querySelectorAll('*'))
                .find(el => el.textContent?.trim() === 'adicionar nova movimentação')?.click();
        });
        await new Promise(r => setTimeout(r, 600));
        await page.evaluate(() => {
            Array.from(document.querySelectorAll('*'))
                .find(el => el.textContent?.trim() === 'entrada')?.click();
        });
        await new Promise(r => setTimeout(r, 800));
        await page.evaluate(() => {
            (document.querySelector('#pacienteDiv')
                ?? Array.from(document.querySelectorAll('*'))
                    .find(el => el.textContent?.trim() === 'Vincular paciente'))?.click();
        });
        await page.waitForSelector('#barraBuscaPacienteAtalho', { visible: true, timeout: 8000 });
        await new Promise(r => setTimeout(r, 400));
        await page.focus('#barraBuscaPacienteAtalho');
        await page.keyboard.type(dados.nomePaciente.split(' ')[0], { delay: 40 });
        await new Promise(r => setTimeout(r, 1500));
        await page.evaluate((nome) => {
            const items = Array.from(document.querySelectorAll('.modal.show li, .listaPacientes li, li[onclick], ul li'));
            (items.find(el => el.textContent?.includes(nome.split(' ')[0])) ?? items[0])?.click();
        }, dados.nomePaciente);
        await new Promise(r => setTimeout(r, 800));
        await page.click('[name="nome"]');
        await page.type('[name="nome"]', dados.nomeLancamento, { delay: 30 });
        if (dados.categoria)
            await page.select('#categoriaAtalho', dados.categoria);
        await page.evaluate((val) => {
            const input = document.querySelector('#valor');
            if (input) {
                input.value = val;
                input.dispatchEvent(new Event('input', { bubbles: true }));
            }
        }, dados.valor.toFixed(2).replace('.', ','));
        await page.select('#forma', FORMA_PAGAMENTO_MAP[dados.formaPagamento] ?? '7');
        if (dados.cpfPaciente) {
            await page.click('[name="cpf"]');
            await page.type('[name="cpf"]', dados.cpfPaciente, { delay: 20 });
        }
        if (dados.observacao) {
            await page.click('[name="observacao"]');
            await page.type('[name="observacao"]', dados.observacao, { delay: 20 });
        }
        await page.evaluate(() => {
            Array.from(document.querySelectorAll('*'))
                .find(el => el.textContent?.trim() === 'confirmar')?.click();
        });
        await new Promise(r => setTimeout(r, 1500));
        console.log(`[webdiet] Pagamento lançado: ${dados.nomePaciente} — R$ ${dados.valor.toFixed(2)}`);
        return true;
    }
    catch (err) {
        console.error('[webdiet] Erro ao lançar pagamento:', err);
        return false;
    }
    finally {
        await browser.close();
    }
}
async function obterEstatisticasWebdiet() {
    const browser = await puppeteer_1.default.launch(getPuppeteerOptions());
    try {
        const page = await loginWebdiet(browser);
        await page.goto(WEBDIET_STATS_URL, { waitUntil: 'networkidle2' });
        await new Promise(r => setTimeout(r, 1500));
        const stats = await page.evaluate(() => {
            const totalTexto = Array.from(document.querySelectorAll('*'))
                .find(el => el.textContent?.includes('Total de consultas:'))?.textContent ?? '';
            const totalConsultas = parseInt(totalTexto.match(/Total de consultas:\s*(\d+)/)?.[1] ?? '0');
            const numeros = Array.from(document.querySelectorAll('*'))
                .filter(el => el.children.length === 0 && /^\d+$/.test(el.textContent?.trim() ?? '') && parseInt(el.textContent?.trim() ?? '0') > 0)
                .map(el => parseInt(el.textContent?.trim() ?? '0'));
            return { totalConsultas, numeros: numeros.slice(0, 10) };
        });
        const [totalPacientes = 0, totalAntropometrias = 0, totalPrescricoes = 0] = stats.numeros;
        return { totalConsultas: stats.totalConsultas, totalPacientes, totalAntropometrias, totalPrescricoes };
    }
    catch (err) {
        console.error('[webdiet] Erro ao buscar estatísticas:', err);
        return null;
    }
    finally {
        await browser.close();
    }
}
//# sourceMappingURL=webdiet.js.map