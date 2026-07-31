const test = require("node:test");
const assert = require("node:assert/strict");
const collectorModule = require("../../src/userscript/collector.cjs");
const gabaritoModule = require("../../src/userscript/gabarito.cjs");

const PRINT_HTML = `<div id="gabarito"><span class="resposta"><strong>1)</strong> B</span></div>`;

function createHarness(saved, options) {
  const storage = {
    read: () => saved.slice(),
    write: (_key, value) => {
      saved.splice(0, saved.length, ...value);
    },
    remove: () => {}
  };
  const parser = {
    parseQuestionFromDocument: () => ({
      id: "3846503",
      pageKind: "caderno",
      cadernoIndex: 1,
      statement: "questão atual",
      options: []
    })
  };
  const api = options && options.api
    ? options.api
    : {
      enrichQuestionFromApi: async (_document, question) => ({
        question,
        error: new Error("A API não expôs numeroAlternativaCorreta")
      })
    };
  const collector = collectorModule.createCollector({
    document: {
      location: { pathname: "/questoes/cadernos/12345" },
      querySelectorAll: () => []
    },
    storage,
    parser,
    api,
    gabarito: gabaritoModule,
    navigation: {},
    timing: {},
    format: {},
    apiOptions: options && options.apiOptions ? options.apiOptions : { retryCount: 1, retryDelayMs: 1 }
  });
  return { collector, storage, saved };
}

test("ao chegar ao fim do caderno, o coletor baixa e aplica o gabarito da página de impressão", async () => {
  const saved = [{
    id: "3846503",
    statement: "questão sem gabarito",
    cadernoIndex: 1
  }];
  const { collector } = createHarness(saved, {
    apiOptions: {
      retryCount: 1,
      retryDelayMs: 1,
      fetchImpl: async (url) => {
        assert.equal(url, "/questoes/cadernos/12345/imprimir");
        return { ok: true, status: 200, text: async () => PRINT_HTML };
      }
    }
  });
  const messages = [];
  const result = await collector.start({
    onStatus: (message) => messages.push(message)
  });

  assert.equal(result.addedThisRun, 0);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].gabarito, "B");
  assert.equal(saved[0].answerSource, "print-page");
  assert.equal(saved[0].answerField, "gabarito");
  assert.ok(messages.some((message) => message.indexOf("Gabarito oficial aplicado") >= 0));
});

test("no fim do caderno, o coletor não busca gabarito quando todas as questões já têm resposta", async () => {
  const saved = [{
    id: "3846503",
    statement: "questão com gabarito",
    cadernoIndex: 1,
    gabarito: "C",
    answerSource: "api"
  }];
  let fetched = false;
  const { collector } = createHarness(saved, {
    api: {
      enrichQuestionFromApi: async (_document, question) => ({
        question: Object.assign({}, question, {
          gabarito: "C",
          answerField: "numeroAlternativaCorreta",
          answerSource: "api"
        }),
        error: null
      })
    },
    apiOptions: {
      retryCount: 1,
      retryDelayMs: 1,
      fetchImpl: async () => {
        fetched = true;
        return { ok: true, status: 200, text: async () => PRINT_HTML };
      }
    }
  });
  await collector.start({ onStatus: () => {} });
  assert.equal(fetched, false);
  assert.equal(saved[0].gabarito, "C");
});

test("no fim do caderno, o coletor registra falha do download do gabarito sem quebrar a coleta", async () => {
  const saved = [{
    id: "3846503",
    statement: "questão sem gabarito",
    cadernoIndex: 1
  }];
  const { collector } = createHarness(saved, {
    apiOptions: {
      retryCount: 1,
      retryDelayMs: 1,
      fetchImpl: async () => ({ ok: false, status: 500 })
    }
  });
  const messages = [];
  const result = await collector.start({
    onStatus: (message) => messages.push(message)
  });
  assert.equal(result.addedThisRun, 0);
  assert.equal(saved[0].gabarito, undefined);
  assert.ok(messages.some((message) => message.indexOf("Não foi possível coletar o gabarito oficial") >= 0));
});

test("buildLibraryEntry mapeia questões coletadas para a forma da biblioteca (HTML/Excel)", () => {
  const collector = collectorModule.createCollector({
    document: { location: { pathname: "/questoes/cadernos/12345" }, querySelectorAll: () => [] },
    storage: { read: () => [], write: () => {}, remove: () => {} },
    parser: {},
    api: {},
    navigation: {},
    timing: {},
    format: {}
  });
  const entry = collector.buildLibraryEntry([{
    id: "3846503",
    cadernoIndex: 7,
    header: "FCC - Cargo/Órgão/Cargo/2025",
    subject: "Matéria",
    topic: "Assunto",
    organization: "Órgão",
    statement: "Enunciado",
    options: [{ letter: "A", text: "Alt A" }],
    gabarito: "C"
  }], { cadernoId: "12345" });
  assert.match(entry.id, /^coletor-12345$/);
  assert.equal(entry.code, "12345");
  assert.equal(entry.questions[0].answer, "C");
  assert.equal(entry.questions[0].number, 7);
  assert.equal(entry.questions[0].bank, "FCC");
  assert.equal(entry.questions[0].subject, "Matéria");
});
