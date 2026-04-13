import { ConversaBot, EstadoBot, ContextoBot } from '../../shared/types';
interface Gatilho {
    palavras: string[];
    handler: (whatsapp: string, conversa: ConversaBot) => Promise<void>;
}
export declare const GATILHOS: Gatilho[];
export declare function buscarOuCriarConversa(whatsapp: string): Promise<{
    conversa: ConversaBot;
    nova: boolean;
}>;
export declare function atualizarEstado(whatsapp: string, estado: EstadoBot): Promise<void>;
export declare function atualizarContexto(whatsapp: string, contexto: ContextoBot): Promise<void>;
export declare function processarMensagem(whatsapp: string, texto: string): Promise<void>;
export {};
//# sourceMappingURL=estados.d.ts.map