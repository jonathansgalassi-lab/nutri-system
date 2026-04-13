export declare const TEMPLATES: {
    RECEPCAO: () => string;
    QUALIFICACAO: (nome: string) => string;
    APRESENTACAO_PLANOS_INFO: () => string;
    APRESENTACAO_PLANOS_VALOR: () => string;
    APRESENTACAO_PLANOS: () => string;
    AGENDAMENTO: (slots: {
        dia: string;
        horas: string[];
    }[]) => string;
    CONFIRMACAO_AGENDAMENTO: (data: string, hora: string, local: string) => string;
    FORMS_PRECONSULTA: (link: string) => string;
    DEPOIMENTO: () => string;
    ALERGIA_REGISTRADA: () => string;
    URGENTE: (slots: string) => string;
    ONLINE_CONFIRMADO: () => string;
    NAO_ENTENDEU: () => string;
    FALAR_SECRETARIA: () => string;
};
//# sourceMappingURL=templates.d.ts.map