"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.openai = exports.MODELO = void 0;
const openai_1 = __importDefault(require("openai"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
exports.MODELO = process.env.OPENAI_MODEL ?? 'gpt-4o';
// Instancia apenas se a chave estiver presente
exports.openai = process.env.OPENAI_API_KEY
    ? new openai_1.default({ apiKey: process.env.OPENAI_API_KEY })
    : null;
if (!process.env.OPENAI_API_KEY) {
    console.warn('[openai] OPENAI_API_KEY não configurada. Geração de planos desabilitada.');
}
//# sourceMappingURL=openai.js.map