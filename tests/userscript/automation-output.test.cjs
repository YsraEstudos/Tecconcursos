const test = require("node:test");
const assert = require("node:assert/strict");
const output = require("../../src/userscript/automation-output.cjs");

test("não tira snapshot pesado nem grava no armazenamento a cada questão montada", async () => {
  const counts = [0, 1, 2, 3];
  let countRead = 0;
  let snapshotCalls = 0;
  let writeCalls = 0;
  const countEvents = [];
  const state = {
    running: true,
    export: {
      job: {
        libraryId: "caderno-1",
        cadernoId: "caderno-1",
        title: "Caderno de teste",
        code: "MAT-001",
        group: "Português",
        sourceQuestionCount: 3,
        ranges: [{ start: 1, count: 3 }],
        rangeIndex: 0
      }
    }
  };
  const documentNode = {
    querySelectorAll(selector) {
      if (selector === ".questao") return Array.from({ length: counts[Math.min(countRead++, counts.length - 1)] });
      return [];
    },
    querySelector() { return null; }
  };
  const workflow = output.createOutputWorkflow({
    root: { location: { href: "https://www.tecconcursos.com.br/questoes/cadernos/caderno-1/imprimir" } },
    document: documentNode,
    outputWaitTimeoutMs: 1000,
    library: { appendPart() { return { id: "caderno-1", title: "Caderno de teste" }; } },
    extractPrintedQuestions() { return [{ id: "q1" }, { id: "q2" }, { id: "q3" }]; },
    persistProgress() {},
    recordEvent(stateValue, event, details) {
      if (event === "output-question-count") countEvents.push(details);
    },
    writeState() { writeCalls += 1; },
    waitFor(documentValue, predicate) {
      for (let index = 0; index < counts.length; index += 1) {
        if (predicate(documentValue)) return Promise.resolve();
      }
      return Promise.reject(new Error("não concluiu"));
    },
    pageDiagnosticSnapshot() {
      snapshotCalls += 1;
      return { heavy: true };
    },
    clean(value) { return String(value || ""); },
    lockManager: { releaseLease() {} }
  });

  await workflow.finishExportPart(state);

  assert.deepEqual(countEvents, [
    { count: 0, expected: 3 },
    { count: 1, expected: 3 },
    { count: 2, expected: 3 },
    { count: 3, expected: 3 }
  ]);
  assert.equal(snapshotCalls, 2);
  assert.equal(writeCalls, 2);
});

test("não avança para a próxima parte quando a pausa ocorre antes da navegação", async () => {
  const initialHref = "https://www.tecconcursos.com.br/questoes/cadernos/caderno-1/imprimir";
  const root = { location: { href: initialHref } };
  const state = {
    running: true,
    export: {
      job: {
        libraryId: "caderno-1",
        cadernoId: "caderno-1",
        title: "Caderno pausável",
        code: "MAT-001",
        group: "Português",
        ranges: [{ start: 1, count: 1 }, { start: 2, count: 1 }],
        rangeIndex: 0
      }
    }
  };
  const workflow = output.createOutputWorkflow({
    root,
    document: { querySelectorAll() { return [{ innerText: "1) Questão" }]; }, querySelector() { return null; } },
    outputWaitTimeoutMs: 1000,
    library: { appendPart() { return { id: "caderno-1", title: "Caderno pausável" }; } },
    extractPrintedQuestions() { return [{ id: "q1" }]; },
    persistProgress() {},
    recordEvent() {},
    writeState() {},
    waitFor() { return Promise.resolve(); },
    pageDiagnosticSnapshot() { return {}; },
    clean(value) { return String(value || ""); },
    cadernoUrl() { return "https://www.tecconcursos.com.br/questoes/cadernos/caderno-1"; },
    ensureRunning() { throw Object.assign(new Error("pausada"), { code: "AUTOMATION_PAUSED" }); },
    lockManager: { releaseLease() {} }
  });

  await assert.rejects(workflow.finishExportPart(state), error => error.code === "AUTOMATION_PAUSED");
  assert.equal(root.location.href, initialHref);
  assert.equal(state.export.job.rangeIndex, 0);
});
