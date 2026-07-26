/**
 * open-browser-devtools.cjs
 *
 * Abre o Chromium via Playwright mantendo a sessão do usuário (user_data),
 * com o DevTools (Console, Network, etc.) aberto automaticamente e
 * capturando logs de rede e console no terminal.
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const SITE = 'https://www.tecconcursos.com.br';
const USER_DATA_DIR = path.resolve(__dirname, '..', 'user_data');

(async () => {
  console.log('===========================================================');
  console.log('NAVEGADOR COM DEVTOOLS & INSPEÇÃO DE REDE/LOGS');
  console.log('===========================================================\n');
  console.log('Iniciando Chromium com DevTools ativado e captura de logs...');

  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false,
    viewport: null,
    args: ['--start-maximized', '--auto-open-devtools-for-tabs'],
  });

  const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

  // Captura de Logs do Console
  page.on('console', msg => {
    console.log(`[BROWSER CONSOLE ${msg.type().toUpperCase()}] ${msg.text()}`);
  });

  // Captura de Erros na Página
  page.on('pageerror', err => {
    console.error(`[PAGE ERROR] ${err.message}`);
  });

  // Captura de Requisições de Rede (Network)
  page.on('request', req => {
    if (req.url().includes('tecconcursos.com.br/api')) {
      console.log(`[NETWORK REQ] ${req.method()} -> ${req.url()}`);
    }
  });

  // Captura de Respostas de Rede (Network)
  page.on('response', async res => {
    if (res.url().includes('tecconcursos.com.br/api')) {
      console.log(`[NETWORK RES ${res.status()}] ${res.request().method()} -> ${res.url()}`);
    }
  });

  await page.goto(SITE, { waitUntil: 'domcontentloaded' }).catch(err => {
    console.warn('Navegação inicial:', err.message);
  });

  console.log('\n===========================================================');
  console.log('📌 O NAVEGADOR ESTÁ ABERTO COM DEVTOOLS E CAPTURA DE LOGS!');
  console.log('   Pressione CTRL+C no terminal quando desejar fechar.');
  console.log('===========================================================\n');

  // Mantém o script rodando
  await new Promise(() => {});
})().catch(err => {
  console.error('Erro ao iniciar o navegador:', err);
  process.exit(1);
});
