const test = require("node:test");
const assert = require("node:assert/strict");
const libraryUi = require("../../src/userscript/library-ui.cjs");

test("mostra MATs concluídos e preserva a etapa com erro no resumo do plano", () => {
  const rows = libraryUi.completionSummary(
    {
      matters: [
        { code: "MAT-001", title: "TUDO DE BOM EM AUDIOLIVROS" },
        { code: "MAT-002", title: "Outro caderno" },
        { code: "MAT-003", title: "Caderno pendente" }
      ]
    },
    [
      { code: "MAT-001", totalQuestions: 1, parts: [{ start: 1 }] },
      { code: "MAT-002", totalQuestions: 400, parts: [{ start: 1 }] }
    ],
    { phase: "error", matterCode: "MAT-002", matterTitle: "Outro caderno" }
  );

  assert.deepEqual(rows.map(row => row.status), ["completed", "failed", "pending"]);
  assert.equal(rows[0].title, "TUDO DE BOM EM AUDIOLIVROS");
  assert.equal(rows[1].savedParts, 1);
});
