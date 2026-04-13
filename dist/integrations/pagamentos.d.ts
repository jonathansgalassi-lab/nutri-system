export interface CobrancaParams {
    customer: string;
    billingType: 'BOLETO' | 'CREDIT_CARD' | 'PIX';
    value: number;
    dueDate: string;
    description: string;
}
export interface CobrancaResposta {
    id: string;
    invoiceUrl: string;
    bankSlipUrl?: string;
    pixQrCodeUrl?: string;
    status: string;
}
export declare function criarCobranca(params: CobrancaParams): Promise<CobrancaResposta>;
export declare function buscarCobranca(paymentId: string): Promise<CobrancaResposta>;
export declare function criarClienteAsaas(params: {
    name: string;
    email?: string;
    phone?: string;
    cpfCnpj?: string;
}): Promise<string>;
export declare function validarWebhookAsaas(payload: unknown, signature: string): boolean;
//# sourceMappingURL=pagamentos.d.ts.map