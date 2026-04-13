export interface Paciente {
  id: string;
  nome: string;
  email?: string;
  whatsapp: string;
  data_nascimento?: Date;
  sexo?: 'M' | 'F';
  status: 'ativo' | 'inativo' | 'suspenso';
  created_at: Date;
}

export interface Avaliacao {
  id: string;
  paciente_id: string;
  data_avaliacao: Date;
  peso?: number;
  altura?: number;
  imc?: number;
  circunferencia_abdominal?: number;
  percentual_gordura?: number;
  massa_muscular?: number;
  objetivo?: string;
  notas?: string;
  created_at: Date;
}

export interface FormPreconsulta {
  id: string;
  paciente_id: string;
  respostas: RespostasPreconsulta;
  status: 'pendente' | 'processado' | 'erro';
  inserido_webdiet: boolean;
  created_at: Date;
}

export interface RespostasPreconsulta {
  // Dados básicos
  nome: string;
  data_nascimento: string;
  sexo: 'M' | 'F';
  peso: number;
  altura: number;
  objetivo: string;
  // Hábitos alimentares
  refeicoes_por_dia: number;
  alimentos_que_gosta: string;
  alimentos_que_nao_gosta: string;
  come_fora: 'nunca' | '1-2x/sem' | '3-4x/sem' | 'diariamente';
  onde_come_fora?: string;
  // Saúde
  alergias?: string;
  medicamentos?: string;
  historico_familiar: string[];
  pratica_exercicio: 'não' | '1-2x/sem' | '3-4x/sem' | '5+/sem';
  tipo_exercicio?: string;
  // Contexto
  dificuldades_alimentacao?: string;
  dietas_anteriores?: string;
  expectativas?: string;
}

export interface PlanoAlimentar {
  id: string;
  paciente_id: string;
  avaliacao_id?: string;
  conteudo: ConteudoPlano;
  status: 'rascunho' | 'aprovado' | 'ativo';
  gerado_por_ia: boolean;
  aprovado_em?: Date;
  publicado_webdiet: boolean;
  created_at: Date;
}

export interface ConteudoPlano {
  resumo: {
    get: number;
    meta_calorica: number;
    macros: { cho_g: number; ptn_g: number; lip_g: number };
  };
  recomendacoes: string[];
  alertas_nutricionista: string[];
  plano: {
    semana_1_4: RefeicoesDia;
  };
}

export interface RefeicoesDia {
  cafe_manha: OpcaoRefeicao[];
  lanche_manha: OpcaoRefeicao[];
  almoco: OpcaoRefeicao[];
  lanche_tarde: OpcaoRefeicao[];
  jantar: OpcaoRefeicao[];
  ceia: OpcaoRefeicao[];
}

export interface OpcaoRefeicao {
  nome: string;
  ingredientes: { item: string; quantidade: string }[];
  modo_preparo: string;
  calorias: number;
  macros: { cho_g: number; ptn_g: number; lip_g: number };
}

export interface Checkin {
  id: string;
  paciente_id: string;
  semana_numero: number;
  score_aderencia: 1 | 2 | 3 | 4 | 5;
  dificuldades?: string;
  ajustes_solicitados?: string;
  respondido_em?: Date;
  created_at: Date;
}

export interface Consulta {
  id: string;
  paciente_id: string;
  data_hora: Date;
  tipo: 'inicial' | 'reavaliacao' | 'online' | 'presencial';
  local?: string;
  google_event_id?: string;
  status: 'agendada' | 'confirmada' | 'realizada' | 'cancelada';
  notas?: string;
  created_at: Date;
}

export interface Contrato {
  id: string;
  paciente_id: string;
  plano: 'inicial' | 'acompanhamento' | 'premium';
  valor: number;
  data_inicio: Date;
  data_fim: Date;
  forma_pagamento: string;
  status: 'ativo' | 'expirado' | 'cancelado';
  created_at: Date;
}

export interface Pagamento {
  id: string;
  contrato_id: string;
  valor: number;
  data_pagamento?: Date;
  forma_pagamento: string;
  referencia_externa?: string;
  status: 'pago' | 'pendente' | 'cancelado';
}

export interface ConversaBot {
  id: string;
  whatsapp: string;
  paciente_id?: string;
  estado_atual: EstadoBot;
  contexto: ContextoBot;
  ultima_mensagem: Date;
  created_at: Date;
}

export type EstadoBot =
  | 'RECEPCAO'
  | 'QUALIFICACAO'
  | 'APRESENTACAO_PLANOS'
  | 'AGENDAMENTO'
  | 'FORMS_PRECONSULTA';

export interface ContextoBot {
  objetivo?: string;
  plano_interesse?: string;
  alergias?: string[];
  formato_preferido?: 'online' | 'presencial';
  [key: string]: unknown;
}
