const test = require("node:test");
const assert = require("node:assert/strict");
const plan = require("../../src/userscript/plan.cjs");

test("plano consolidado preserva MAT, grupo e caminhos TecConcursos", () => {
  const parsed = plan.parseConsolidatedMarkdown([
    "1. Língua Portuguesa e Redação",
    "MAT-001 — Coesão textual",
    "TecConcursos: 12507 — Língua Portuguesa (Português) > Coerência. Coesão",
    "MAT-002 — Concordância verbal - Base FCC",
    "TecConcursos: 12509 — Língua Portuguesa (Português) > Concordância",
    "Práticas complementares",
    "PRAT-01 — Revisões espaçadas"
  ].join("\n"));

  assert.equal(parsed.matters.length, 3);
  assert.deepEqual(parsed.matters[0].subjectIds, ["12507"]);
  assert.equal(parsed.matters[0].title, "Coesão textual");
  assert.equal(parsed.matters[1].title, "Concordância verbal - Base FCC");
  assert.equal(parsed.matters[0].group, "1. Língua Portuguesa e Redação");
  assert.equal(plan.lastPathSegment(parsed.matters[0].subjectPaths[0]), "Coerência. Coesão");
  assert.equal(parsed.banks.length, 9);
  assert.deepEqual(parsed.years, [2023, 2020, 2022, 2018, 2025, 2021, 2017, 2024, 2019, 2026, 2016]);
});

test("plano inválido informa ausência de MAT ou PRAT", () => {
  assert.throws(() => plan.parsePlanText("apenas uma anotação"), /MAT-xxx/);
});
