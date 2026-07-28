const test = require("node:test");
const assert = require("node:assert/strict");
const automation = require("../../src/userscript/automation.cjs");
const lockModule = require("../../src/userscript/automation-lock.cjs");

function storageStub(initial) {
  const values = new Map(Object.entries(initial || {}));
  return {
    values,
    read(key, fallback) { return values.has(key) ? values.get(key) : fallback; },
    write(key, value) { values.set(key, value); },
    remove(key) { values.delete(key); }
  };
}

function rootStub(ownerId, href, BroadcastChannelCtor) {
  const location = new URL(href || "https://www.tecconcursos.com.br/");
  const values = new Map([[automation.OWNER_SESSION_KEY, ownerId || "tab-lifecycle"]]);
  return {
    location: { href: location.href, pathname: location.pathname },
    BroadcastChannel: BroadcastChannelCtor,
    sessionStorage: {
      getItem(key) { return values.has(key) ? values.get(key) : null; },
      setItem(key, value) { values.set(key, String(value)); }
    }
  };
}

function broadcastChannelCtor() {
  const channels = new Set();
  return class FakeBroadcastChannel {
    constructor(name) { this.name = name; this.listeners = new Set(); channels.add(this); }
    addEventListener(type, listener) { if (type === "message") this.listeners.add(listener); }
    postMessage(data) {
      for (const peer of channels) {
        if (peer === this || peer.name !== this.name) continue;
        setTimeout(() => peer.listeners.forEach(listener => listener({ data })), 0);
      }
    }
    close() { channels.delete(this); this.listeners.clear(); }
  };
}

function documentStub() {
  return {
    readyState: "complete",
    title: "TecConcursos",
    body: { innerText: "" },
    querySelector() { return null; },
    querySelectorAll() { return []; }
  };
}

function pendingState(runId) {
  return {
    version: 1,
    runId,
    running: true,
    creation: { index: 0, phase: "prepare", plan: { matters: [{}] } },
    export: null,
    progress: { phase: "starting", message: "Iniciada" }
  };
}

test("pausa uma execução proprietária, persiste o estado e libera o lease", async () => {
  const storage = storageStub({ [automation.STATE_KEY]: pendingState("run-pause") });
  const instance = automation.createAutomation({ root: rootStub(), document: documentStub(), storage, library: {} });

  await instance.resume();
  const message = instance.pause();
  const saved = storage.values.get(automation.STATE_KEY);

  assert.match(message, /pausada/i);
  assert.equal(saved.running, false);
  assert.equal(saved.progress.phase, "paused");
  assert.match(saved.progress.message, /retomada/i);
  assert.equal(storage.values.has(automation.LOCK_KEY), false);
});

test("falha uma vez, preserva diagnóstico e torna a segunda chamada idempotente", async () => {
  const storage = storageStub({ [automation.STATE_KEY]: pendingState("run-fail") });
  const instance = automation.createAutomation({ root: rootStub(), document: documentStub(), storage, library: {} });

  await instance.resume();
  const firstMessage = instance.fail(new Error("controle ausente"));
  const firstState = storage.values.get(automation.STATE_KEY);
  const eventCount = firstState.progress.events.length;
  const secondMessage = instance.fail(new Error("erro diferente"));
  const secondState = storage.values.get(automation.STATE_KEY);

  assert.match(firstMessage, /Falha na automação/);
  assert.equal(firstState.running, false);
  assert.equal(firstState.progress.phase, "error");
  assert.match(firstState.progress.message, /controle ausente/);
  assert.equal(secondMessage, firstMessage);
  assert.equal(secondState.progress.events.length, eventCount);
  assert.match(secondState.progress.message, /controle ausente/);
});

test("estado corrompido volta ao estado pronto sem iniciar uma execução falsa", () => {
  const storage = storageStub({ [automation.STATE_KEY]: [] });
  const instance = automation.createAutomation({ root: rootStub(), document: documentStub(), storage, library: {} });

  assert.deepEqual(instance.getState(), { version: 1, running: false, creation: null, export: null });
  assert.equal(instance.status(), "Pronto.");
  assert.throws(() => instance.resumePaused(), /não há uma automação pausada/i);
});

test("retoma a criação a partir da página de pastas e reabre os filtros", async () => {
  const filterUrl = "https://www.tecconcursos.com.br/questoes/filtrar?idPasta=6423024";
  const storage = storageStub({
    [automation.STATE_KEY]: {
      version: 1,
      runId: "run-folder-resume",
      running: false,
      creation: {
        folderId: "6423024",
        filterUrl,
        index: 1,
        phase: "prepare",
        plan: { matters: [{ code: "MAT-002", title: "Concordância verbal - Base FCC" }] }
      },
      export: null,
      progress: { phase: "error", message: "Falha anterior" }
    }
  });
  const root = rootStub("tab-folder", "https://www.tecconcursos.com.br/questoes/pastas/6423024");
  const instance = automation.createAutomation({ root, document: documentStub(), storage, library: {} });

  const message = await instance.resumePaused();
  const saved = storage.values.get(automation.STATE_KEY);

  assert.match(message, /página de filtros/i);
  assert.equal(root.location.href, filterUrl);
  assert.equal(saved.running, true);
  assert.equal(saved.progress.phase, "opening-filter");
  assert.match(saved.progress.message, /retomar/i);
});

test("interrompe um passo quando o estado foi pausado pelo menu", async () => {
  const storage = storageStub({ [automation.STATE_KEY]: pendingState("run-guard") });
  const instance = automation.createAutomation({ root: rootStub(), document: documentStub(), storage, library: {} });

  await instance.resume();
  const snapshot = JSON.parse(JSON.stringify(instance.getState()));
  instance.pause();

  assert.throws(() => instance.ensureRunning(snapshot), error => error.code === "AUTOMATION_PAUSED");
});

test("não transforma a pausa em erro quando o guard interrompe o passo", async () => {
  const storage = storageStub({ [automation.STATE_KEY]: pendingState("run-guard-fail") });
  const instance = automation.createAutomation({ root: rootStub(), document: documentStub(), storage, library: {} });

  await instance.resume();
  instance.pause();
  const error = Object.assign(new Error("Automação pausada"), { code: "AUTOMATION_PAUSED" });
  instance.fail(error);

  assert.equal(storage.values.get(automation.STATE_KEY).progress.phase, "paused");
});

test("pausa a execução depois de um minuto sem a página ativa", async () => {
  const storage = storageStub({ [automation.STATE_KEY]: pendingState("run-inactivity") });
  const instance = automation.createAutomation({ root: rootStub(), document: documentStub(), storage, library: {} });

  await instance.resume();
  const message = instance.pauseForInactivity();
  const saved = storage.values.get(automation.STATE_KEY);

  assert.match(message, /inatividade/i);
  assert.equal(saved.running, false);
  assert.equal(saved.progress.phase, "paused");
  assert.match(saved.progress.message, /1 minuto/i);
  assert.equal(storage.values.has(automation.LOCK_KEY), false);
});

test("não retoma automaticamente quando o lease expirou após o fechamento da aba", async () => {
  const storage = storageStub({
    [automation.STATE_KEY]: {
      ...pendingState("run-closed-tab"),
      ownerId: "tab-closed",
      progress: { phase: "opening-caderno", message: "Execução anterior" }
    },
    [automation.LOCK_KEY]: {
      ownerId: "tab-closed",
      runId: "run-closed-tab",
      expiresAt: Date.now() - 60001
    }
  });
  const root = rootStub("tab-closed", "https://www.tecconcursos.com.br/questoes/pastas/6423024");
  const instance = automation.createAutomation({ root, document: documentStub(), storage, library: {} });

  const message = await instance.resumeOnPageLoad();
  const saved = storage.values.get(automation.STATE_KEY);

  assert.match(message, /retomar/i);
  assert.equal(saved.running, false);
  assert.equal(saved.progress.phase, "paused");
});

test("não retoma automaticamente uma execução antiga ao reabrir o site", async () => {
  const href = "https://www.tecconcursos.com.br/questoes/pastas/6423024";
  const storage = storageStub({
    [automation.STATE_KEY]: {
      version: 1,
      runId: "run-reopened",
      ownerId: "old-tab",
      running: true,
      creation: {
        folderId: "6423024",
        filterUrl: "https://www.tecconcursos.com.br/questoes/filtrar?idPasta=6423024",
        index: 0,
        phase: "prepare",
        plan: { matters: [{}] }
      },
      export: null,
      progress: { phase: "opening-filter", message: "Execução anterior" }
    }
  });
  const root = rootStub("new-tab", href);
  const instance = automation.createAutomation({ root, document: documentStub(), storage, library: {} });

  const message = await instance.resumeOnPageLoad();
  const saved = storage.values.get(automation.STATE_KEY);

  assert.match(message, /retomar/i);
  assert.equal(saved.running, false);
  assert.equal(saved.progress.phase, "paused");
  assert.equal(root.location.href, href);
});

test("encaminha o Parar do Tampermonkey e pausa a aba proprietária", async () => {
  const BroadcastChannelCtor = broadcastChannelCtor();
  const storage = storageStub({
    [automation.STATE_KEY]: Object.assign(pendingState("run-menu-forward"), { ownerId: "tab-owner" }),
    [automation.LOCK_KEY]: { ownerId: "tab-owner", runId: "run-menu-forward", expiresAt: Date.now() + lockModule.LOCK_LEASE_MS }
  });
  const owner = automation.createAutomation({ root: rootStub("tab-owner", undefined, BroadcastChannelCtor), document: documentStub(), storage, library: {} });
  const requester = automation.createAutomation({ root: rootStub("tab-requester", undefined, BroadcastChannelCtor), document: documentStub(), storage, library: {} });

  const message = requester.pause("tampermonkey-menu");
  await new Promise(resolve => setTimeout(resolve, 15));
  const saved = storage.values.get(automation.STATE_KEY);

  assert.match(message, /solicitada/i);
  assert.equal(saved.running, false);
  assert.equal(saved.progress.phase, "paused");
  assert.equal(storage.values.has(automation.LOCK_KEY), false);
  void owner;
});

test("retoma a exportação a partir da página de pastas e reabre o caderno salvo", async () => {
  const cadernoId = "99279456";
  const cadernoUrl = "https://www.tecconcursos.com.br/questoes/cadernos/" + cadernoId;
  const storage = storageStub({
    [automation.STATE_KEY]: {
      version: 1,
      runId: "run-export-folder-resume",
      running: false,
      creation: {
        index: 2,
        phase: "exporting",
        plan: { matters: [{}, {}, {}] },
        current: { code: "MAT-003", title: "Confronto de frases" }
      },
      export: {
        job: {
          cadernoId,
          title: "Confronto de frases",
          ranges: [{ start: 1, count: 200 }],
          rangeIndex: 0
        }
      },
      progress: { phase: "error", message: "A saída de impressão falhou." }
    }
  });
  const root = rootStub("tab-export-folder", "https://www.tecconcursos.com.br/questoes/pastas/6423024");
  const instance = automation.createAutomation({ root, document: documentStub(), storage, library: {} });

  const message = await instance.resumePaused();
  const saved = storage.values.get(automation.STATE_KEY);

  assert.match(message, /caderno/i);
  assert.equal(root.location.href, cadernoUrl);
  assert.equal(saved.running, true);
  assert.equal(saved.progress.phase, "opening-caderno");
  assert.match(saved.progress.message, /retomar/i);
});
