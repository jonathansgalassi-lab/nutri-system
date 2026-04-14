/**
 * Teste end-to-end com paciente fictício
 * Executa: inserirPacienteWebdiet → lancarPagamentoWebdiet
 *
 * Uso:
 *   npx tsx scripts/test-fluxo-completo.ts
 */

import dotenv from 'dotenv';
dotenv.config();

import { inserirPacienteWebdiet, lancarPagamentoWebdiet, DadosPacienteWebdiet } from '../src/integrations/webdiet';

// ─── Paciente fictício ────────────────────────────────────────

const PACIENTE_TESTE: DadosPacienteWebdiet = {
  nome: 'Ana Teste Silva',
  apelido: 'Ana Teste',
  sexo: 'F',
  dataNascimento: '15/03/1990',
  telefone: '43991620001',
  email: 'ana.teste@exemplo.com',
  tags: 'teste-automatizado',
  // Dados da pré-consulta
  peso: 72,
  altura: 165,
  objetivo: 'Emagrecimento e definição corporal',
  alergias: 'Intolerância à lactose',
  medicamentos: 'Nenhum',
  historicoFamiliar: ['diabetes', 'hipertensão'],
  praticaExercicio: '3-4x/sem',
  tipoExercicio: 'Musculação e caminhada',
  refeicoesPorDia: 5,
  alimentosQueGosta: 'Frango, arroz integral, frutas tropicais, ovos',
  alimentosQueNaoGosta: 'Brócolis, fígado',
  comeFora: '1-2x/sem',
  ondeComeFora: 'Restaurante a quilo',
  dificuldadesAlimentacao: 'Come tarde à noite após o trabalho',
  dietasAnteriores: 'Tentou low carb por 2 meses, desistiu por falta de variedade',
  expectativas: 'Perder 8kg em 3 meses de forma saudável, sem passar fome',
};

// ─── Helpers ──────────────────────────────────────────────────

function log(emoji: string, msg: string) {
  console.log(`\n${emoji}  ${msg}`);
}

function logOk(msg: string) {
  console.log(`   ✅ ${msg}`);
}

function logErr(msg: string) {
  console.error(`   ❌ ${msg}`);
}

function separador() {
  console.log('\n' + '─'.repeat(60));
}

// ─── Etapa 1: Registrar paciente completo ─────────────────────

async function etapa1_InserirPaciente(): Promise<boolean> {
  separador();
  log('🧑‍⚕️', 'ETAPA 1 — Cadastro do paciente no WebDiet');
  console.log(`   Nome: ${PACIENTE_TESTE.nome}`);
  console.log(`   Objetivo: ${PACIENTE_TESTE.objetivo}`);
  console.log(`   Histórico: ${PACIENTE_TESTE.historicoFamiliar?.join(', ')}`);
  console.log('\n   Iniciando Puppeteer... (pode levar ~30s)');

  const inicio = Date.now();
  const ok = await inserirPacienteWebdiet(PACIENTE_TESTE);
  const duracao = ((Date.now() - inicio) / 1000).toFixed(1);

  if (ok) {
    logOk(`Paciente cadastrado em ${duracao}s`);
    logOk('Anamnese gerada com IA e inserida no TinyMCE');
    logOk('Protocolo nutricional aplicado automaticamente');
  } else {
    logErr(`Falha ao cadastrar (${duracao}s)`);
  }

  return ok;
}

// ─── Etapa 2: Lançar pagamento no Financeiro ──────────────────

async function etapa2_LancarPagamento(): Promise<boolean> {
  separador();
  log('💰', 'ETAPA 2 — Lançamento financeiro no WebDiet');
  console.log('   Simulando confirmação de pagamento Asaas...');
  console.log('   Plano: Acompanhamento Anual | Valor: R$ 380,00 | Forma: PIX');

  const inicio = Date.now();
  const ok = await lancarPagamentoWebdiet({
    nomePaciente: PACIENTE_TESTE.nome,
    nomeLancamento: 'Acompanhamento Anual — Parcela 1/12',
    valor: 380.00,
    formaPagamento: 'PIX',
    categoria: 'Consulta',
    observacao: 'Asaas #pay_teste_001 — pagamento automático via sistema',
  });
  const duracao = ((Date.now() - inicio) / 1000).toFixed(1);

  if (ok) {
    logOk(`Entrada lançada no Financeiro em ${duracao}s`);
    logOk('Paciente vinculado ao lançamento');
    logOk('Categoria: Consulta | Forma: Pix');
  } else {
    logErr(`Falha ao lançar pagamento (${duracao}s)`);
  }

  return ok;
}

// ─── Main ─────────────────────────────────────────────────────

async function main() {
  console.log('\n' + '═'.repeat(60));
  console.log('  🥦  NUTRI-SYSTEM — TESTE END-TO-END');
  console.log('       Paciente fictício: Ana Teste Silva');
  console.log('═'.repeat(60));

  // Verifica credenciais
  if (!process.env.WEBDIET_EMAIL || !process.env.WEBDIET_PASSWORD) {
    console.error('\n❌ WEBDIET_EMAIL ou WEBDIET_PASSWORD não definidos no .env\n');
    process.exit(1);
  }

  const resultados: Record<string, boolean> = {};

  // Etapa 1 — Cadastro completo (paciente + anamnese + protocolo)
  resultados['Cadastro WebDiet'] = await etapa1_InserirPaciente();

  // Etapa 2 — Lançamento financeiro
  resultados['Lançamento financeiro'] = await etapa2_LancarPagamento();

  // ── Resumo final ───────────────────────────────────────────
  separador();
  log('📋', 'RESUMO DO TESTE');
  console.log();

  let passou = 0;
  let falhou = 0;
  for (const [etapa, ok] of Object.entries(resultados)) {
    if (ok) {
      logOk(etapa);
      passou++;
    } else {
      logErr(etapa);
      falhou++;
    }
  }

  console.log(`\n   ${passou}/${passou + falhou} etapas OK`);

  if (falhou === 0) {
    console.log('\n🎉 Todos os testes passaram!\n');
  } else {
    console.log(`\n⚠️  ${falhou} etapa(s) com falha. Verifique os logs acima.\n`);
  }

  process.exit(falhou > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('\n💥 Erro inesperado:', err);
  process.exit(1);
});
