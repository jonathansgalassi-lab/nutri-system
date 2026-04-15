import { ConteudoPlano } from '../shared/types';
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
    planoAlimentar?: ConteudoPlano;
}
export declare function inserirPacienteWebdiet(dados: DadosPacienteWebdiet): Promise<boolean>;
export interface DadosPagamentoWebdiet {
    nomePaciente: string;
    nomeLancamento: string;
    valor: number;
    formaPagamento: 'PIX' | 'CREDIT_CARD' | 'DEBIT_CARD' | 'BOLETO' | string;
    categoria?: 'Consulta' | 'Retorno';
    cpfPaciente?: string;
    observacao?: string;
}
export declare function lancarPagamentoWebdiet(dados: DadosPagamentoWebdiet): Promise<boolean>;
export interface EstatisticasWebdiet {
    totalConsultas: number;
    totalPacientes: number;
    totalPrescricoes: number;
    totalAntropometrias: number;
}
export declare function obterEstatisticasWebdiet(): Promise<EstatisticasWebdiet | null>;
//# sourceMappingURL=webdiet.d.ts.map