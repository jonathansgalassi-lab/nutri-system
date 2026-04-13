import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const ASAAS_BASE_URL = 'https://api.asaas.com/v3';
const ASAAS_API_KEY = process.env.ASAAS_API_KEY;

const asaasHttp = axios.create({
  baseURL: ASAAS_BASE_URL,
  headers: {
    access_token: ASAAS_API_KEY,
    'Content-Type': 'application/json',
  },
});

export interface CobrancaParams {
  customer: string;     // ID do cliente no Asaas
  billingType: 'BOLETO' | 'CREDIT_CARD' | 'PIX';
  value: number;
  dueDate: string;      // YYYY-MM-DD
  description: string;
}

export interface CobrancaResposta {
  id: string;
  invoiceUrl: string;
  bankSlipUrl?: string;
  pixQrCodeUrl?: string;
  status: string;
}

export async function criarCobranca(params: CobrancaParams): Promise<CobrancaResposta> {
  const response = await asaasHttp.post('/payments', params);
  return response.data;
}

export async function buscarCobranca(paymentId: string): Promise<CobrancaResposta> {
  const response = await asaasHttp.get(`/payments/${paymentId}`);
  return response.data;
}

export async function criarClienteAsaas(params: {
  name: string;
  email?: string;
  phone?: string;
  cpfCnpj?: string;
}): Promise<string> {
  const response = await asaasHttp.post('/customers', params);
  return response.data.id;
}

export function validarWebhookAsaas(payload: unknown, signature: string): boolean {
  // Validação básica — implementar HMAC conforme documentação Asaas
  const secret = process.env.ASAAS_WEBHOOK_SECRET;
  if (!secret) return true; // modo dev sem verificação
  // TODO: implementar verificação HMAC-SHA256
  void payload; void signature;
  return true;
}
