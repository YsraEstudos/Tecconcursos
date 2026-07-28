const test = require("node:test");
const assert = require("node:assert/strict");
const filters = require("../../src/userscript/automation-filters.cjs");
const orchestratorModule = require("../../src/userscript/automation-orchestrator.cjs");
const automation = require("../../src/userscript/automation.cjs");

test("localiza um caderno pelo nome e não trata uma pasta como caderno", () => {
  const target = { href: "https://www.tecconcursos.com.br/questoes/cadernos/99279370", innerText: "Concordância verbal - Base FCC" };
  const documentNode = {
    querySelectorAll(selector) {
      assert.equal(selector, "a[href*='/questoes/cadernos/']");
      return [target];
    }
  };

  assert.equal(filters.findCadernoLinkByTitle(documentNode, "Concordância verbal - Base FCC"), target);
  assert.equal(filters.findCadernoLinkByTitle(documentNode, "TI"), null);
});

test("reiniciar a busca começa pela pasta e marca a execução para reutilizar cadernos existentes", () => {
  const values = new Map();
  const storage = {
    read(key, fallback) { return values.has(key) ? values.get(key) : fallback; },
    write(key, value) { values.set(key, value); },
    remove(key) { values.delete(key); }
  };
  const root = {
    location: { href: "https://www.tecconcursos.com.br/", pathname: "/", origin: "https://www.tecconcursos.com.br" },
    sessionStorage: { getItem() { return "tab-restart"; }, setItem() {} }
  };
  const instance = automation.createAutomation({ root, document: {}, storage, library: {} });
  instance.savePlan({ matters: [{ code: "MAT-001", title: "Concordância verbal - Base FCC", group: "Português" }] });

  const message = instance.restartMaterialSearch("6423024");
  const state = values.get(automation.STATE_KEY);

  assert.match(message, /pasta/i);
  assert.equal(state.creation.reuseExistingCadernos, true);
  assert.equal(state.creation.folderUrl, "https://www.tecconcursos.com.br/questoes/pastas/6423024");
  assert.equal(root.location.href, state.creation.folderUrl);
});

test("retomada na pasta abre o caderno existente em vez de voltar aos filtros", async () => {
  const state = {
    running: true,
    creation: {
      reuseExistingCadernos: true,
      folderUrl: "https://www.tecconcursos.com.br/questoes/pastas/6423024",
      filterUrl: "https://www.tecconcursos.com.br/questoes/filtrar?idPasta=6423024",
      index: 0,
      phase: "prepare",
      plan: { matters: [{ code: "MAT-001", title: "Concordância verbal - Base FCC", group: "Português" }] }
    },
    export: null,
    progress: {}
  };
  const root = { location: { href: state.creation.folderUrl, pathname: "/questoes/pastas/6423024" } };
  const existingLink = { href: "https://www.tecconcursos.com.br/questoes/cadernos/99279370" };
  const context = {
    root,
    document: {},
    readState() { return state; },
    lockManager: { acquireLease() { return { acquired: true }; } },
    ensureRunning() {},
    recordEvent() {},
    writeState() {},
    persistProgress(current, patch) { current.progress = Object.assign({}, current.progress, patch); },
    pageDiagnosticSnapshot() { return {}; },
    isPrintPage() { return false; },
    isCadernoPage() { return false; },
    isFilterPage() { return false; },
    isFolderPage() { return true; },
    isFolderPageReady() { return true; },
    findCadernoLinkByTitle() { return existingLink; },
    cadernoIdFromLocation() { return "99279370"; },
    cadernoUrl(_root, id) { return "https://www.tecconcursos.com.br/questoes/cadernos/" + id; },
    status() { return "Pronto."; }
  };

  await orchestratorModule.createOrchestrator(context).resume();

  assert.equal(root.location.href, existingLink.href);
  assert.equal(state.creation.phase, "awaiting-existing-caderno");
  assert.equal(state.creation.current.cadernoId, "99279370");
});
