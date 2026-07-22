import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { config } from './config.js';

// Função para ler ou carregar a lista de questões salva em disco
function loadExistingQuestions(filePath) {
  if (fs.existsSync(filePath)) {
    try {
      const data = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(data);
    } catch (e) {
      console.warn('⚠️ Erro ao ler arquivo de questões existente. Criando nova lista.', e.message);
    }
  }
  return [];
}

// Função para salvar a lista de questões em arquivo JSON
function saveQuestions(filePath, questions) {
  fs.writeFileSync(filePath, JSON.stringify(questions, null, 2), 'utf-8');
}

async function runScraper() {
  console.log('🚀 Iniciando o sistema de extração do Tec Concursos com Playwright...\n');

  const absoluteUserDataDir = path.resolve(config.userDataDir);

  // Lançar navegador com contexto de dados persistente (mantém login)
  const context = await chromium.launchPersistentContext(absoluteUserDataDir, {
    headless: false,
    viewport: null,
    args: ['--start-maximized']
  });

  const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

  if (config.initialUrl) {
    console.log(`🌐 Abrindo o site: ${config.initialUrl}`);
    await page.goto(config.initialUrl, { waitUntil: 'domcontentloaded' }).catch(() => {});
  }

  console.log('\n===============================================================');
  console.log('📌 INSTRUÇÕES:');
  console.log('1. Faça login na sua conta no navegador que abriu (se necessário).');
  console.log('2. Abra a página do caderno de questões desejado.');
  console.log('3. Posicione na PRIMEIRA questão que deseja extrair.');
  console.log('4. Volte neste terminal e pressione ENTER para iniciar!');
  console.log('===============================================================\n');

  // Aguardar o usuário pressionar ENTER no terminal
  await new Promise((resolve) => {
    process.stdin.once('data', () => resolve());
  });

  console.log('⚡ Extração iniciada! O robô irá extrair e clicar na seta automaticamente...\n');

  let questions = loadExistingQuestions(config.outputFile);
  const existingIds = new Set(questions.map(q => q.id));

  let extractedCount = 0;
  let previousQuestionId = null;

  while (true) {
    if (config.maxQuestions && extractedCount >= config.maxQuestions) {
      console.log(`🎯 Limite de ${config.maxQuestions} questões atingido! Finalizando extração...`);
      break;
    }

    try {
      // 1. Extrair os dados da questão atual visível na página
      const questionData = await page.evaluate(() => {
        const bodyText = document.body.innerText;
        
        // Tentar identificar o código/ID da questão (ex: #3702591)
        const matchId = bodyText.match(/#(\d{5,8})/);
        const questionId = matchId ? `#${matchId[1]}` : null;

        // Tentar capturar metadados do cabeçalho
        const headerEl = document.querySelector('header, .q-question-header, [data-testid="question-header"]');
        const headerText = headerEl ? headerEl.innerText.trim() : '';

        // Tentar capturar o enunciado da questão
        const statementEl = document.querySelector('.q-question-enunciado, .q-enunciado, article, section article');
        const statementText = statementEl ? statementEl.innerText.trim() : '';
        const statementHtml = statementEl ? statementEl.innerHTML.trim() : '';

        // Tentar capturar alternativas (A, B, C, D, E)
        const alternativeElements = Array.from(
          document.querySelectorAll('.q-options li, .q-opcao, [role="radio"], [data-testid="option"], .q-alternativas > div')
        );
        const options = alternativeElements.map(el => el.innerText.trim()).filter(Boolean);

        return {
          id: questionId || `Q_${Date.now()}`,
          header: headerText,
          statementText: statementText,
          statementHtml: statementHtml,
          options: options,
          url: window.location.href,
          extractedAt: new Date().toISOString()
        };
      });

      // Salvar se for uma questão nova
      if (questionData.id !== previousQuestionId) {
        if (!existingIds.has(questionData.id)) {
          questions.push(questionData);
          existingIds.add(questionData.id);
          extractedCount++;
          saveQuestions(config.outputFile, questions);
          console.log(`✅ [${extractedCount}] Questão salva: ${questionData.id}`);
        } else {
          console.log(`ℹ️ Questão ${questionData.id} já foi salva anteriormente.`);
        }
        previousQuestionId = questionData.id;
      }

      // 2. Tentar localizar o botão "Próxima questão" e clicar
      // Suporta vários locators para máxima compatibilidade
      const locators = [
        page.getByLabel('Próxima questão'),
        page.locator('button[aria-label="Próxima questão"]'),
        page.locator('[title="Próxima questão"]'),
        page.locator('a[aria-label="Próxima questão"]'),
        page.locator('button:has-text("Próxima")'),
        page.locator('.q-btn-next, .q-next-question, [aria-label*="Próxima"]')
      ];

      let clicked = false;
      for (const loc of locators) {
        if (await loc.count() > 0 && await loc.first().isVisible()) {
          await loc.first().scrollIntoViewIfNeeded().catch(() => {});
          await loc.first().click();
          clicked = true;
          break;
        }
      }

      if (!clicked) {
        console.log('⚠️ Botão "Próxima questão" não encontrado ou fim do caderno.');
        console.log('Caso ainda haja questões, navegue até ela e pressione Enter para continuar.');
        break;
      }

      // Esperar delay entre requisições para carregamento da nova questão
      await page.waitForTimeout(config.delayBetweenQuestionsMs);

    } catch (err) {
      console.error('❌ Erro no ciclo de extração:', err.message);
      console.log('Reesperando 3 segundos antes de tentar a próxima...');
      await page.waitForTimeout(3000);
    }
  }

  console.log(`\n🎉 Concluído! Total de ${questions.length} questões armazenadas em: ${config.outputFile}`);
}

runScraper();
