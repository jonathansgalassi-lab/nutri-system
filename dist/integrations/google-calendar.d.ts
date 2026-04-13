export declare const calendar: import("googleapis").calendar_v3.Calendar;
export declare const CALENDAR_ID: string;
export interface SlotDisponivel {
    inicio: Date;
    fim: Date;
}
export declare function buscarSlotsDisponiveis(quantidadeDias?: number, duracaoMinutos?: number): Promise<SlotDisponivel[]>;
export declare function criarEvento(params: {
    titulo: string;
    descricao: string;
    inicio: Date;
    fim: Date;
    local?: string;
}): Promise<string>;
export declare function cancelarEvento(eventId: string): Promise<void>;
//# sourceMappingURL=google-calendar.d.ts.map