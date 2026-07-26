const test = require("node:test");
const assert = require("node:assert/strict");
const diagnosticsModule = require("../../src/userscript/automation-diagnostics.cjs");

function createHarness() {
  let now = 1000;
  let writes = 0;
  const state = { running: true, progress: {} };
  const diagnostics = diagnosticsModule.createDiagnostics({
    root: { location: { href: "https://example.test/questoes/filtrar" } },
    ownerId: "tab-test",
    staleAfterMs: 90000,
    now: () => now,
    readState: () => state,
    writeState: () => { writes += 1; return state; },
    lockManager: { lockInfo: () => ({ ownerId: "tab-test", ownsLock: true, active: true, lockedByOtherTab: false }) },
    status: () => "Em execução",
    pageDiagnosticSnapshot: () => ({})
  });
  return {
    state,
    diagnostics,
    get writes() { return writes; },
    advance(ms) { now += ms; }
  };
}

test("não grava o mesmo progresso duas vezes", () => {
  const harness = createHarness();

  harness.diagnostics.persistProgress(harness.state, { phase: "filtering", message: "Selecionando FCC" });
  harness.diagnostics.persistProgress(harness.state, { phase: "filtering", message: "Selecionando FCC" });

  assert.equal(harness.writes, 1);
});

test("coalesce progresso intermediário e persiste fase crítica imediatamente", () => {
  const harness = createHarness();

  harness.diagnostics.persistProgress(harness.state, { phase: "waiting-output", message: "Aguardando 1/200" });
  harness.advance(100);
  harness.diagnostics.persistProgress(harness.state, { phase: "waiting-output", message: "Aguardando 2/200" });
  assert.equal(harness.writes, 1);

  harness.advance(1000);
  harness.diagnostics.persistProgress(harness.state, { phase: "waiting-output", message: "Aguardando 3/200" });
  assert.equal(harness.writes, 2);

  harness.advance(100);
  harness.diagnostics.persistProgress(harness.state, { phase: "error", message: "Falha" });
  assert.equal(harness.writes, 3);
});
