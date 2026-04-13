"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calcularIdade = calcularIdade;
exports.calcularIMC = calcularIMC;
exports.calcularGEB = calcularGEB;
exports.calcularGET = calcularGET;
exports.calcularMetaCalorica = calcularMetaCalorica;
exports.calcularMacros = calcularMacros;
exports.formatarDataHora = formatarDataHora;
exports.formatarData = formatarData;
exports.normalizarWhatsApp = normalizarWhatsApp;
exports.interpolar = interpolar;
const date_fns_1 = require("date-fns");
const locale_1 = require("date-fns/locale");
function calcularIdade(dataNascimento) {
    const hoje = new Date();
    let idade = hoje.getFullYear() - dataNascimento.getFullYear();
    const mes = hoje.getMonth() - dataNascimento.getMonth();
    if (mes < 0 || (mes === 0 && hoje.getDate() < dataNascimento.getDate())) {
        idade--;
    }
    return idade;
}
function calcularIMC(peso, alturaCm) {
    const alturaM = alturaCm / 100;
    return parseFloat((peso / (alturaM * alturaM)).toFixed(2));
}
/**
 * Fórmula Mifflin-St Jeor
 * Homem: (10 × peso) + (6,25 × altura) - (5 × idade) + 5
 * Mulher: (10 × peso) + (6,25 × altura) - (5 × idade) - 161
 */
function calcularGEB(peso, alturaCm, idade, sexo) {
    const base = 10 * peso + 6.25 * alturaCm - 5 * idade;
    return sexo === 'M' ? base + 5 : base - 161;
}
const FATORES_ATIVIDADE = {
    sedentario: 1.2,
    leve: 1.375,
    moderado: 1.55,
    intenso: 1.725,
};
function calcularGET(geb, atividade) {
    return Math.round(geb * FATORES_ATIVIDADE[atividade]);
}
function calcularMetaCalorica(get, objetivo) {
    if (objetivo.toLowerCase().includes('emagrecimento') || objetivo.toLowerCase().includes('definição')) {
        return get - 400;
    }
    if (objetivo.toLowerCase().includes('ganho') || objetivo.toLowerCase().includes('massa')) {
        return get + 300;
    }
    return get;
}
function calcularMacros(metaCalorica, objetivo) {
    let cho_pct = 0.5;
    let ptn_pct = 0.25;
    let lip_pct = 0.25;
    if (objetivo.toLowerCase().includes('emagrecimento') || objetivo.toLowerCase().includes('definição')) {
        cho_pct = 0.4;
        ptn_pct = 0.35;
        lip_pct = 0.25;
    }
    else if (objetivo.toLowerCase().includes('ganho') || objetivo.toLowerCase().includes('massa')) {
        cho_pct = 0.45;
        ptn_pct = 0.30;
        lip_pct = 0.25;
    }
    return {
        cho_g: Math.round((metaCalorica * cho_pct) / 4),
        ptn_g: Math.round((metaCalorica * ptn_pct) / 4),
        lip_g: Math.round((metaCalorica * lip_pct) / 9),
    };
}
function formatarDataHora(date) {
    const d = typeof date === 'string' ? (0, date_fns_1.parseISO)(date) : date;
    return (0, date_fns_1.format)(d, "dd/MM/yyyy 'às' HH:mm", { locale: locale_1.ptBR });
}
function formatarData(date) {
    const d = typeof date === 'string' ? (0, date_fns_1.parseISO)(date) : date;
    return (0, date_fns_1.format)(d, 'dd/MM/yyyy', { locale: locale_1.ptBR });
}
function normalizarWhatsApp(numero) {
    return numero.replace(/\D/g, '');
}
function interpolar(template, vars) {
    return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`);
}
//# sourceMappingURL=index.js.map