export interface DadosPacienteWebdiet {
    nome: string;
    apelido?: string;
    sexo?: 'M' | 'F';
    dataNascimento?: string;
    cpf?: string;
    telefone?: string;
    email?: string;
    tags?: string;
}
export declare function inserirPacienteWebdiet(dados: DadosPacienteWebdiet): Promise<boolean>;
//# sourceMappingURL=webdiet.d.ts.map