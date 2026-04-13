export declare function calcularIdade(dataNascimento: Date): number;
export declare function calcularIMC(peso: number, alturaCm: number): number;
/**
 * Fórmula Mifflin-St Jeor
 * Homem: (10 × peso) + (6,25 × altura) - (5 × idade) + 5
 * Mulher: (10 × peso) + (6,25 × altura) - (5 × idade) - 161
 */
export declare function calcularGEB(peso: number, alturaCm: number, idade: number, sexo: 'M' | 'F'): number;
export type NivelAtividade = 'sedentario' | 'leve' | 'moderado' | 'intenso';
export declare function calcularGET(geb: number, atividade: NivelAtividade): number;
export declare function calcularMetaCalorica(get: number, objetivo: string): number;
export declare function calcularMacros(metaCalorica: number, objetivo: string): {
    cho_g: number;
    ptn_g: number;
    lip_g: number;
};
export declare function formatarDataHora(date: Date | string): string;
export declare function formatarData(date: Date | string): string;
export declare function normalizarWhatsApp(numero: string): string;
export declare function interpolar(template: string, vars: Record<string, string>): string;
//# sourceMappingURL=index.d.ts.map