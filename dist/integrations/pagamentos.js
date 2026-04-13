"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.criarCobranca = criarCobranca;
exports.buscarCobranca = buscarCobranca;
exports.criarClienteAsaas = criarClienteAsaas;
exports.validarWebhookAsaas = validarWebhookAsaas;
const axios_1 = __importDefault(require("axios"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const ASAAS_BASE_URL = 'https://api.asaas.com/v3';
const ASAAS_API_KEY = process.env.ASAAS_API_KEY;
const asaasHttp = axios_1.default.create({
    baseURL: ASAAS_BASE_URL,
    headers: {
        access_token: ASAAS_API_KEY,
        'Content-Type': 'application/json',
    },
});
async function criarCobranca(params) {
    const response = await asaasHttp.post('/payments', params);
    return response.data;
}
async function buscarCobranca(paymentId) {
    const response = await asaasHttp.get(`/payments/${paymentId}`);
    return response.data;
}
async function criarClienteAsaas(params) {
    const response = await asaasHttp.post('/customers', params);
    return response.data.id;
}
function validarWebhookAsaas(payload, signature) {
    // Validação básica — implementar HMAC conforme documentação Asaas
    const secret = process.env.ASAAS_WEBHOOK_SECRET;
    if (!secret)
        return true; // modo dev sem verificação
    // TODO: implementar verificação HMAC-SHA256
    void payload;
    void signature;
    return true;
}
//# sourceMappingURL=pagamentos.js.map