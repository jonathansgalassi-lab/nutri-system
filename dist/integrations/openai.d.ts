import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
export declare const MODELO: string;
export declare const openai: OpenAI | null;
export declare const GEMINI_MODELO: string;
export declare const gemini: GoogleGenerativeAI | null;
/**
 * Gera texto com o provedor disponível.
 * Prioridade: OpenAI → Gemini
 */
export declare function gerarTextoIA(prompt: string): Promise<string>;
//# sourceMappingURL=openai.d.ts.map