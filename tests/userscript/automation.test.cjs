const test = require("node:test");
const assert = require("node:assert/strict");
const automation = require("../../src/userscript/automation.cjs");

test("divide a impressão em blocos de no máximo 200 questões", () => {
  assert.deepEqual(automation.splitRanges(400), [
    { start: 1, count: 200 },
    { start: 201, count: 200 }
  ]);
  assert.deepEqual(automation.splitRanges(401), [
    { start: 1, count: 200 },
    { start: 201, count: 200 },
    { start: 401, count: 1 }
  ]);
});

test("usa a mesma aba para evitar popup bloqueado durante a impressão automatizada", () => {
  const targets = [];
  const form = { setAttribute(name, value) { targets.push([name, value]); } };
  const documentNode = { querySelector() { return form; } };

  assert.equal(automation.preparePrintForm(documentNode, 0), true);
  assert.equal(automation.preparePrintForm(documentNode, 1), true);
  assert.deepEqual(targets, [["target", "_self"], ["target", "_self"]]);
});

test("mapeia o nome do menu para o título real do painel de filtros", () => {
  assert.equal(automation.filterHeadingLabel("Matéria e assunto"), "Matérias e assuntos");
  assert.equal(automation.filterHeadingLabel("Banca"), "Bancas");
  assert.equal(automation.filterHeadingLabel("Ano"), "Anos");
});

test("compara textos do TecConcursos sem depender de caixa alta aplicada por CSS", () => {
  assert.equal(automation.sameText("GERAR CADERNO", "Gerar Caderno"), true);
  assert.equal(automation.sameText("Imprimir", "IMPRIMIR"), true);
});

test("lê o contador de questões encontradas no strong correto", () => {
  const count = { nodeType: 1, innerText: "4036259", parentElement: { innerText: "4036259 questões encontradas" } };
  const documentNode = { querySelectorAll() { return [count]; } };
  assert.equal(automation.foundQuestionCount(documentNode), 4036259);
});

test("monta um snapshot diagnóstico curto da página atual", () => {
  const question = { innerText: "1) Questão de teste" };
  const documentNode = {
    readyState: "loading",
    title: "Saída HTML",
    body: { innerText: "conteúdo da página" },
    querySelectorAll(selector) { return selector === ".questao" ? [question] : []; },
    querySelector() { return null; }
  };
  const snapshot = automation.pageDiagnosticSnapshot({ location: { href: "https://www.tecconcursos.com.br/questoes/cadernos/1/imprimir", pathname: "/questoes/cadernos/1/imprimir" } }, documentNode);
  assert.equal(snapshot.questionNodeCount, 1);
  assert.equal(snapshot.readyState, "loading");
  assert.match(snapshot.href, /\/imprimir$/);
  assert.equal(snapshot.controls["#confirmar-button"].present, false);
});

test("mantém o painel de matéria reconhecível depois que a busca troca o cabeçalho para Nome", () => {
  const box = {
    getAttribute(name) { return name === "titulo" ? "Matérias e assuntos" : null; },
    querySelector() { return { innerText: "Nome:" }; },
    innerText: "Nome: Coerência. Coesão"
  };
  assert.equal(automation.searchBoxMatchesHeading(box, "Matéria e assunto"), true);
});

test("aceita matéria cujo title traz o caminho completo e o texto traz o assunto", () => {
  const node = {
    classList: { contains: (name) => name === "arvore-item-selecionado" },
    getAttribute(name) {
      return name === "title"
        ? "Língua Portuguesa (Português): Coerência. Coesão (Anáfora, Catáfora)"
        : null;
    },
    innerText: "Coerência. Coesão (Anáfora, Catáfora)"
  };
  assert.equal(automation.treeItemMatches(node, "Coerência. Coesão (Anáfora, Catáfora)"), true);
  const box = {
    querySelectorAll() { return [node]; }
  };
  assert.equal(automation.hasSelectedTreeItem(box, "Coerência. Coesão (Anáfora, Catáfora)"), true);
});

test("clica no contêiner Angular da árvore, não no texto decorativo", () => {
  const content = { id: "container-com-ng-click" };
  const label = { id: "span-decorativo" };
  const item = {
    querySelector(selector) {
      return selector === ".arvore-item-conteudo" ? content : label;
    }
  };
  assert.equal(automation.treeItemClickTarget(item), content);
});

test("resolve Objetiva para o nome real exibido pelo TecConcursos", () => {
  assert.deepEqual(automation.searchCandidates("Banca", "Objetiva"), [
    "Objetiva",
    "OBJETIVA CONCURSOS",
    "Objetiva Concursos"
  ]);
});

test("preserva o ID da pasta quando a página atual não possui idPasta na URL", () => {
  const values = new Map();
  const storage = {
    read(key, fallback) { return values.has(key) ? values.get(key) : fallback; },
    write(key, value) { values.set(key, value); }
  };
  const root = { location: { href: "https://www.tecconcursos.com.br/" } };
  const instance = automation.createAutomation({ root, document: {}, storage, library: {} });

  assert.equal(instance.defaultFolderId(), "");
  assert.equal(instance.saveFolderId("6423024"), "6423024");
  assert.equal(instance.defaultFolderId(), "6423024");

  root.location.href = "https://www.tecconcursos.com.br/questoes/filtrar?idPasta=6201578";
  assert.equal(instance.defaultFolderId(), "6201578");
});

test("persiste falha e informa que a execução pode ser retomada", () => {
  const values = new Map([[
    automation.STATE_KEY,
    { version: 1, running: true, creation: { index: 0, plan: { matters: [{}] } }, export: null }
  ]]);
  const storage = {
    read(key, fallback) { return values.has(key) ? values.get(key) : fallback; },
    write(key, value) { values.set(key, value); }
  };
  const instance = automation.createAutomation({ root: { location: { href: "https://www.tecconcursos.com.br/" } }, document: {}, storage, library: {} });

  assert.match(instance.fail(new Error("controle não apareceu")), /Falha na automação/);
  const state = values.get(automation.STATE_KEY);
  assert.equal(state.running, false);
  assert.equal(state.progress.phase, "error");
  assert.match(state.progress.message, /controle não apareceu/);
  assert.equal(instance.getProgress().stale, false);
});

test("confirma o valor do nome do caderno com blur para atualizar o ng-model", () => {
  const events = [];
  const input = {
    value: "",
    dispatchEvent(event) { events.push(event.type); }
  };
  assert.equal(automation.commitInputValue(input, "Coesão textual"), true);
  assert.equal(input.value, "Coesão textual");
  assert.deepEqual(events, ["input", "change", "blur"]);
});

test("clica no campo e preenche o nome usando o título do plano", () => {
  const actions = [];
  const events = [];
  const input = {
    value: "",
    click() { actions.push("click"); },
    focus() { actions.push("focus"); },
    dispatchEvent(event) { events.push(event.type); }
  };

  assert.equal(automation.fillCadernoName({}, input, "Concordância verbal - Base FCC"), true);
  assert.deepEqual(actions, ["click", "focus"]);
  assert.equal(input.value, "Concordância verbal - Base FCC");
  assert.deepEqual(events, ["input", "change", "blur"]);
});

test("aciona o manipulador Angular quando o clique comum não seleciona o item", () => {
  let calls = 0;
  const target = {};
  const scope = {
    vm: { notificarClick() { calls += 1; } },
    $apply(callback) { callback(); }
  };
  const documentNode = {
    defaultView: {
      angular: {
        element(node) {
          assert.equal(node, target);
          return { isolateScope() { return scope; } };
        }
      }
    }
  };
  const item = { querySelector() { return target; } };
  assert.equal(automation.invokeAngularTreeItem(documentNode, item), true);
  assert.equal(calls, 1);
});

function sharedAutomationStorage(initial) {
  const values = new Map(Object.entries(initial || {}));
  return {
    read(key, fallback) { return values.has(key) ? values.get(key) : fallback; },
    write(key, value) { values.set(key, value); },
    remove(key) { values.delete(key); },
    values
  };
}

function automationRoot(ownerId) {
  const sessionValues = new Map([[automation.OWNER_SESSION_KEY, ownerId]]);
  return {
    location: { href: "https://www.tecconcursos.com.br/", pathname: "/" },
    sessionStorage: {
      getItem(key) { return sessionValues.has(key) ? sessionValues.get(key) : null; },
      setItem(key, value) { sessionValues.set(key, String(value)); }
    }
  };
}

test("impede que duas abas retomem a mesma execução ao mesmo tempo", async () => {
  const state = {
    version: 1,
    runId: "run-concorrente",
    running: true,
    creation: { index: 0, plan: { matters: [{}] } },
    export: null,
    progress: { phase: "starting", message: "Aguardando" }
  };
  const storage = sharedAutomationStorage({ [automation.STATE_KEY]: state });
  const first = automation.createAutomation({ root: automationRoot("tab-a"), document: {}, storage, library: {} });
  const second = automation.createAutomation({ root: automationRoot("tab-b"), document: {}, storage, library: {} });

  await first.resume();
  const blockedMessage = await second.resume();

  assert.match(blockedMessage, /Outra aba está executando/);
  assert.equal(second.getProgress().lockedByOtherTab, true);
  assert.equal(second.getProgress().ownsLock, false);
});

test("permite takeover explícito de uma execução pendente", async () => {
  const state = {
    version: 1,
    runId: "run-takeover",
    running: true,
    creation: { index: 0, plan: { matters: [{}] } },
    export: null,
    progress: { phase: "starting", message: "Aguardando" }
  };
  const storage = sharedAutomationStorage({
    [automation.STATE_KEY]: state,
    [automation.LOCK_KEY]: {
      version: 1,
      ownerId: "tab-antiga",
      runId: "run-takeover",
      acquiredAt: Date.now(),
      heartbeatAt: Date.now(),
      expiresAt: Date.now() + automation.LOCK_LEASE_MS
    }
  });
  const second = automation.createAutomation({ root: automationRoot("tab-nova"), document: {}, storage, library: {} });

  const message = await second.takeover();

  assert.doesNotMatch(message, /Outra aba está executando/);
  assert.equal(second.getProgress().ownsLock, true);
  assert.equal(storage.values.get(automation.LOCK_KEY).ownerId, "tab-nova");
});

test("retoma automaticamente quando o lease anterior expirou", async () => {
  const state = {
    version: 1,
    runId: "run-expirado",
    running: true,
    creation: { index: 0, plan: { matters: [{}] } },
    export: null,
    progress: { phase: "starting", message: "Aguardando" }
  };
  const storage = sharedAutomationStorage({
    [automation.STATE_KEY]: state,
    [automation.LOCK_KEY]: {
      version: 1,
      ownerId: "tab-fechada",
      runId: "run-expirado",
      acquiredAt: Date.now() - 60000,
      heartbeatAt: Date.now() - 60000,
      expiresAt: Date.now() - 1
    }
  });
  const instance = automation.createAutomation({ root: automationRoot("tab-recuperada"), document: {}, storage, library: {} });

  await instance.resume();

  assert.equal(instance.getProgress().ownsLock, true);
  assert.equal(storage.values.get(automation.LOCK_KEY).ownerId, "tab-recuperada");
});
