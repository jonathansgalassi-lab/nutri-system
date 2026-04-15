import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config();

// ── OpenAI (legado — usado apenas se configurado) ──────────────
export const MODELO = process.env.OPENAI_MODEL ?? 'gpt-4o';

export const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

// ── Google Gemini (gratuito via AI Studio) ─────────────────────
export const GEMINI_MODELO = process.env.GEMINI_MODEL ?? 'gemini-1.5-flash';

export const gemini = process.env.GEMINI_API_KEY
  ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  : null;

if (!openai && !gemini) {
  console.warn('[ia] Nenhuma chave de IA configurada (OPENAI_API_KEY ou GEMINI_API_KEY). Geração de planos desabilitada.');
} else if (gemini && !openai) {
  console.log('[ia] Usando Google Gemini como provedor de IA.');
} else if (openai) {
  console.log('[ia] Usando OpenAI como provedor de IA.');
}

/**
 * Gera texto com o provedor disponível.
 * Prioridade: OpenAI → Gemini
 */
export async function gerarTextoIA(prompt: string): Promise<string> {
  // Tenta OpenAI primeiro
  if (openai) {
    const completion = await openai.chat.completions.create({
      model: MODELO,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.7,
    });
    return completion.choices[0]?.message?.content ?? '{}';
  }

  // Fallback para Gemini
  if (gemini) {
    const model = gemini.getGenerativeModel({ model: GEMINI_MODELO });
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    // Extrai JSON do texto (Gemini pode incluir markdown ```json ... ```)
    const match = text.match(/```json\s*([\s\S]*?)```/) ?? text.match(/(\{[\s\S]*\})/);
    return match ? match[1].trim() : text.trim();
  }

  throw new Error('Nenhum provedor de IA configurado. Adicione GEMINI_API_KEY ou OPENAI_API_KEY.');
}
