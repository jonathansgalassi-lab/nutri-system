import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

export const MODELO = process.env.OPENAI_MODEL ?? 'gpt-4o';

// Instancia apenas se a chave estiver presente
export const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

if (!process.env.OPENAI_API_KEY) {
  console.warn('[openai] OPENAI_API_KEY não configurada. Geração de planos desabilitada.');
}
