"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.inserirPacienteWebdiet = inserirPacienteWebdiet;
const puppeteer_1 = __importDefault(require("puppeteer"));
const path_1 = __importDefault(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const WEBDIET_URL = process.env.WEBDIET_URL ?? 'https://app.webdiet.com.br';
async function loginWebdiet(browser) {
    const page = await browser.newPage();
    await page.goto(`${WEBDIET_URL}/login`);
    await page.waitForSelector('input[type="email"], input[name="email"]');
    await page.type('input[type="email"], input[name="email"]', process.env.WEBDIET_EMAIL ?? '');
    await page.type('input[type="password"], input[name="password"]', process.env.WEBDIET_PASSWORD ?? '');
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ waitUntil: 'networkidle0' });
    return page;
}
async function inserirPacienteWebdiet(dados) {
    const browser = await puppeteer_1.default.launch({
        headless: true,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH ?? undefined,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    try {
        const page = await loginWebdiet(browser);
        // Navega para cadastro de paciente
        await page.goto(`${WEBDIET_URL}/pacientes/novo`);
        await page.waitForSelector('form');
        // Preenche os campos (seletores podem variar conforme a versão do Webdiet)
        await page.type('[name="nome"], #nome', dados.nome);
        if (dados.email)
            await page.type('[name="email"], #email', dados.email);
        if (dados.dataNascimento)
            await page.type('[name="data_nascimento"], #data_nascimento', dados.dataNascimento);
        if (dados.peso)
            await page.type('[name="peso"], #peso', String(dados.peso));
        if (dados.altura)
            await page.type('[name="altura"], #altura', String(dados.altura));
        // Screenshot de confirmação
        const screenshotPath = path_1.default.join(process.cwd(), 'tmp', `webdiet_${Date.now()}.png`);
        await page.screenshot({ path: screenshotPath });
        // Submete o formulário
        await page.click('button[type="submit"]');
        await page.waitForNavigation({ waitUntil: 'networkidle0' });
        const url = page.url();
        console.log(`Paciente inserido no Webdiet: ${url}`);
        return url;
    }
    finally {
        await browser.close();
    }
}
//# sourceMappingURL=webdiet.js.map