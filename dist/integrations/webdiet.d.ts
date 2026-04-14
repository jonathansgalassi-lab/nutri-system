export interface DadosPacienteWebdiet {
    nome: string;
    apelido?: string;
    sexo?: 'M' | 'F';
    dataNascimento?: string;
    cpf?: string;
    telefone?: string;
    email?: string;
    tags?: string;
    peso?: number;
    altura?: number;
    objetivo?: string;
    alergias?: string;
    medicamentos?: string;
    historicoFamiliar?: string[];
    praticaExercicio?: string;
    tipoExercicio?: string;
    refeicoesPorDia?: number;
    alimentosQueGosta?: string;
    alimentosQueNaoGosta?: string;
    comeFora?: string;
    ondeComeFora?: string;
    dificuldadesAlimentacao?: string;
    dietasAnteriores?: string;
    expectativas?: string;
}
export declare function inserirPacienteWebdiet(dados: DadosPacienteWebdiet): Promise<boolean>;
//# sourceMappingURL=webdiet.d.ts.map