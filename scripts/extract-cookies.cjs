/**
 * extract-cookies.cjs
 *
 * Abre um navegador Playwright, espera você fazer login no Tec Concursos,
 * e extrai os cookies de sessão no formato que o scraper precisa.
 *
 * Uso: node scripts/extract-cookies.cjs
 *
 * Pré-requisito: npm install (já feito, Playwright já está instalado)
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const SITE = 'https://www.tecconcursos.com.br';
const USER_DATA_DIR = path.resolve(__dirname, '..', 'user_data');

(async () => {
  console.log('===========================================================');
  console.log('EXTRATOR DE COOKIES — Tec Concursos');
  console.log('===========================================================\n');

  console.log('Abrindo navegador...');
  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false,
    viewport: null,
    args: ['--start-maximized'],
  });

  const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

  await page.goto(SITE, { waitUntil: 'domcontentloaded' }).catch(() => {});

  console.log('\n📌 FAÇA LOGIN NO NAVEGADOR QUE ABRIU.');
  console.log('   Após logar e ver a página inicial do site,');
  console.log('   volte aqui e pressione ENTER.\n');

  await new Promise(resolve => {
    process.stdin.once('data', () => resolve());
  });

  const allCookies = await context.cookies();

  // Filtra cookies relevantes
  const relevant = allCookies.filter(
    c => c.domain?.includes('tecconcursos.com.br')
  );

  const cookieString = relevant
    .map(c => `${c.name}=${c.value}`)
    .join('; ');

  console.log('\n===========================================================');
  console.log('COOKIES EXTRAÍDOS (copie a linha abaixo para src/cli/config.js):');
  console.log('===========================================================\n');

  console.log(cookieString);
  console.log('');

  // Salva em arquivo
  const outputFile = path.resolve(__dirname, '..', 'cookies.txt');
  fs.writeFileSync(outputFile, cookieString, 'utf-8');
  console.log(`Cookies também salvos em: ${outputFile}`);

  // Sugestão de src/cli/config.js
  console.log('\n📋 Exemplo para src/cli/config.js:');
  console.log('```');
  console.log(`cookies: '${cookieString.substring(0, 80)}...',`);
  console.log('```');

  await context.close();
  console.log('\nPronto! Navegador fechado.');
})().catch(err => {
  console.error('Erro:', err.message);
  process.exit(1);
});
