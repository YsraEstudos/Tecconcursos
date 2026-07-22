const test = require("node:test");
const assert = require("node:assert/strict");
const format = require("../../src/userscript/format.cjs");

test("gera TXT legível com metadados e alternativas", () => {
  const output = format.formatQuestionsAsText([{
    id: "3702591",
    url: "https://www.tecconcursos.com.br/questoes/3702591",
    header: "FCC - 2025",
    subject: "Língua Portuguesa",
    topic: "Coesão",
    organization: "UNASP",
    statement: "Texto da questão.",
    options: [{ letter: "A", text: "Primeira opção" }]
  }]);
  assert.match(output, /Total: 1/);
  assert.match(output, /QUESTAO 1 \(#3702591\)/);
  assert.match(output, /Materia: Língua Portuguesa/);
  assert.match(output, /A\) Primeira opção/);
});
