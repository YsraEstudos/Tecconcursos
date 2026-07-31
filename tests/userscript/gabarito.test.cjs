const test = require("node:test");
const assert = require("node:assert/strict");
const gabaritoModule = require("../../src/userscript/gabarito.cjs");

const PRINT_HTML = `<!doctype html><html><body>
<div class="questao">...</div>
<div id="gabarito">
  <div class="separador quebra-pagina"><span>Gabarito</span></div>
  <span class="resposta"><strong>1)</strong> B</span>
  <span class="resposta"><strong>2)</strong> D</span>
  <span class="resposta"><strong>3)</strong> E</span>
  <span class="resposta"><strong>158)</strong> Errado</span>
  <span class="resposta"><strong>185)</strong> Certo</span>
</div>
<div class="separador quebra-pagina"><span>Gabarito</span></div>
</body></html>`;

test("parseGabaritoHtml extrai número e resposta do bloco #gabarito", () => {
  const entries = gabaritoModule.parseGabaritoHtml(PRINT_HTML);
  assert.equal(entries.length, 5);
  assert.deepEqual(entries[0], { index: 1, answer: "B" });
  assert.deepEqual(entries[3], { index: 158, answer: "Errado" });
  assert.deepEqual(entries[4], { index: 185, answer: "Certo" });
});

test("parseGabaritoHtml ignora span.resposta fora do bloco #gabarito", () => {
  const html = '<span class="resposta"><strong>1)</strong> A</span>' + PRINT_HTML;
  const entries = gabaritoModule.parseGabaritoHtml(html);
  assert.equal(entries.length, 5);
  assert.equal(entries[0].answer, "B");
});

test("parseGabaritoHtml retorna vazio quando não há bloco de gabarito", () => {
  assert.deepEqual(gabaritoModule.parseGabaritoHtml("<html><body>sem gabarito</body></html>"), []);
});

test("parseGabaritoDocument extrai do DOM", () => {
  const documentLike = {
    querySelectorAll: (selector) => {
      assert.equal(selector, "#gabarito .resposta");
      const makeNode = (number, answer) => ({
        textContent: number + ") " + answer,
        querySelector: (sel) => (sel === "strong" ? { textContent: number + ")" } : null)
      });
      return [makeNode("1", "C"), makeNode("2", "Certo")];
    }
  };
  const entries = gabaritoModule.parseGabaritoDocument(documentLike);
  assert.deepEqual(entries, [
    { index: 1, answer: "C" },
    { index: 2, answer: "Certo" }
  ]);
});

test("applyToQuestions preenche apenas questões sem gabarito pelo cadernoIndex", () => {
  const questions = [
    { id: "1", cadernoIndex: 1 },
    { id: "2", cadernoIndex: 2, gabarito: "C", answerSource: "api" },
    { id: "3", cadernoIndex: 3 },
    { id: "4" },
    { id: "5", cadernoIndex: 5, gabarito: "" }
  ];
  const entries = [
    { index: 1, answer: "B" },
    { index: 2, answer: "D" },
    { index: 3, answer: "E" },
    { index: 5, answer: "A" }
  ];
  const result = gabaritoModule.applyToQuestions(questions, entries);
  assert.equal(result.applied, 3);
  assert.equal(result.questions[0].gabarito, "B");
  assert.equal(result.questions[0].answerSource, "print-page");
  assert.equal(result.questions[0].answerField, "gabarito");
  assert.equal(result.questions[1].gabarito, "C");
  assert.equal(result.questions[2].gabarito, "E");
  assert.equal(result.questions[2].answerSource, "print-page");
  assert.equal(result.questions[3].gabarito, undefined);
  assert.equal(result.questions[4].gabarito, "A");
});

test("applyToQuestions não duplica objetos quando nada muda", () => {
  const questions = [{ id: "1", cadernoIndex: 1, gabarito: "B" }];
  const result = gabaritoModule.applyToQuestions(questions, [{ index: 1, answer: "B" }]);
  assert.equal(result.applied, 0);
  assert.equal(result.questions[0], questions[0]);
});

test("fetchCadernoGabarito baixa e parseia a página de impressão", async () => {
  const fetchImpl = async (url, options) => {
    assert.equal(url, "/questoes/cadernos/12345/imprimir");
    assert.equal(options.credentials, "include");
    return { ok: true, status: 200, text: async () => PRINT_HTML };
  };
  const documentNode = { location: { pathname: "/questoes/cadernos/12345" } };
  const entries = await gabaritoModule.fetchCadernoGabarito(documentNode, { fetchImpl, retryCount: 2, retryDelayMs: 1 });
  assert.equal(entries.length, 5);
});

test("fetchCadernoGabarito tenta variante com parâmetros quando a página não expõe gabarito", async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    return { ok: true, status: 200, text: async () => (calls.length === 1 ? "<html>sem gabarito</html>" : PRINT_HTML) };
  };
  const documentNode = { location: { pathname: "/questoes/cadernos/12345" } };
  const entries = await gabaritoModule.fetchCadernoGabarito(documentNode, { fetchImpl, count: 200, retryCount: 1, retryDelayMs: 1 });
  assert.equal(calls.length, 2);
  assert.equal(calls[0], "/questoes/cadernos/12345/imprimir");
  assert.equal(calls[1], "/questoes/cadernos/12345/imprimir?questaoInicial=1&numeroQuestoes=200");
  assert.equal(entries.length, 5);
});

test("fetchCadernoGabarito falha após retries em erro HTTP", async () => {
  const fetchImpl = async () => ({ ok: false, status: 500 });
  const documentNode = { location: { pathname: "/questoes/cadernos/12345" } };
  await assert.rejects(
    gabaritoModule.fetchCadernoGabarito(documentNode, { fetchImpl, retryCount: 2, retryDelayMs: 1 }),
    /HTTP 500/
  );
});

test("getCadernoId extrai o id do caderno da URL", () => {
  assert.equal(gabaritoModule.getCadernoId({ location: { pathname: "/questoes/cadernos/98765" } }), "98765");
  assert.equal(gabaritoModule.getCadernoId({ location: { pathname: "/outra/pagina" } }), "");
});
