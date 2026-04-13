export interface DadosPacienteWebdiet {
    nome: string;
    email?: string;
    dataNascimento?: string;
    sexo?: 'M' | 'F';
    peso?: number;
    altura?: number;
    objetivo?: string;
    alergias?: string;
}
export declare function inserirPacienteWebdiet(dados: DadosPacienteWebdiet): Promise<string>;
//# sourceMappingURL=webdiet.d.ts.map