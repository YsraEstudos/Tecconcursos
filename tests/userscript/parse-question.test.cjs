const test = require("node:test");
const assert = require("node:assert/strict");
const parser = require("../../src/userscript/parse-question.cjs");

function node(text, selectors, lists, attributes) {
  const selectorMap = selectors || {};
  const listMap = lists || {};
  const attrMap = attributes || {};
  return {
    innerText: text || "",
    textContent: text || "",
    querySelector: (selector) => selectorMap[selector] || null,
    querySelectorAll: (selector) => listMap[selector] || [],
    getAttribute: (name) => attrMap[name] || null
  };
}

test("extrai o contrato real da questão do caderno", () => {
  const alternatives = ["A", "B", "C"].map((letter) => node("", {
    ".questao-enunciado-alternativa-opcao": node(letter + ":"),
    ".questao-enunciado-alternativa-texto": node("Texto da alternativa " + letter)
  }));
  const questionRoot = node("", {
    ".id-questao": node("#3702591"),
    ".questao-enunciado-concurso": node("#3702591 FCC - 2025 - Vestibular Medicina"),
    ".questao-cabecalho-informacoes-materia": node("Língua Portuguesa (Português)"),
    ".questao-cabecalho-informacoes-assunto": node("Coerência. Coesão"),
    ".questao-cabecalho-logotipo a": node("UNASP"),
    ".questao-enunciado-texto": node("Texto do enunciado\nCom duas linhas.")
  }, {
    ".questao-enunciado-alternativas > li": alternatives
  });
  const documentNode = {
    body: node("conteúdo"),
    location: {
      href: "https://www.tecconcursos.com.br/questoes/cadernos/95080137",
      pathname: "/questoes/cadernos/95080137"
    },
    querySelector: (selector) => selector === "#caderno .questao" ? questionRoot : null,
    querySelectorAll: () => []
  };

  const question = parser.parseQuestionFromDocument(documentNode, new Date("2026-07-21T12:00:00.000Z"));

  assert.deepEqual(question, {
    id: "3702591",
    questionId: "#3702591",
    header: "#3702591 FCC - 2025 - Vestibular Medicina",
    subject: "Língua Portuguesa (Português)",
    topic: "Coerência. Coesão",
    organization: "UNASP",
    statement: "Texto do enunciado\nCom duas linhas.",
    options: [
      { letter: "A", text: "Texto da alternativa A" },
      { letter: "B", text: "Texto da alternativa B" },
      { letter: "C", text: "Texto da alternativa C" }
    ],
    url: "https://www.tecconcursos.com.br/questoes/cadernos/95080137",
    pageKind: "caderno",
    extractedAt: "2026-07-21T12:00:00.000Z"
  });
});
