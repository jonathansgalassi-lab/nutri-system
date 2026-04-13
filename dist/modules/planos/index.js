"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.planosRouter = void 0;
const express_1 = require("express");
const connection_1 = require("../../database/connection");
const openai_1 = require("../../integrations/openai");
const webdiet_1 = require("../../integrations/webdiet");
const utils_1 = require("../../shared/utils");
exports.planosRouter = (0, express_1.Router)();
// ─── Mapeamento atividade física → nível ──────────────────────
function mapearNivelAtividade(pratica) {
    if (!pratica || pratica === 'não')
        return 'sedentario';
    if (pratica === '1-2x/sem')
        return 'leve';
    if (pratica === '3-4x/sem')
        return 'moderado';
    return 'intenso';
}
// ─── POST /api/planos/gerar ───────────────────────────────────
exports.planosRouter.post('/gerar', async (req, res) => {
    const { paciente_id, avaliacao_id } = req.body;
    if (!paciente_id) {
        res.status(400).json({ error: 'paciente_id é obrigatório' });
        return;
    }
    // 1. Busca paciente
    const paciente = await (0, connection_1.queryOne)('SELECT * FROM pacientes WHERE id = $1', [paciente_id]);
    if (!paciente) {
        res.status(404).json({ error: 'Paciente não encontrado' });
        return;
    }
    // 2. Busca avaliação (a mais recente se não especificada)
    const avaliacao = avaliacao_id
        ? await (0, connection_1.queryOne)('SELECT * FROM avaliacoes WHERE id = $1', [avaliacao_id])
        : await (0, connection_1.queryOne)('SELECT * FROM avaliacoes WHERE paciente_id = $1 ORDER BY data_avaliacao DESC LIMIT 1', [paciente_id]);
    // 3. Busca formulário pré-consulta
    const form = await (0, connection_1.queryOne)('SELECT * FROM forms_preconsulta WHERE paciente_id = $1 ORDER BY created_at DESC LIMIT 1', [paciente_id]);
    if (!avaliacao && !form) {
        res.status(400).json({
            error: 'Paciente não possui avaliação ou formulário pré-consulta. Preencha ao menos um antes de gerar o plano.',
        });
        return;
    }
    // 4. Consolida dados do paciente
    const respostas = form?.respostas;
    const peso = avaliacao?.peso ?? respostas?.peso ?? 0;
    const altura = avaliacao?.altura ?? respostas?.altura ?? 0;
    const dataNasc = paciente.data_nascimento
        ? new Date(paciente.data_nascimento)
        : respostas?.data_nascimento
            ? new Date(respostas.data_nascimento)
            : null;
    const sexo = paciente.sexo ?? respostas?.sexo ?? 'F';
    const objetivo = avaliacao?.objetivo ?? respostas?.objetivo ?? 'Saúde geral';
    const praticaExercicio = respostas?.pratica_exercicio ?? 'não';
    if (!peso || !altura || !dataNasc) {
        res.status(400).json({ error: 'Dados insuficientes: peso, altura e data de nascimento são obrigatórios.' });
        return;
    }
    // 5. Cálculos nutricionais
    const idade = (0, utils_1.calcularIdade)(dataNasc);
    const imc = (0, utils_1.calcularIMC)(peso, altura);
    const nivelAtividade = mapearNivelAtividade(praticaExercicio);
    const geb = (0, utils_1.calcularGEB)(peso, altura, idade, sexo);
    const get = (0, utils_1.calcularGET)(geb, nivelAtividade);
    const metaCalorica = (0, utils_1.calcularMetaCalorica)(get, objetivo);
    const macros = (0, utils_1.calcularMacros)(metaCalorica, objetivo);
    // 6. Monta prompt para GPT-4o
    const prompt = montarPrompt({
        nome: paciente.nome,
        idade,
        sexo: sexo,
        peso,
        altura,
        imc,
        objetivo,
        nivelAtividade,
        alergias: respostas?.alergias ?? avaliacao?.notas ?? 'Nenhuma',
        medicamentos: respostas?.medicamentos ?? 'Nenhum',
        preferenciasPositivas: respostas?.alimentos_que_gosta ?? '',
        preferenciasNegativas: respostas?.alimentos_que_nao_gosta ?? '',
        comeFora: respostas?.come_fora ?? 'nunca',
        restricoes: respostas?.historico_familiar?.join(', ') ?? '',
        get,
        metaCalorica,
        proteina_alvo: macros.ptn_g,
        proteina_kg: parseFloat((macros.ptn_g / peso).toFixed(1)),
        carbo_alvo: macros.cho_g,
        gordura_alvo: macros.lip_g,
    });
    console.log(`[planos] Gerando plano para ${paciente.nome} via GPT-4o...`);
    if (!openai_1.openai) {
        res.status(503).json({ error: 'OPENAI_API_KEY não configurada. Adicione a variável de ambiente.' });
        return;
    }
    try {
        const completion = await openai_1.openai.chat.completions.create({
            model: openai_1.MODELO,
            messages: [{ role: 'user', content: prompt }],
            response_format: { type: 'json_object' },
            temperature: 0.7,
        });
        const conteudoRaw = completion.choices[0]?.message?.content ?? '{}';
        const conteudo = JSON.parse(conteudoRaw);
        // 7. Salva o plano no banco
        const [plano] = await (0, connection_1.query)(`INSERT INTO planos_alimentares (paciente_id, avaliacao_id, conteudo, status, gerado_por_ia)
       VALUES ($1, $2, $3, 'rascunho', TRUE)
       RETURNING *`, [paciente_id, avaliacao?.id ?? null, JSON.stringify(conteudo)]);
        res.status(201).json({
            plano,
            calculos: { idade, imc, geb, get, meta_calorica: metaCalorica, macros },
        });
    }
    catch (err) {
        console.error('[planos] Erro ao chamar OpenAI:', err);
        res.status(500).json({ error: 'Erro ao gerar plano com IA. Verifique a chave OpenAI.' });
    }
});
// ─── GET /api/planos/:id ──────────────────────────────────────
exports.planosRouter.get('/:id', async (req, res) => {
    const plano = await (0, connection_1.queryOne)('SELECT * FROM planos_alimentares WHERE id = $1', [req.params.id]);
    if (!plano) {
        res.status(404).json({ error: 'Plano não encontrado' });
        return;
    }
    res.json({ plano });
});
// ─── GET /api/planos — lista por paciente ─────────────────────
exports.planosRouter.get('/', async (req, res) => {
    const { paciente_id, status } = req.query;
    let sql = `SELECT pl.*, p.nome FROM planos_alimentares pl
             JOIN pacientes p ON p.id = pl.paciente_id WHERE 1=1`;
    const params = [];
    if (paciente_id) {
        sql += ` AND pl.paciente_id = $${params.length + 1}`;
        params.push(paciente_id);
    }
    if (status) {
        sql += ` AND pl.status = $${params.length + 1}`;
        params.push(status);
    }
    sql += ' ORDER BY pl.created_at DESC LIMIT 50';
    const planos = await (0, connection_1.query)(sql, params);
    res.json({ planos });
});
// ─── POST /api/planos/:id/aprovar ────────────────────────────
exports.planosRouter.post('/:id/aprovar', async (req, res) => {
    const { id } = req.params;
    const { conteudo_editado } = req.body;
    const plano = await (0, connection_1.queryOne)('SELECT * FROM planos_alimentares WHERE id = $1', [id]);
    if (!plano) {
        res.status(404).json({ error: 'Plano não encontrado' });
        return;
    }
    const conteudoFinal = conteudo_editado ?? plano.conteudo;
    const [aprovado] = await (0, connection_1.query)(`UPDATE planos_alimentares
     SET status = 'aprovado', conteudo = $1, aprovado_em = NOW()
     WHERE id = $2
     RETURNING *`, [JSON.stringify(conteudoFinal), id]);
    // Publica no Webdiet em background
    const paciente = await (0, connection_1.queryOne)('SELECT * FROM pacientes WHERE id = $1', [plano.paciente_id]);
    if (paciente) {
        (0, webdiet_1.inserirPacienteWebdiet)({
            nome: paciente.nome,
            email: paciente.email,
            sexo: paciente.sexo,
        })
            .then(async () => {
            await (0, connection_1.query)(`UPDATE planos_alimentares SET publicado_webdiet = TRUE, status = 'ativo' WHERE id = $1`, [id]);
            console.log(`[planos] Plano publicado no Webdiet: ${paciente.nome}`);
        })
            .catch((err) => {
            console.error('[planos] Erro ao publicar no Webdiet:', err.message);
        });
    }
    res.json({ plano: aprovado, mensagem: 'Plano aprovado! Publicando no Webdiet em background...' });
});
// ─── Montagem do prompt ───────────────────────────────────────
function montarPrompt(dados) {
    return `Você é um assistente especializado em nutrição clínica. Com base nos dados abaixo, gere uma sugestão de plano alimentar personalizado para o nutricionista revisar e aprovar.

DADOS DO PACIENTE:
- Nome: ${dados.nome}
- Idade: ${dados.idade} | Sexo: ${dados.sexo === 'M' ? 'Masculino' : 'Feminino'}
- Peso: ${dados.peso}kg | Altura: ${dados.altura}cm | IMC: ${dados.imc}
- Objetivo: ${dados.objetivo}
- Nível de atividade: ${dados.nivelAtividade}
- Alergias/Intolerâncias: ${dados.alergias || 'Nenhuma'}
- Medicamentos: ${dados.medicamentos || 'Nenhum'}
- Alimentos que gosta: ${dados.preferenciasPositivas || 'Não informado'}
- Alimentos que não gosta: ${dados.preferenciasNegativas || 'Nenhum'}
- Come fora: ${dados.comeFora}
- Histórico familiar: ${dados.restricoes || 'Não informado'}

CÁLCULOS JÁ REALIZADOS:
- GET: ${dados.get} kcal/dia
- Meta calórica: ${dados.metaCalorica} kcal/dia
- Proteína alvo: ${dados.proteina_alvo}g/dia (${dados.proteina_kg}g/kg)
- Carboidrato alvo: ${dados.carbo_alvo}g/dia
- Gordura alvo: ${dados.gordura_alvo}g/dia

INSTRUÇÕES:
1. Gere um plano para 4 semanas (fase de adaptação)
2. Para cada refeição, dê exatamente 3 opções rotativas
3. Inclua modo de preparo simplificado (máx. 5 passos) para cada opção
4. Garanta: proteína em todas as refeições, fibra ≥ 25g/dia, variedade de cores no prato
5. Adapte à rotina: se come fora frequentemente, inclua opções de restaurante
6. NUNCA inclua alimentos que causam alergia ou que o paciente relatou não gostar
7. Use alimentos acessíveis e comuns no Brasil
8. Retorne APENAS o JSON estruturado conforme o schema abaixo, sem texto adicional

SCHEMA JSON DE SAÍDA:
{
  "resumo": {
    "get": number,
    "meta_calorica": number,
    "macros": { "cho_g": number, "ptn_g": number, "lip_g": number }
  },
  "recomendacoes": [string],
  "alertas_nutricionista": [string],
  "plano": {
    "semana_1_4": {
      "cafe_manha": [
        {
          "nome": string,
          "ingredientes": [{ "item": string, "quantidade": string }],
          "modo_preparo": string,
          "calorias": number,
          "macros": { "cho_g": number, "ptn_g": number, "lip_g": number }
        }
      ],
      "lanche_manha": [],
      "almoco": [],
      "lanche_tarde": [],
      "jantar": [],
      "ceia": []
    }
  }
}`;
}
//# sourceMappingURL=index.js.map