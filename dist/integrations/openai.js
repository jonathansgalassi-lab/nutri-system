"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.gemini = exports.GEMINI_MODELO = exports.openai = exports.MODELO = void 0;
exports.gerarTextoIA = gerarTextoIA;
const openai_1 = __importDefault(require("openai"));
const generative_ai_1 = require("@google/generative-ai");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
// ── OpenAI (legado — usado apenas se configurado) ──────────────
exports.MODELO = process.env.OPENAI_MODEL ?? 'gpt-4o';
exports.openai = process.env.OPENAI_API_KEY
    ? new openai_1.default({ apiKey: process.env.OPENAI_API_KEY })
    : null;
// ── Google Gemini (gratuito via AI Studio) ─────────────────────
exports.GEMINI_MODELO = process.env.GEMINI_MODEL ?? 'gemini-1.5-flash';
exports.gemini = process.env.GEMINI_API_KEY
    ? new generative_ai_1.GoogleGenerativeAI(process.env.GEMINI_API_KEY)
    : null;
if (!exports.openai && !exports.gemini) {
    console.warn('[ia] Nenhuma chave de IA configurada (OPENAI_API_KEY ou GEMINI_API_KEY). Geração de planos desabilitada.');
}
else if (exports.gemini && !exports.openai) {
    console.log('[ia] Usando Google Gemini como provedor de IA.');
}
else if (exports.openai) {
    console.log('[ia] Usando OpenAI como provedor de IA.');
}
/**
 * Gera texto com o provedor disponível.
 * Prioridade: OpenAI → Gemini
 */
async function gerarTextoIA(prompt) {
    // Tenta OpenAI primeiro
    if (exports.openai) {
        const completion = await exports.openai.chat.completions.create({
            model: exports.MODELO,
            messages: [{ role: 'user', content: prompt }],
            response_format: { type: 'json_object' },
            temperature: 0.7,
        });
        return completion.choices[0]?.message?.content ?? '{}';
    }
    // Fallback para Gemini
    if (exports.gemini) {
        const model = exports.gemini.getGenerativeModel({ model: exports.GEMINI_MODELO });
        const result = await model.generateContent(prompt);
        const text = result.response.text();
        // Extrai JSON do texto (Gemini pode incluir markdown ```json ... ```)
        const match = text.match(/```json\s*([\s\S]*?)```/) ?? text.match(/(\{[\s\S]*\})/);
        return match ? match[1].trim() : text.trim();
    }
    throw new Error('Nenhum provedor de IA configurado. Adicione GEMINI_API_KEY ou OPENAI_API_KEY.');
}
//# sourceMappingURL=openai.js.map