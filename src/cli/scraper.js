import fs from 'fs';
import { config } from './config.js';
import answer from '../shared/answer.cjs';

const { extractCorrectAnswer } = answer;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 10000;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function randomDelay() {
  const min = config.delayMin ?? 3000;
  const max = config.delayMax ?? 6000;
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function loadExisting(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
  } catch (e) {
    console.warn(`AVISO: erro ao ler ${filePath} — criando nova lista.`);
  }
  return [];
}

function save(filePath, questions) {
  fs.writeFileSync(filePath, JSON.stringify(questions, null, 2), 'utf-8');
}

async function fetchQuestion(cadernoId, index, cookies) {
  const url = `https://www.tecconcursos.com.br/api/cadernos/${cadernoId}/questoes/${index}?atualizarCronometro=true`;

  const res = await fetch(url, {
    headers: {
      'Cookie': cookies,
      'Accept': 'application/json, text/plain, */*',
      'X-Requested-With': 'XMLHttpRequest',
      'Referer': `https://www.tecconcursos.com.br/questoes/cadernos/${cadernoId}`,
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
      'Sec-Fetch-Site': 'same-origin',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Dest': 'empty',
    },
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }

  return res.json();
}

function mapQuestion(raw, index) {
  const parsedAnswer = extractCorrectAnswer(raw);

  return {
    index: index,
    idQuestao: raw.idQuestao,
    gabarito: parsedAnswer?.letter ?? '?',
    answerField: parsedAnswer?.field ?? null,
    statusCode: raw.status ?? null,
    materia: raw.nomeMateria ?? '',
    assunto: raw.nomeAssunto ?? '',
    banca: raw.bancaSigla ?? '',
    orgao: raw.orgaoNome ?? '',
    ano: raw.concursoAno ?? null,
    cargo: raw.cargoSigla ?? '',
    enunciado: raw.enunciado ?? '',
    alternativas: (raw.alternativas ?? []).map(a =>
      a.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()
    ),
    extraidaEm: new Date().toISOString(),
  };
}

async function run() {
  const { cadernoId, outputFile, maxQuestions, logLevel } = config;

  // Cookies podem vir de src/cli/config.js OU da variável de ambiente TEC_COOKIES
  const cookies = config.cookies || process.env.TEC_COOKIES || '';

  if (!cadernoId) {
    console.error('ERRO: informe o cadernoId em src/cli/config.js');
    process.exit(1);
  }
  if (!cookies) {
    console.error('ERRO: informe os cookies de sessão em src/cli/config.js');
    console.error('Ou use a variável de ambiente TEC_COOKIES');
    console.error('Leia as instruções no próprio src/cli/config.js sobre como obter os cookies.');
    process.exit(1);
  }

  console.log('===============================================================');
  console.log('TEC CONCURSOS — Scraper via API (com gabarito)');
  console.log(`Caderno: ${cadernoId}`);
  console.log(`Arquivo de saída: ${outputFile}`);
  console.log(`Delay entre requisições: ${config.delayMin}-${config.delayMax}ms`);
  console.log(`Limite: ${maxQuestions ?? 'ilimitado'}`);
  console.log('===============================================================\n');

  const questions = loadExisting(outputFile);
  const savedIds = new Set(questions.map(q => q.idQuestao));
  let extraidas = 0;
  let errosConsecutivos = 0;

  // Descobre ponto de retomada (último índice + 1)
  let startIndex = 1;
  if (questions.length > 0) {
    const maxIndex = Math.max(...questions.map(q => q.index ?? 0));
    startIndex = maxIndex + 1;
    console.log(`Retomando do índice ${startIndex} (${questions.length} questões já salvas)\n`);
  }

  for (let i = startIndex; ; i++) {
    if (maxQuestions && extraidas >= maxQuestions) {
      console.log(`\nLimite de ${maxQuestions} questões desta execução atingido.`);
      break;
    }

    let data;
    let retries = 0;

    // Tenta com retry
    while (retries < MAX_RETRIES) {
      try {
        data = await fetchQuestion(cadernoId, i, cookies);
        break;
      } catch (err) {
        retries++;
        console.error(`[${i}] Erro (tentativa ${retries}/${MAX_RETRIES}): ${err.message}`);
        if (retries < MAX_RETRIES) {
          await sleep(RETRY_DELAY_MS);
        }
      }
    }

    if (!data) {
      errosConsecutivos++;
      if (errosConsecutivos >= 3) {
        console.error('Muitos erros consecutivos. Encerrando.');
        break;
      }
      continue;
    }

    errosConsecutivos = 0;
    const q = data.questao;

    // Se a resposta não tem dados válidos, chegamos ao fim do caderno
    if (!q || !q.idQuestao || q.alternativas === undefined) {
      console.log(`[${i}] Sem dados — fim do caderno ou questão indisponível.`);
      if (logLevel !== 'resumo') {
        console.log('   Resposta:', JSON.stringify(data).substring(0, 200));
      }
      break;
    }

    // Pula se já foi salva
    if (savedIds.has(q.idQuestao)) {
      if (logLevel !== 'resumo') {
        console.log(`[${i}] Questão ${q.idQuestao} já salva — pulando.`);
      }
      continue;
    }

    const entry = mapQuestion(q, i);
    questions.push(entry);
    savedIds.add(q.idQuestao);
    extraidas++;
    save(outputFile, questions);

    console.log(`[${i}] #${q.idQuestao} | Gab: ${entry.gabarito} | ${q.nomeMateria ?? '?'} | ${q.nomeAssunto ?? '?'}`);

    // Delay aleatório
    const delay = randomDelay();
    if (logLevel !== 'resumo') {
      console.log(`   ⏳ ${(delay / 1000).toFixed(1)}s...`);
    }
    await sleep(delay);
  }

  console.log(`\nFINALIZADO. Total: ${questions.length} questões em ${outputFile}`);
}

run();
