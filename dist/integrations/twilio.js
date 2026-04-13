"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.twilioClient = void 0;
exports.enviarWhatsApp = enviarWhatsApp;
const twilio_1 = __importDefault(require("twilio"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_WHATSAPP_NUMBER ?? 'whatsapp:+55XXXXXXXXXXX';
if (!accountSid || !authToken) {
    console.warn('Credenciais Twilio não configuradas. WhatsApp desabilitado.');
}
exports.twilioClient = accountSid && authToken
    ? (0, twilio_1.default)(accountSid, authToken)
    : null;
async function enviarWhatsApp(para, mensagem) {
    if (!exports.twilioClient) {
        console.log(`[WhatsApp MOCK] Para: ${para}\n${mensagem}`);
        return;
    }
    const numero = para.startsWith('whatsapp:') ? para : `whatsapp:${para}`;
    await exports.twilioClient.messages.create({
        from: fromNumber,
        to: numero,
        body: mensagem,
    });
}
//# sourceMappingURL=twilio.js.map