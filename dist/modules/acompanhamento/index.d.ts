export declare const acompanhamentoRouter: import("express-serve-static-core").Router;
declare function responderFeedback(whatsapp: string, pacienteId: string, score: number, semanaCheckin: number): Promise<void>;
export declare function verificarAlertas(pacienteId: string, whatsapp: string): Promise<void>;
export declare function enviarCheckinsSemana(): Promise<void>;
export { responderFeedback };
//# sourceMappingURL=index.d.ts.map