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
// ─── Cria prescrição alimentar estruturada com o plano da IA ──
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
    try {
        // 1. Abre Planejamento alimentar
        await esperarEClicar(page, 'Planejamento alimentar');
        await new Promise(r => setTimeout(r, 1500));
        // 2. Nova prescrição alimentar
        await esperarEClicar(page, 'nova prescrição alimentar');
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => { });
        await new Promise(r => setTimeout(r, 2000));
        // 3. Escolhe "em branco" (não usa protocolo modelo)
        const escolheuEmBranco = await esperarEClicar(page, 'em branco', false, 4000)
            || await esperarEClicar(page, 'prescrição em branco', true, 2000)
            || await esperarEClicar(page, 'branco', true, 2000);
        if (!escolheuEmBranco) {
            // Se não achou o botão "em branco", tenta confirmar o que estiver aberto
            console.log('[webdiet] Botão "em branco" não encontrado, tentando continuar...');
            await esperarEClicar(page, 'confirmar', false, 3000);
        }
        await new Promise(r => setTimeout(r, 2000));
        // 4. Nomeia a prescrição
        const nomePrescricao = `Plano IA — ${dados.nome} — ${new Date().toLocaleDateString('pt-BR')}`;
        const nomePosto = await page.evaluate((nome) => {
            const campos = ['#nomePrescricao', '#tituloPrescricao', '[name="nome"]', '[placeholder*="nome"]', '[placeholder*="título"]'];
            for (const sel of campos) {
                const el = document.querySelector(sel);
                if (el) {
                    el.focus();
                    el.value = nome;
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                    return true;
                }
            }
            return false;
        }, nomePrescricao);
        if (nomePosto)
            console.log(`[webdiet] Nome da prescrição preenchido: "${nomePrescricao}"`);
        // 5. Meta calórica global (se tiver campo)
        await page.evaluate((kcal) => {
            const sels = ['#caloriasTotal', '#totalCalorias', '[name="calorias"]', '[placeholder*="caloria"]', '[placeholder*="kcal"]'];
            for (const sel of sels) {
                const el = document.querySelector(sel);
                if (el) {
                    el.value = String(kcal);
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    return;
                }
            }
        }, plano.resumo.meta_calorica);
        // 6. Insere cada refeição
        for (const { chave, nome, horario } of refeicoesCfg) {
            const opcoes = semana[chave];
            if (!opcoes?.length)
                continue;
            // 6a. Clica em "adicionar refeição"
            const adicionou = await esperarEClicar(page, 'adicionar refeição', false, 3000)
                || await esperarEClicar(page, 'nova refeição', true, 2000)
                || await esperarEClicar(page, 'adicionar refeição', true, 2000);
            if (!adicionou) {
                console.log(`[webdiet] Botão "adicionar refeição" não encontrado para: ${nome}`);
                continue;
            }
            await new Promise(r => setTimeout(r, 1000));
            // 6b. Preenche nome e horário da refeição (último input adicionado)
            await page.evaluate((mealName, mealTime) => {
                // Nome da refeição — pega o último input de texto vazio
                const allInputs = Array.from(document.querySelectorAll('input[type="text"]:not([readonly]), input:not([type]):not([readonly])'));
                const emptyInputs = allInputs.filter(i => !i.value);
                const nomeInput = emptyInputs[emptyInputs.length - 1];
                if (nomeInput) {
                    nomeInput.focus();
                    nomeInput.value = mealName;
                    nomeInput.dispatchEvent(new Event('input', { bubbles: true }));
                    nomeInput.dispatchEvent(new Event('change', { bubbles: true }));
                }
                // Horário — pega o último input de time vazio
                const timeInputs = Array.from(document.querySelectorAll('input[type="time"]'));
                const lastTime = timeInputs[timeInputs.length - 1];
                if (lastTime) {
                    lastTime.value = mealTime;
                    lastTime.dispatchEvent(new Event('input', { bubbles: true }));
                    lastTime.dispatchEvent(new Event('change', { bubbles: true }));
                }
            }, nome, horario);
            await new Promise(r => setTimeout(r, 400));
            // 6c. Insere cada opção da refeição
            for (let i = 0; i < Math.min(opcoes.length, 3); i++) {
                const opcao = opcoes[i];
                // Tenta clicar em "adicionar opção" ou "nova opção"
                await esperarEClicar(page, 'adicionar opção', false, 2000)
                    || await esperarEClicar(page, 'nova opção', true, 1500)
                    || await esperarEClicar(page, 'adicionar alimento', true, 1500);
                await new Promise(r => setTimeout(r, 500));
                // Monta texto da opção
                const textoOpcao = `${opcao.nome}\n` +
                    opcao.ingredientes.map(ing => `${ing.item}: ${ing.quantidade}`).join('\n') +
                    `\n(${opcao.calorias} kcal | PTN ${opcao.macros.ptn_g}g | CHO ${opcao.macros.cho_g}g | LIP ${opcao.macros.lip_g}g)`;
                // Tenta preencher via TinyMCE, textarea ou input
                await page.evaluate((texto) => {
                    // TinyMCE (editor rico)
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const tmc = window.tinymce;
                    if (tmc?.activeEditor) {
                        tmc.activeEditor.setContent(texto.replace(/\n/g, '<br>'));
                        return;
                    }
                    // Último textarea vazio
                    const tas = Array.from(document.querySelectorAll('textarea'));
                    const lastTa = tas.filter(t => !t.value)[tas.length - 1] ?? tas[tas.length - 1];
                    if (lastTa) {
                        lastTa.focus();
                        lastTa.value = texto;
                        lastTa.dispatchEvent(new Event('input', { bubbles: true }));
                        return;
                    }
                    // Último input de texto vazio
                    const inputs = Array.from(document.querySelectorAll('input[type="text"]:not([readonly])'));
                    const lastInput = inputs.filter(i => !i.value)[inputs.length - 1];
                    if (lastInput) {
                        lastInput.focus();
                        lastInput.value = texto;
                        lastInput.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                }, textoOpcao);
                await new Promise(r => setTimeout(r, 300));
            }
            console.log(`[webdiet] Refeição "${nome}" inserida com ${Math.min(opcoes.length, 3)} opções`);
            await new Promise(r => setTimeout(r, 300));
        }
        // 7. Adiciona orientações / observações gerais
        if (plano.recomendacoes?.length || plano.alertas_nutricionista?.length) {
            const textoObs = [
                plano.recomendacoes?.length ? '📌 RECOMENDAÇÕES:\n' + plano.recomendacoes.map(r => `• ${r}`).join('\n') : '',
                plano.alertas_nutricionista?.length ? '\n⚠️ ALERTAS PARA O NUTRICIONISTA:\n' + plano.alertas_nutricionista.map(a => `• ${a}`).join('\n') : '',
            ].filter(Boolean).join('\n');
            await page.evaluate((obs) => {
                const sels = ['[name="observacoes"]', '[name="orientacoes"]', '[placeholder*="observa"]', '[placeholder*="orienta"]'];
                for (const sel of sels) {
                    const el = document.querySelector(sel);
                    if (el) {
                        el.value = obs;
                        el.dispatchEvent(new Event('input', { bubbles: true }));
                        return;
                    }
                }
                // TinyMCE de observações (editor que não é o ativo)
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const tmc = window.tinymce;
                if (tmc?.editors?.length) {
                    tmc.editors[tmc.editors.length - 1].setContent(obs.replace(/\n/g, '<br>'));
                }
            }, textoObs);
            await new Promise(r => setTimeout(r, 300));
        }
        // 8. Salva a prescrição
        const salvou = await esperarEClicar(page, 'salvar', true, 3000);
        if (!salvou)
            await esperarEClicar(page, 'confirmar', false, 3000);
        await new Promise(r => setTimeout(r, 2000));
        console.log(`[webdiet] Prescrição alimentar criada para: ${dados.nome}`);
    }
    catch (err) {
        console.error('[webdiet] Erro ao criar prescrição alimentar:', err);
    }
}
// ─── Função principal: inserir paciente + conteúdo completo ───
async function inserirPacienteWebdiet(dados) {
    const browser = await puppeteer_1.default.launch(getPuppeteerOptions());
    try {
        const page = await loginWebdiet(browser);
        if (!page.url().includes('/painel/v4')) {
            await page.goto(WEBDIET_PAINEL_URL, { waitUntil: 'networkidle2' });
        }
        // ── 1. Cria o paciente ──────────────────────────────────
        await page.waitForSelector('[placeholder="Busque pelo nome, apelido, CPF, telefone ou pela tag do paciente"]');
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
            const btn = Array.from(document.querySelectorAll('button, div.botao, [class*="btn"]'))
                .find(el => el.textContent?.trim().toLowerCase() === 'cadastrar');
            btn?.click();
        });
        await page.waitForFunction(() => { const el = document.querySelector('#nomeAtalho'); return !el || el.offsetWidth === 0; }, { timeout: 10000 });
        console.log(`[webdiet] Paciente cadastrado: ${dados.nome}`);
        // ── 2. Abre o perfil do paciente ────────────────────────
        await new Promise(r => setTimeout(r, 1500));
        const searchInput = await page.$('[placeholder="Busque pelo nome, apelido, CPF, telefone ou pela tag do paciente"]');
        if (searchInput) {
            await searchInput.click();
            await searchInput.type(dados.nome.split(' ')[0], { delay: 40 });
            await new Promise(r => setTimeout(r, 1500));
            await page.evaluate(() => {
                const resultados = document.querySelectorAll('.paciente-item, [data-paciente], .lista-paciente li');
                if (resultados.length > 0)
                    resultados[0].click();
            });
            await page.waitForSelector('[placeholder*="Título da anamnese"]', { timeout: 10000 }).catch(() => { });
        }
        // ── 3. Gera conteúdo via Gemini (em paralelo) ──────────
        console.log(`[webdiet] Gerando conteúdo com IA para: ${dados.nome}`);
        const [htmlAnamnese, htmlMetas, htmlOrientacoes] = await Promise.all([
            gerarAnamnese(dados),
            gerarMetas(dados),
            gerarOrientacoes(dados),
        ]);
        const hoje = new Date().toLocaleDateString('pt-BR');
        // ── 4. Cria anamnese de pré-consulta ────────────────────
        await criarAnamnese(page, `Pré-Consulta — ${hoje}`, htmlAnamnese);
        // ── 5. Cria metas ───────────────────────────────────────
        await criarAnamnese(page, `Metas e Objetivos — ${hoje}`, htmlMetas);
        // ── 6. Cria orientações ─────────────────────────────────
        await criarAnamnese(page, `Orientações Nutricionais — ${hoje}`, htmlOrientacoes);
        // ── 7. Cria prescrição alimentar estruturada com plano da IA ──
        if (dados.planoAlimentar) {
            await criarPrescricaoAlimentar(page, dados);
        }
        console.log(`[webdiet] Inserção completa para: ${dados.nome}`);
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