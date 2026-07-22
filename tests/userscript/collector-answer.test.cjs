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
