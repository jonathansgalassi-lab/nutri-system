import { format, addHours, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export function calcularIdade(dataNascimento: Date): number {
  const hoje = new Date();
  let idade = hoje.getFullYear() - dataNascimento.getFullYear();
  const mes = hoje.getMonth() - dataNascimento.getMonth();
  if (mes < 0 || (mes === 0 && hoje.getDate() < dataNascimento.getDate())) {
    idade--;
  }
  return idade;
}

export function calcularIMC(peso: number, alturaCm: number): number {
  const alturaM = alturaCm / 100;
  return parseFloat((peso / (alturaM * alturaM)).toFixed(2));
}

/**
 * Fórmula Mifflin-St Jeor
 * Homem: (10 × peso) + (6,25 × altura) - (5 × idade) + 5
 * Mulher: (10 × peso) + (6,25 × altura) - (5 × idade) - 161
 */
export function calcularGEB(
  peso: number,
  alturaCm: number,
  idade: number,
  sexo: 'M' | 'F'
): number {
  const base = 10 * peso + 6.25 * alturaCm - 5 * idade;
  return sexo === 'M' ? base + 5 : base - 161;
}

export type NivelAtividade = 'sedentario' | 'leve' | 'moderado' | 'intenso';

const FATORES_ATIVIDADE: Record<NivelAtividade, number> = {
  sedentario: 1.2,
  leve: 1.375,
  moderado: 1.55,
  intenso: 1.725,
};

export function calcularGET(geb: number, atividade: NivelAtividade): number {
  return Math.round(geb * FATORES_ATIVIDADE[atividade]);
}

export function calcularMetaCalorica(
  get: number,
  objetivo: string
): number {
  if (objetivo.toLowerCase().includes('emagrecimento') || objetivo.toLowerCase().includes('definição')) {
    return get - 400;
  }
  if (objetivo.toLowerCase().includes('ganho') || objetivo.toLowerCase().includes('massa')) {
    return get + 300;
  }
  return get;
}

export function calcularMacros(
  metaCalorica: number,
  objetivo: string
): { cho_g: number; ptn_g: number; lip_g: number } {
  let cho_pct = 0.5;
  let ptn_pct = 0.25;
  let lip_pct = 0.25;

  if (objetivo.toLowerCase().includes('emagrecimento') || objetivo.toLowerCase().includes('definição')) {
    cho_pct = 0.4; ptn_pct = 0.35; lip_pct = 0.25;
  } else if (objetivo.toLowerCase().includes('ganho') || objetivo.toLowerCase().includes('massa')) {
    cho_pct = 0.45; ptn_pct = 0.30; lip_pct = 0.25;
  }

  return {
    cho_g: Math.round((metaCalorica * cho_pct) / 4),
    ptn_g: Math.round((metaCalorica * ptn_pct) / 4),
    lip_g: Math.round((metaCalorica * lip_pct) / 9),
  };
}

export function formatarDataHora(date: Date | string): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
}

export function formatarData(date: Date | string): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, 'dd/MM/yyyy', { locale: ptBR });
}

export function normalizarWhatsApp(numero: string): string {
  return numero.replace(/\D/g, '');
}

export function interpolar(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`);
}
