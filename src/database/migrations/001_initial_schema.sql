-- Migration: 001_initial_schema
-- Created: 2026-04-12
-- Description: Schema inicial do sistema nutricional

-- Tabela de controle de migrations
CREATE TABLE IF NOT EXISTS migrations (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  executed_at TIMESTAMP DEFAULT NOW()
);

-- Extensões
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Pacientes
CREATE TABLE IF NOT EXISTS pacientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome VARCHAR(200) NOT NULL,
  email VARCHAR(200) UNIQUE,
  whatsapp VARCHAR(20) NOT NULL UNIQUE,
  data_nascimento DATE,
  sexo CHAR(1),
  status VARCHAR(20) DEFAULT 'ativo',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Avaliações antropométricas
CREATE TABLE IF NOT EXISTS avaliacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id UUID REFERENCES pacientes(id) ON DELETE CASCADE,
  data_avaliacao DATE NOT NULL,
  peso DECIMAL(5,2),
  altura DECIMAL(5,2),
  imc DECIMAL(4,2),
  circunferencia_abdominal DECIMAL(5,2),
  percentual_gordura DECIMAL(4,2),
  massa_muscular DECIMAL(5,2),
  objetivo VARCHAR(100),
  notas TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Formulários pré-consulta
CREATE TABLE IF NOT EXISTS forms_preconsulta (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id UUID REFERENCES pacientes(id) ON DELETE CASCADE,
  respostas JSONB NOT NULL,
  status VARCHAR(20) DEFAULT 'pendente',
  inserido_webdiet BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Planos alimentares
CREATE TABLE IF NOT EXISTS planos_alimentares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id UUID REFERENCES pacientes(id) ON DELETE CASCADE,
  avaliacao_id UUID REFERENCES avaliacoes(id),
  conteudo JSONB NOT NULL,
  status VARCHAR(20) DEFAULT 'rascunho',
  gerado_por_ia BOOLEAN DEFAULT TRUE,
  aprovado_em TIMESTAMP,
  publicado_webdiet BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Check-ins semanais
CREATE TABLE IF NOT EXISTS checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id UUID REFERENCES pacientes(id) ON DELETE CASCADE,
  semana_numero INTEGER,
  score_aderencia INTEGER CHECK (score_aderencia BETWEEN 1 AND 5),
  dificuldades TEXT,
  ajustes_solicitados TEXT,
  respondido_em TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Consultas agendadas
CREATE TABLE IF NOT EXISTS consultas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id UUID REFERENCES pacientes(id) ON DELETE CASCADE,
  data_hora TIMESTAMP NOT NULL,
  tipo VARCHAR(50),
  local VARCHAR(200),
  google_event_id VARCHAR(200),
  status VARCHAR(20) DEFAULT 'agendada',
  notas TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Contratos
CREATE TABLE IF NOT EXISTS contratos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id UUID REFERENCES pacientes(id) ON DELETE CASCADE,
  plano VARCHAR(50),
  valor DECIMAL(10,2),
  data_inicio DATE,
  data_fim DATE,
  forma_pagamento VARCHAR(20),
  status VARCHAR(20),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Pagamentos
CREATE TABLE IF NOT EXISTS pagamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id UUID REFERENCES contratos(id) ON DELETE CASCADE,
  valor DECIMAL(10,2),
  data_pagamento DATE,
  forma_pagamento VARCHAR(20),
  referencia_externa VARCHAR(100),
  status VARCHAR(20)
);

-- Conversas do chatbot
CREATE TABLE IF NOT EXISTS conversas_bot (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  whatsapp VARCHAR(20) NOT NULL,
  paciente_id UUID REFERENCES pacientes(id),
  estado_atual VARCHAR(50),
  contexto JSONB,
  ultima_mensagem TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_pacientes_whatsapp ON pacientes(whatsapp);
CREATE INDEX IF NOT EXISTS idx_pacientes_status ON pacientes(status);
CREATE INDEX IF NOT EXISTS idx_avaliacoes_paciente ON avaliacoes(paciente_id);
CREATE INDEX IF NOT EXISTS idx_planos_paciente ON planos_alimentares(paciente_id);
CREATE INDEX IF NOT EXISTS idx_planos_status ON planos_alimentares(status);
CREATE INDEX IF NOT EXISTS idx_checkins_paciente ON checkins(paciente_id);
CREATE INDEX IF NOT EXISTS idx_consultas_paciente ON consultas(paciente_id);
CREATE INDEX IF NOT EXISTS idx_consultas_data ON consultas(data_hora);
CREATE INDEX IF NOT EXISTS idx_consultas_status ON consultas(status);
CREATE INDEX IF NOT EXISTS idx_contratos_paciente ON contratos(paciente_id);
CREATE INDEX IF NOT EXISTS idx_contratos_data_fim ON contratos(data_fim);
CREATE INDEX IF NOT EXISTS idx_contratos_status ON contratos(status);
CREATE INDEX IF NOT EXISTS idx_conversas_whatsapp ON conversas_bot(whatsapp);

INSERT INTO migrations (name) VALUES ('001_initial_schema');
