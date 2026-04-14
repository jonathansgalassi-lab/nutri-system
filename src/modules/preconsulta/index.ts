import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../../database/connection';
import { Paciente, FormPreconsulta } from '../../shared/types';
import { enviarWhatsApp } from '../../integrations/twilio';
import { inserirPacienteWebdiet } from '../../integrations/webdiet';

export const preconsultaRouter = Router();

// ─── Schema de validação ─────────────────────────────────────

const SchemaPreconsulta = z.object({
  nome: z.string().min(3, 'Nome muito curto'),
  data_nascimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida (YYYY-MM-DD)'),
  sexo: z.enum(['M', 'F']),
  peso: z.number().min(20, 'Peso mínimo 20kg').max(300, 'Peso máximo 300kg'),
  altura: z.number().min(100, 'Altura mínima 100cm').max(250, 'Altura máxima 250cm'),
  objetivo: z.string().min(3),
  email: z.string().email().optional().or(z.literal('')),
  whatsapp: z.string().min(10, 'WhatsApp inválido'),
  // Hábitos alimentares
  refeicoes_por_dia: z.number().int().min(1).max(10),
  alimentos_que_gosta: z.string().optional().default(''),
  alimentos_que_nao_gosta: z.string().optional().default(''),
  come_fora: z.enum(['nunca', '1-2x/sem', '3-4x/sem', 'diariamente']),
  onde_come_fora: z.string().optional().default(''),
  // Saúde
  alergias: z.string().optional().default(''),
  medicamentos: z.string().optional().default(''),
  historico_familiar: z.array(z.string()).optional().default([]),
  pratica_exercicio: z.enum(['não', '1-2x/sem', '3-4x/sem', '5+/sem']),
  tipo_exercicio: z.string().optional().default(''),
  // Contexto
  dificuldades_alimentacao: z.string().optional().default(''),
  dietas_anteriores: z.string().optional().default(''),
  expectativas: z.string().optional().default(''),
});

type DadosPreconsulta = z.infer<typeof SchemaPreconsulta>;

// ─── POST /api/forms/preconsulta ─────────────────────────────

preconsultaRouter.post('/', async (req: Request, res: Response) => {
  const resultado = SchemaPreconsulta.safeParse(req.body);

  if (!resultado.success) {
    res.status(400).json({
      error: 'Dados inválidos',
      detalhes: resultado.error.flatten().fieldErrors,
    });
    return;
  }

  const dados = resultado.data;

  try {
    // 1. Busca ou cria paciente
    let paciente = await queryOne<Paciente>(
      'SELECT * FROM pacientes WHERE whatsapp = $1',
      [dados.whatsapp]
    );

    if (!paciente) {
      [paciente] = await query<Paciente>(
        `INSERT INTO pacientes (nome, email, whatsapp, data_nascimento, sexo)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [
          dados.nome,
          dados.email || null,
          dados.whatsapp,
          dados.data_nascimento,
          dados.sexo,
        ]
      );
    }

    // 2. Salva o formulário
    const respostas = {
      nome: dados.nome,
      data_nascimento: dados.data_nascimento,
      sexo: dados.sexo,
      peso: dados.peso,
      altura: dados.altura,
      objetivo: dados.objetivo,
      refeicoes_por_dia: dados.refeicoes_por_dia,
      alimentos_que_gosta: dados.alimentos_que_gosta,
      alimentos_que_nao_gosta: dados.alimentos_que_nao_gosta,
      come_fora: dados.come_fora,
      onde_come_fora: dados.onde_come_fora,
      alergias: dados.alergias,
      medicamentos: dados.medicamentos,
      historico_familiar: dados.historico_familiar,
      pratica_exercicio: dados.pratica_exercicio,
      tipo_exercicio: dados.tipo_exercicio,
      dificuldades_alimentacao: dados.dificuldades_alimentacao,
      dietas_anteriores: dados.dietas_anteriores,
      expectativas: dados.expectativas,
    };

    const [form] = await query<FormPreconsulta>(
      `INSERT INTO forms_preconsulta (paciente_id, respostas, status)
       VALUES ($1, $2, 'pendente')
       RETURNING *`,
      [paciente!.id, JSON.stringify(respostas)]
    );

    // 3. Notifica a nutricionista via WhatsApp
    await notificarNutricionista(dados, paciente!.id);

    // 4. Confirma para o paciente
    await enviarWhatsApp(
      dados.whatsapp,
      `✅ Formulário recebido com sucesso, ${dados.nome.split(' ')[0]}!

Sua nutricionista já vai ter acesso a todas as informações antes da consulta. Você vai ser atendido(a) de forma muito mais personalizada! 🎯

Até logo! 😊`
    );

    // 5. Tenta inserir no Webdiet em background (não bloqueia a resposta)
    inserirPacienteWebdiet({
      nome: dados.nome,
      email: dados.email,
      dataNascimento: dados.data_nascimento,
      sexo: dados.sexo,
      telefone: dados.whatsapp,
      tags: dados.objetivo ? `objetivo: ${dados.objetivo}` : undefined,
    })
      .then(async () => {
        await query(
          `UPDATE forms_preconsulta SET inserido_webdiet = TRUE, status = 'processado' WHERE id = $1`,
          [form.id]
        );
      })
      .catch((err: Error) => {
        console.error('[preconsulta] Erro ao inserir no Webdiet:', err.message);
      });

    res.status(201).json({ success: true, paciente_id: paciente!.id });
  } catch (err) {
    console.error('[preconsulta] Erro:', err);
    res.status(500).json({ error: 'Erro interno ao processar formulário' });
  }
});

// ─── GET /api/forms/preconsulta — lista para o painel ────────

preconsultaRouter.get('/', async (_req: Request, res: Response) => {
  const forms = await query(
    `SELECT f.*, p.nome, p.whatsapp
     FROM forms_preconsulta f
     JOIN pacientes p ON p.id = f.paciente_id
     ORDER BY f.created_at DESC
     LIMIT 50`
  );
  res.json({ forms });
});

// ─── Helper: notificação para a nutricionista ────────────────

async function notificarNutricionista(dados: DadosPreconsulta, pacienteId: string) {
  const nutriWpp = process.env.NUTRICIONISTA_WHATSAPP;
  if (!nutriWpp) return;

  const baseUrl = process.env.BASE_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;
  const linkAdmin = `${baseUrl}/admin/pacientes/${pacienteId}`;

  const alertas: string[] = [];
  if (dados.alergias) alertas.push(`🚨 Alergia: ${dados.alergias}`);
  if (dados.medicamentos) alertas.push(`💊 Medicamentos: ${dados.medicamentos}`);

  const mensagem =
    `✅ *NOVO PACIENTE PRÉ-CADASTRADO*\n\n` +
    `📌 Nome: ${dados.nome}\n` +
    `🎯 Objetivo: ${dados.objetivo}\n` +
    `⚖️ ${dados.peso}kg | ${dados.altura}cm\n` +
    `📱 WhatsApp: ${dados.whatsapp}\n` +
    (alertas.length ? `\n⚠️ Atenção:\n${alertas.join('\n')}\n` : '') +
    `\n📋 Ver formulário completo: ${linkAdmin}`;

  await enviarWhatsApp(nutriWpp, mensagem);
}
