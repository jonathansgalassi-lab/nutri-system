import { Router, Request, Response } from 'express';
import { query, queryOne } from '../../database/connection';
import { openai, gemini, gerarTextoIA } from '../../integrations/openai';
import { inserirPacienteWebdiet } from '../../integrations/webdiet';
import { Paciente, Avaliacao, FormPreconsulta, PlanoAlimentar, ConteudoPlano, RespostasPreconsulta } from '../../shared/types';
import {
  calcularIdade,
  calcularIMC,
  calcularGEB,
  calcularGET,
  calcularMetaCalorica,
  calcularMacros,
  NivelAtividade,
} from '../../shared/utils';

export const planosRouter = Router();

// ─── Mapeamento atividade física → nível ──────────────────────

function mapearNivelAtividade(pratica: string): NivelAtividade {
  if (!pratica || pratica === 'não') return 'sedentario';
  if (pratica === '1-2x/sem') return 'leve';
  if (pratica === '3-4x/sem') return 'moderado';
  return 'intenso';
}

// ─── POST /api/planos/gerar ───────────────────────────────────

planosRouter.post('/gerar', async (req: Request, res: Response) => {
  const { paciente_id, avaliacao_id } = req.body as {
    paciente_id: string;
    avaliacao_id?: string;
  };

  if (!paciente_id) {
    res.status(400).json({ error: 'paciente_id é obrigatório' });
    return;
  }

  // 1. Busca paciente
  const paciente = await queryOne<Paciente>(
    'SELECT * FROM pacientes WHERE id = $1',
    [paciente_id]
  );

  if (!paciente) {
    res.status(404).json({ error: 'Paciente não encontrado' });
    return;
  }

  // 2. Busca avaliação (a mais recente se não especificada)
  const avaliacao = avaliacao_id
    ? await queryOne<Avaliacao>('SELECT * FROM avaliacoes WHERE id = $1', [avaliacao_id])
    : await queryOne<Avaliacao>(
        'SELECT * FROM avaliacoes WHERE paciente_id = $1 ORDER BY data_avaliacao DESC LIMIT 1',
        [paciente_id]
      );

  // 3. Busca formulário pré-consulta
  const form = await queryOne<FormPreconsulta>(
    'SELECT * FROM forms_preconsulta WHERE paciente_id = $1 ORDER BY created_at DESC LIMIT 1',
    [paciente_id]
  );

  if (!avaliacao && !form) {
    res.status(400).json({
      error: 'Paciente não possui avaliação ou formulário pré-consulta. Preencha ao menos um antes de gerar o plano.',
    });
    return;
  }

  // 4. Consolida dados do paciente
  const respostas = form?.respostas as RespostasPreconsulta | undefined;

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
  const idade = calcularIdade(dataNasc);
  const imc = calcularIMC(peso, altura);
  const nivelAtividade = mapearNivelAtividade(praticaExercicio);
  const geb = calcularGEB(peso, altura, idade, sexo as 'M' | 'F');
  const get = calcularGET(geb, nivelAtividade);
  const metaCalorica = calcularMetaCalorica(get, objetivo);
  const macros = calcularMacros(metaCalorica, objetivo);

  // 6. Monta prompt para IA
  const prompt = montarPrompt({
    nome: paciente.nome,
    idade,
    sexo: sexo as 'M' | 'F',
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

  console.log(`[planos] Gerando plano para ${paciente.nome} via Gemini...`);

  if (!openai && !gemini) {
    res.status(503).json({ error: 'Nenhuma chave de IA configurada. Adicione GEMINI_API_KEY (gratuito) ou OPENAI_API_KEY.' });
    return;
  }

  try {
    const conteudoRaw = await gerarTextoIA(prompt);
    const conteudo = JSON.parse(conteudoRaw) as ConteudoPlano;

    // 7. Salva o plano no banco
    const [plano] = await query<PlanoAlimentar>(
      `INSERT INTO planos_alimentares (paciente_id, avaliacao_id, conteudo, status, gerado_por_ia)
       VALUES ($1, $2, $3, 'rascunho', TRUE)
       RETURNING *`,
      [paciente_id, avaliacao?.id ?? null, JSON.stringify(conteudo)]
    );

    res.status(201).json({
      plano,
      calculos: { idade, imc, geb, get, meta_calorica: metaCalorica, macros },
    });
  } catch (err) {
    console.error('[planos] Erro ao chamar OpenAI:', err);
    res.status(500).json({ error: 'Erro ao gerar plano com IA. Verifique a chave OpenAI.' });
  }
});

// ─── GET /api/planos/:id ──────────────────────────────────────

planosRouter.get('/:id', async (req: Request, res: Response) => {
  const plano = await queryOne<PlanoAlimentar>(
    'SELECT * FROM planos_alimentares WHERE id = $1',
    [req.params.id]
  );

  if (!plano) {
    res.status(404).json({ error: 'Plano não encontrado' });
    return;
  }

  res.json({ plano });
});

// ─── GET /api/planos — lista por paciente ─────────────────────

planosRouter.get('/', async (req: Request, res: Response) => {
  const { paciente_id, status } = req.query;
  let sql = `SELECT pl.*, p.nome FROM planos_alimentares pl
             JOIN pacientes p ON p.id = pl.paciente_id WHERE 1=1`;
  const params: unknown[] = [];

  if (paciente_id) { sql += ` AND pl.paciente_id = $${params.length + 1}`; params.push(paciente_id); }
  if (status) { sql += ` AND pl.status = $${params.length + 1}`; params.push(status); }
  sql += ' ORDER BY pl.created_at DESC LIMIT 50';

  const planos = await query(sql, params);
  res.json({ planos });
});

// ─── POST /api/planos/:id/aprovar ────────────────────────────

planosRouter.post('/:id/aprovar', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { conteudo_editado } = req.body as { conteudo_editado?: ConteudoPlano };

  const plano = await queryOne<PlanoAlimentar>(
    'SELECT * FROM planos_alimentares WHERE id = $1',
    [id]
  );

  if (!plano) {
    res.status(404).json({ error: 'Plano não encontrado' });
    return;
  }

  const conteudoFinal = conteudo_editado ?? plano.conteudo;

  const [aprovado] = await query<PlanoAlimentar>(
    `UPDATE planos_alimentares
     SET status = 'aprovado', conteudo = $1, aprovado_em = NOW()
     WHERE id = $2
     RETURNING *`,
    [JSON.stringify(conteudoFinal), id]
  );

  // Publica no Webdiet em background com dados completos
  const [paciente, form] = await Promise.all([
    queryOne<Paciente>('SELECT * FROM pacientes WHERE id = $1', [plano.paciente_id]),
    queryOne<FormPreconsulta>(
      'SELECT * FROM forms_preconsulta WHERE paciente_id = $1 ORDER BY created_at DESC LIMIT 1',
      [plano.paciente_id]
    ),
  ]);

  if (paciente) {
    const respostas = form?.respostas as RespostasPreconsulta | undefined;
    const dataNasc = paciente.data_nascimento
      ? new Date(paciente.data_nascimento).toLocaleDateString('pt-BR')
      : undefined;

    inserirPacienteWebdiet({
      nome: paciente.nome,
      email: paciente.email ?? undefined,
      sexo: paciente.sexo as 'M' | 'F',
      dataNascimento: dataNasc,
      telefone: paciente.whatsapp,
      tags: respostas?.objetivo ? `objetivo: ${respostas.objetivo}` : undefined,
      // Dados da pré-consulta
      peso: respostas?.peso,
      altura: respostas?.altura,
      objetivo: respostas?.objetivo,
      alergias: respostas?.alergias,
      medicamentos: respostas?.medicamentos,
      historicoFamiliar: respostas?.historico_familiar,
      praticaExercicio: respostas?.pratica_exercicio,
      tipoExercicio: respostas?.tipo_exercicio,
      refeicoesPorDia: respostas?.refeicoes_por_dia,
      alimentosQueGosta: respostas?.alimentos_que_gosta,
      alimentosQueNaoGosta: respostas?.alimentos_que_nao_gosta,
      comeFora: respostas?.come_fora,
      ondeComeFora: respostas?.onde_come_fora,
      dificuldadesAlimentacao: respostas?.dificuldades_alimentacao,
      dietasAnteriores: respostas?.dietas_anteriores,
      expectativas: respostas?.expectativas,
      // Plano gerado pela IA
      planoAlimentar: conteudoFinal as ConteudoPlano,
    })
      .then(async () => {
        await query(
          `UPDATE planos_alimentares SET publicado_webdiet = TRUE, status = 'ativo' WHERE id = $1`,
          [id]
        );
        console.log(`[planos] Plano completo publicado no Webdiet: ${paciente.nome}`);
      })
      .catch((err: Error) => {
        console.error('[planos] Erro ao publicar no Webdiet:', err.message);
      });
  }

  res.json({ plano: aprovado, mensagem: 'Plano aprovado! Publicando no Webdiet em background...' });
});

// ─── Montagem do prompt ───────────────────────────────────────

function montarPrompt(dados: {
  nome: string; idade: number; sexo: 'M' | 'F';
  peso: number; altura: number; imc: number;
  objetivo: string; nivelAtividade: string;
  alergias: string; medicamentos: string;
  preferenciasPositivas: string; preferenciasNegativas: string;
  comeFora: string; restricoes: string;
  get: number; metaCalorica: number;
  proteina_alvo: number; proteina_kg: number;
  carbo_alvo: number; gordura_alvo: number;
}): string {
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
