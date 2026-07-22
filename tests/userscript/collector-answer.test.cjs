const test = require("node:test");
const assert = require("node:assert/strict");
const collectorModule = require("../../src/userscript/collector.cjs");

test("preenche o gabarito de uma questão antiga sem duplicá-la", async () => {
  const saved = [{
    id: "3846503",
    statement: "questão antiga"
  }];
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
      cadernoIndex: 18,
      statement: "questão atual",
      options: []
    })
  };
  const api = {
    enrichQuestionFromApi: async (_document, question) => ({
      question: Object.assign({}, question, {
        gabarito: "C",
        answerField: "numeroAlternativaCorreta",
        statusCode: 3,
        answerSource: "api"
      }),
      error: null
    })
  };
  const collector = collectorModule.createCollector({
    document: {
      querySelectorAll: () => []
    },
    storage,
    parser,
    api,
    navigation: {},
    timing: {},
    format: {}
  });

  const result = await collector.start({
    limit: 1,
    onStatus: () => {}
  });

  assert.equal(result.addedThisRun, 0);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].gabarito, "C");
  assert.equal(saved[0].statusCode, 3);
  assert.equal(saved[0].answerSource, "api");
});

test("remove respostas antigas que foram inferidas incorretamente de status", async () => {
  const saved = [{
    id: "3846503",
    gabarito: "C",
    statusCode: 3,
    answerSource: "api"
  }];
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
      cadernoIndex: 18,
      options: []
    })
  };
  const collector = collectorModule.createCollector({
    document: { querySelectorAll: () => [] },
    storage,
    parser,
    api: {
      enrichQuestionFromApi: async (_document, question) => ({
        question,
        error: new Error("A API não expôs numeroAlternativaCorreta")
      })
    },
    navigation: {},
    timing: {},
    format: {}
  });

  await collector.start({ limit: 1, onStatus: () => {} });

  assert.equal(saved.length, 1);
  assert.equal(saved[0].gabarito, undefined);
  assert.equal(saved[0].answerSource, undefined);
});
