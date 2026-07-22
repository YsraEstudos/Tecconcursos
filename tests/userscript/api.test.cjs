const test = require("node:test");
const assert = require("node:assert/strict");
const api = require("../../src/userscript/api.cjs");

function documentFixture() {
  return {
    body: { innerText: "Questão 18 de 238" },
    location: {
      pathname: "/questoes/cadernos/96835951",
      href: "https://www.tecconcursos.com.br/questoes/cadernos/96835951"
    }
  };
}

test("consulta a API autenticada e lê numeroAlternativaCorreta", async () => {
  let called;
  const result = await api.fetchQuestionAnswer(documentFixture(), { cadernoIndex: 18 }, {
    fetchImpl: async (url, options) => {
      called = { url, options };
      return {
        ok: true,
        status: 200,
        json: async () => ({ questao: { idQuestao: 3846503, status: 1, numeroAlternativaCorreta: 3 } })
      };
    },
    retryCount: 1
  });

  assert.equal(result.gabarito, "C");
  assert.equal(result.answerField, "numeroAlternativaCorreta");
  assert.equal(result.statusCode, 1);
  assert.equal(result.apiIndex, 18);
  assert.equal(called.url, "/api/cadernos/96835951/questoes/18?atualizarCronometro=true");
  assert.equal(called.options.credentials, "include");
  assert.equal(called.options.headers["X-Requested-With"], "XMLHttpRequest");
});

test("não transforma status em resposta quando a API não expõe o gabarito", async () => {
  await assert.rejects(
    api.fetchQuestionAnswer(documentFixture(), { cadernoIndex: 18 }, {
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        json: async () => ({ questao: { idQuestao: 3846503, status: 3 } })
      }),
      retryCount: 1
    }),
    /numeroAlternativaCorreta/
  );
});

test("faz retry e preserva a questão quando a API falha", async () => {
  let attempts = 0;
  const enriched = await api.enrichQuestionFromApi(documentFixture(), {
    id: "3846503",
    pageKind: "caderno",
    cadernoIndex: 18
  }, {
    fetchImpl: async () => {
      attempts += 1;
      throw new Error("falha simulada");
    },
    retryCount: 2,
    retryDelayMs: 0,
    waitImpl: async () => {}
  });

  assert.equal(attempts, 2);
  assert.equal(enriched.question.id, "3846503");
  assert.ok(enriched.error);
});
