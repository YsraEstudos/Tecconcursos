const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const projectRoot = path.resolve(__dirname, "../..");
const bundle = fs.readFileSync(path.join(projectRoot, "tecconcursos-scraper.user.js"), "utf8");
const stateKey = "tecconcursos_caderno_automation_v2";
const libraryKey = "tecconcursos_export_library_index_v1";
const libraryEntryPrefix = "tecconcursos_export_library_entry_v1:";
const planKey = "tecconcursos_caderno_plan_v1";

function cadernoIdFor(total) {
  return String(9000000 + Number(total));
}

function totalForCaderno(id) {
  return Number(id) - 9000000;
}

function questionHtml(number) {
  return [
    '<div class="questao">',
    '<div class="cabecalho"><div class="informacoes"><div>FCC - Vaga E2E (Órgão E2E)/Órgão E2E/Analista/2025</div></div></div>',
    '<div class="classificacao">Língua Portuguesa - Coesão textual</div>',
    '<div class="enunciado"><strong>', number, ') </strong>Enunciado da questão ', number, '</div>',
    '<button class="alternativa">A) Alternativa A da questão ', number, '</button>',
    '<button class="alternativa">B) Alternativa B da questão ', number, '</button>',
    '<button class="alternativa">C) Alternativa C da questão ', number, '</button>',
    '<div class="gabarito">A</div>',
    '<a href="/questoes/', number, '">Questão</a>',
    '</div>'
  ].join("");
}

function cadernoPage(id, metadata) {
  const total = metadata ? metadata.count : totalForCaderno(id);
  const title = metadata ? metadata.title : "Caderno E2E " + total;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${title}</title><script src="/bundle.js"></script></head><body>
    <h1>${title}</h1>
    <div role="button" tabindex="0" id="print-tab" ng-click="main.onSelecionarAba(main.abas.IMPRESSAO, $event)">Imprimir</div>
    <div id="configurar-impressao" style="display:none"><form action="/questoes/cadernos/${id}/imprimir" method="get" target="_blank">
      <input id="questoesSequenciais" type="radio" checked>
      <input id="questaoInicialInput" type="number" min="1" max="${total}" value="1">
      <input id="numeroQuestoesInput" type="number" min="1" max="200" value="200">
      <button id="confirmar-button" type="submit">Imprimir Caderno</button>
    </form></div>
    <script>
      document.getElementById("print-tab").addEventListener("click", function () {
        document.getElementById("configurar-impressao").style.display = "block";
      });
      document.querySelector("#configurar-impressao form").addEventListener("submit", function (event) {
        event.preventDefault();
        var start = document.getElementById("questaoInicialInput").value;
        var count = document.getElementById("numeroQuestoesInput").value;
        window.location.href = "/questoes/cadernos/${id}/imprimir?start=" + encodeURIComponent(start) + "&count=" + encodeURIComponent(count);
      });
    </script>
  </body></html>`;
}

function folderPage(id, cadernos) {
  const items = (cadernos || []).map(item => `<li><div class="listagem-corpo-item"><div class="list-item-caderno"><span class="nome"><a href="/questoes/cadernos/${item.id}">${item.title}</a></span></div></div></li>`).join("");
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Pasta E2E</title><script src="/bundle.js"></script></head><body>
    <ul class="listagem-corpo"><input type="hidden" name="pastaAtualId" value="${id}">${items}</ul>
  </body></html>`;
}

function filterPage() {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Filtros E2E</title><script src="/bundle.js"></script></head><body>
    <div class="menu-alternador-opcao">Matéria e assunto</div>
    <div class="menu-alternador-opcao">Banca</div>
    <div class="menu-alternador-opcao">Ano</div>
    <div class="gerador-buscador" titulo="Matérias e assuntos"><a>Pesquisar por nome</a><input ng-model="vm.textoBusca"><div class="arvore-item" title="Coesão textual"><div class="arvore-item-conteudo"><span class="arvore-item-nome">Coesão textual</span></div></div></div>
    <div class="gerador-buscador" titulo="Bancas"><a>Pesquisar por nome</a><input ng-model="vm.textoBusca"><div class="arvore-item" title="FCC"><div class="arvore-item-conteudo"><span class="arvore-item-nome">FCC</span></div></div></div>
    <div class="gerador-buscador" titulo="Anos"><div class="arvore-item" title="2025"><div class="arvore-item-conteudo"><span class="arvore-item-nome">2025</span></div></div></div>
    <strong>400</strong><span> questões encontradas</span>
    <input id="nomeCadernoId" type="text" name="nomeCaderno">
    <select id="pastaCadernosId"><option value="42">Pasta E2E</option></select>
    <button type="button">Gerar Caderno</button>
    <script>
      Array.from(document.querySelectorAll(".arvore-item-conteudo")).forEach(function (node) {
        node.addEventListener("click", function () { node.parentElement.classList.add("arvore-item-selecionado"); });
      });
      document.querySelector("button").addEventListener("click", function () { window.location.href = "/questoes/cadernos/9000400"; });
    </script>
  </body></html>`;
}

function multiMatterFilterPage(matters) {
  const banks = ["FCC", "Fundatec", "Vunesp", "Cesgranrio", "FGV", "Legalle", "Fundação La Salle", "Instituto AOCP", "Objetiva"];
  const years = [2023, 2020, 2022, 2018, 2025, 2021, 2017, 2024, 2019, 2026, 2016];
  const matterItems = matters.map(matter => `<div class="arvore-item" title="${matter.topic}" data-kind="matter" data-code="${matter.code}"><div class="arvore-item-conteudo"><span class="arvore-item-nome">${matter.topic}</span></div></div>`).join("");
  const bankItems = banks.map(bank => `<div class="arvore-item" title="${bank}" data-kind="bank" data-value="${bank}"><div class="arvore-item-conteudo"><span class="arvore-item-nome">${bank}</span></div></div>`).join("");
  const yearItems = years.map(year => `<div class="arvore-item" title="${year}" data-kind="year" data-value="${year}"><div class="arvore-item-conteudo"><span class="arvore-item-nome">${year}</span></div></div>`).join("");
  const matterData = JSON.stringify(Object.fromEntries(matters.map(matter => [matter.code, { id: matter.id, count: matter.count }])));
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Filtros múltiplos E2E</title><script src="/bundle.js"></script></head><body>
    <div class="menu-alternador-opcao">Matéria e assunto</div>
    <div class="menu-alternador-opcao">Banca</div>
    <div class="menu-alternador-opcao">Ano</div>
    <div class="gerador-buscador" titulo="Matérias e assuntos"><a>Pesquisar por nome</a><input ng-model="vm.textoBusca">${matterItems}</div>
    <div class="gerador-buscador" titulo="Bancas"><a>Pesquisar por nome</a><input ng-model="vm.textoBusca">${bankItems}</div>
    <div class="gerador-buscador" titulo="Anos">${yearItems}</div>
    <strong id="found-count">0</strong><span> questões encontradas</span>
    <div><button role="button" class="link-atalho">Remover anuladas</button><button role="button" class="link-atalho">Remover desatualizadas</button></div>
    <input id="nomeCadernoId" type="text" name="nomeCaderno">
    <select id="pastaCadernosId"><option value="42">Pasta E2E múltipla</option></select>
    <button type="button" id="generate-caderno">Gerar Caderno</button>
    <script>
      var matterData = ${matterData};
      var filterState = { matter: "", banks: [], years: [], removed: [] };
      function updateCount() { document.getElementById("found-count").textContent = matterData[filterState.matter] ? matterData[filterState.matter].count : "0"; }
      Array.from(document.querySelectorAll(".arvore-item-conteudo")).forEach(function (node) {
        node.addEventListener("click", function () {
          var item = node.parentElement;
          item.classList.add("arvore-item-selecionado");
          var kind = item.dataset.kind;
          if (kind === "matter") { filterState.matter = item.dataset.code; updateCount(); }
          if (kind === "bank" && filterState.banks.indexOf(item.dataset.value) < 0) filterState.banks.push(item.dataset.value);
          if (kind === "year" && filterState.years.indexOf(item.dataset.value) < 0) filterState.years.push(item.dataset.value);
        });
      });
      Array.from(document.querySelectorAll(".link-atalho")).forEach(function (node) {
        node.addEventListener("click", function () { if (filterState.removed.indexOf(node.textContent.trim()) < 0) filterState.removed.push(node.textContent.trim()); });
      });
      document.getElementById("generate-caderno").addEventListener("click", function () {
        var current = matterData[filterState.matter];
        if (!current) return;
        var query = "?matter=" + encodeURIComponent(filterState.matter) + "&banks=" + encodeURIComponent(JSON.stringify(filterState.banks)) + "&years=" + encodeURIComponent(JSON.stringify(filterState.years)) + "&removed=" + encodeURIComponent(JSON.stringify(filterState.removed));
        window.location.href = "/questoes/cadernos/" + current.id + query;
      });
    </script>
  </body></html>`;
}

function outputPage(id, start, count, options) {
  const config = options || {};
  const metadata = config.meta || {};
  const bank = metadata.bank || "FCC";
  const vacancy = metadata.vacancy || "Vaga E2E (Órgão E2E)";
  const organization = metadata.organization || "Órgão E2E";
  const role = metadata.role || "Analista";
  const subject = metadata.subject || "Língua Portuguesa";
  const topic = metadata.topic || "Coesão textual";
  const failureScript = config.failExtraction
    ? `<script>
        window.__fixtureFailureApplied = true;
        window.TecConcursosModules.library.extractPrintedQuestions = function () {
          throw new Error("Falha E2E simulada na extração da parte iniciada em ${Number(start)}.");
        };
        window.TecConcursosModules.library.extractPrintedQuestionsAsync = function () {
          throw new Error("Falha E2E simulada na extração da parte iniciada em ${Number(start)}.");
        };
      </script>`
      : "";
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Imprimir Caderno</title><script src="/bundle.js"></script></head><body>
    <h1>Caderno E2E - saída de impressão</h1><div id="prova-conteudo"></div>
    ${failureScript}
    <script>
      var container = document.getElementById("prova-conteudo");
      var current = 0;
      var start = ${Number(start)};
      var count = ${Number(count)};
      function appendQuestion() {
        var batchEnd = Math.min(count, current + 25);
        while (current < batchEnd) {
          var number = start + current;
          var html = '<div class="questao"><div class="cabecalho"><div class="informacoes"><div>${bank} - ${vacancy}/${organization}/${role}/${metadata.year || 2025}</div></div></div><div class="classificacao">${subject} - ${topic}</div><div class="enunciado"><strong>' + number + ') </strong>Enunciado da questão ' + number + '</div><button class="alternativa">A) Alternativa A da questão ' + number + '</button><button class="alternativa">B) Alternativa B da questão ' + number + '</button><button class="alternativa">C) Alternativa C da questão ' + number + '</button><div class="gabarito">A</div><a href="/questoes/' + number + '">Questão</a></div>';
          container.insertAdjacentHTML("beforeend", html);
          current += 1;
        }
        if (current >= count) {
          window.__printCalls = (window.__printCalls || 0) + 1;
          window.print();
          return;
        }
        setTimeout(appendQuestion, 5);
      }
       setTimeout(appendQuestion, 35);
    </script>
  </body></html>`;
}

function startFixtureServer(options) {
  const config = options || {};
  const failedStarts = new Set();
  const failedParts = new Set();
  const multiById = new Map((config.multiMatters || []).map(matter => [String(matter.id), matter]));
  const folderById = new Map(Object.entries(config.folderCadernos || {}));
  const stats = { printRequests: [], creationRequests: [] };
  const server = http.createServer((request, response) => {
    const parsed = new URL(request.url, "http://127.0.0.1");
    if (parsed.pathname === "/bundle.js") {
      response.writeHead(200, { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-store" });
      response.end(bundle);
      return;
    }
    const folderMatch = parsed.pathname.match(/^\/questoes\/pastas\/(\d+)$/);
    if (folderMatch) {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      response.end(folderPage(folderMatch[1], folderById.get(folderMatch[1]) || []));
      return;
    }
    const match = parsed.pathname.match(/^\/questoes\/cadernos\/(\d+)(\/imprimir)?$/);
    if (parsed.pathname === "/questoes/filtrar") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      response.end(config.multiMatters ? multiMatterFilterPage(config.multiMatters) : filterPage());
      return;
    }
    if (!match) {
      response.writeHead(404);
      response.end("not found");
      return;
    }
    const id = match[1];
    response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
    if (match[2]) {
      const start = Number(parsed.searchParams.get("start") || 1);
      const count = Number(parsed.searchParams.get("count") || 0);
      const partKey = id + ":" + start;
      const failOnce = (Array.isArray(config.failOnceStarts) && config.failOnceStarts.includes(start) && !failedStarts.has(start)) || (Array.isArray(config.failOnceParts) && config.failOnceParts.includes(partKey) && !failedParts.has(partKey));
      if (failOnce) failedStarts.add(start);
      if (failOnce) failedParts.add(partKey);
      stats.printRequests.push({ id, start, count, failOnce });
      response.end(outputPage(id, start, count, { failExtraction: failOnce, meta: multiById.get(id) }));
    } else {
      if (multiById.has(id) && parsed.searchParams.has("matter")) {
        const parseJson = value => {
          try { return JSON.parse(value || "[]"); } catch (_) { return []; }
        };
        stats.creationRequests.push({
          id,
          matter: parsed.searchParams.get("matter"),
          banks: parseJson(parsed.searchParams.get("banks")),
          years: parseJson(parsed.searchParams.get("years")).map(Number),
          removed: parseJson(parsed.searchParams.get("removed"))
        });
      }
      response.end(cadernoPage(id, multiById.get(id)));
    }
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({ server, origin: `http://127.0.0.1:${address.port}`, stats });
    });
  });
}

test("mantém a página ociosa sem polling frequente quando a automação está parada", { timeout: 120000 }, async () => {
  const fixture = await startFixtureServer();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await context.addInitScript(() => {
    window.__tecPerformance = { storageReads: 0, storageWrites: 0, querySelectorAllCalls: 0, longTasks: [], clickToPaintMs: [], tabSwitchToPaintMs: [] };
    const originalGetItem = Storage.prototype.getItem;
    const originalSetItem = Storage.prototype.setItem;
    const originalQuerySelectorAll = Document.prototype.querySelectorAll;
    const originalElementQuerySelectorAll = Element.prototype.querySelectorAll;
    Storage.prototype.getItem = function (...args) {
      window.__tecPerformance.storageReads += 1;
      return originalGetItem.apply(this, args);
    };
    Storage.prototype.setItem = function (...args) {
      window.__tecPerformance.storageWrites += 1;
      return originalSetItem.apply(this, args);
    };
    Document.prototype.querySelectorAll = function (...args) {
      window.__tecPerformance.querySelectorAllCalls += 1;
      return originalQuerySelectorAll.apply(this, args);
    };
    Element.prototype.querySelectorAll = function (...args) {
      window.__tecPerformance.querySelectorAllCalls += 1;
      return originalElementQuerySelectorAll.apply(this, args);
    };
    if (typeof PerformanceObserver === "function") {
      const observer = new PerformanceObserver(list => {
        window.__tecPerformance.longTasks.push(...list.getEntries().map(entry => entry.duration));
      });
      observer.observe({ type: "longtask", buffered: true });
    }
  });
  const page = await context.newPage();
  try {
    await page.goto(`${fixture.origin}/questoes/cadernos/1`, { waitUntil: "domcontentloaded" });
    await page.locator("#tec-library-launcher").waitFor();
    await page.evaluate(async () => {
      const measureClickToPaint = (element, target) => new Promise(resolve => {
        const startedAt = performance.now();
        element.click();
        requestAnimationFrame(() => {
          target.push(performance.now() - startedAt);
          resolve();
        });
      });
      const launcher = document.getElementById("tec-library-launcher");
      const panel = document.getElementById("tec-library-panel");
      const close = panel.querySelector("[data-action='close']");
      for (let index = 0; index < 3; index += 1) {
        await measureClickToPaint(launcher, window.__tecPerformance.clickToPaintMs);
        await measureClickToPaint(close, window.__tecPerformance.clickToPaintMs);
      }
      await measureClickToPaint(launcher, window.__tecPerformance.clickToPaintMs);
      for (const tabName of ["library", "ai-context", "automation"]) {
        await measureClickToPaint(panel.querySelector(`[data-tab='${tabName}']`), window.__tecPerformance.tabSwitchToPaintMs);
      }
      await measureClickToPaint(close, window.__tecPerformance.clickToPaintMs);
    });
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      window.__tecPerformance.storageReads = 0;
      window.__tecPerformance.storageWrites = 0;
      window.__tecPerformance.querySelectorAllCalls = 0;
      window.__tecPerformance.longTasks = [];
    });
    await page.waitForTimeout(2500);
    const metrics = await page.evaluate(() => window.__tecPerformance);
    assert.ok(metrics.storageReads <= 2, `métricas ociosas: ${JSON.stringify(metrics)}`);
    assert.ok(metrics.querySelectorAllCalls <= 4, `métricas ociosas: ${JSON.stringify(metrics)}`);
    assert.equal(metrics.longTasks.length, 0);
    const p95 = values => values.slice().sort((left, right) => left - right)[Math.floor((values.length - 1) * 0.95)];
    assert.ok(p95(metrics.clickToPaintMs) < 50, `P95 de abertura/fechamento: ${JSON.stringify(metrics)}`);
    assert.ok(p95(metrics.tabSwitchToPaintMs) < 50, `P95 de troca de aba: ${JSON.stringify(metrics)}`);
  } finally {
    await context.close();
    await browser.close();
    await new Promise(resolve => fixture.server.close(resolve));
  }
});

test("pausa pela Biblioteca TC compacta e libera o lock", { timeout: 120000 }, async () => {
  const fixture = await startFixtureServer();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const id = cadernoIdFor(1);
  const activeState = {
    version: 1,
    runId: "e2e-launcher-pause",
    ownerId: null,
    running: true,
    creation: { index: 0, phase: "prepare", plan: { matters: [{}] } },
    export: null,
    progress: { phase: "starting", message: "Pausa pelo launcher iniciada." }
  };
  const page = await context.newPage();
  try {
    await page.goto(`${fixture.origin}/questoes/cadernos/${id}`, { waitUntil: "domcontentloaded" });
    await page.locator("#tec-library-pause").waitFor();
    await page.evaluate(({ stateKey, activeState }) => {
      localStorage.setItem(stateKey, JSON.stringify(activeState));
      window.dispatchEvent(new StorageEvent("storage", { key: stateKey, newValue: JSON.stringify(activeState) }));
    }, { stateKey, activeState });
    await page.waitForFunction(() => document.getElementById("tec-library-pause").disabled === false, null, { timeout: 10000 });
    await page.locator("#tec-library-pause").click();
    await page.waitForFunction(({ stateKey }) => {
      const state = JSON.parse(localStorage.getItem(stateKey) || "{}");
      return state.running === false && state.progress && state.progress.phase === "paused";
    }, { stateKey }, { timeout: 30000 });
    const result = await page.evaluate(({ stateKey }) => ({
      state: JSON.parse(localStorage.getItem(stateKey) || "{}"),
      lock: localStorage.getItem("tecconcursos_caderno_automation_lock_v1"),
      buttonDisabled: document.getElementById("tec-library-pause").disabled
    }), { stateKey });
    assert.equal(result.state.running, false);
    assert.equal(result.state.progress.phase, "paused");
    assert.equal(result.lock, null);
    assert.equal(result.buttonDisabled, true);
  } finally {
    await context.close();
    await browser.close();
    await new Promise(resolve => fixture.server.close(resolve));
  }
});

test("reinicia a busca na pasta e reutiliza o caderno existente pelo nome", { timeout: 120000 }, async () => {
  const fixture = await startFixtureServer({
    folderCadernos: {
      "42": [{ id: "9000001", title: "Coesão textual - Base FCC", count: 1 }]
    }
  });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on("dialog", dialog => dialog.accept());
  await context.addInitScript(({ planKey, stateKey, libraryKey }) => {
    if (sessionStorage.getItem("tec-e2e-reuse-initialized")) return;
    sessionStorage.setItem("tec-e2e-reuse-initialized", "1");
    localStorage.setItem(planKey, JSON.stringify({
      matters: [{ code: "MAT-001", title: "Coesão textual - Base FCC", group: "Português" }],
      banks: [],
      years: [],
      removeCancelled: false,
      removeOutdated: false
    }));
    localStorage.removeItem(stateKey);
    localStorage.removeItem(libraryKey);
    localStorage.removeItem("tecconcursos_caderno_automation_lock_v1");
  }, { planKey, stateKey, libraryKey });
  try {
    await page.goto(`${fixture.origin}/questoes/pastas/42`, { waitUntil: "domcontentloaded" });
    assert.equal(await page.locator("a[href*='/questoes/cadernos/']").count(), 1);
    assert.equal(await page.locator("a[href*='/questoes/cadernos/']").innerText(), "Coesão textual - Base FCC");
    assert.equal(await page.evaluate(() => Boolean(window.TecConcursosModules.automationFilters.findCadernoLinkByTitle(document, "Coesão textual - Base FCC"))), true);
    await page.locator("#tec-library-launcher").click();
    await page.locator("[data-action='restart']").click();
    await page.waitForFunction(({ libraryKey, stateKey, entryPrefix }) => {
      const state = JSON.parse(localStorage.getItem(stateKey) || "{}");
      const entry = JSON.parse(localStorage.getItem(entryPrefix + "9000001") || "null");
      return entry && entry.questions && entry.questions.length === 1 && state.running === false && state.creation === null && state.progress && state.progress.phase === "completed";
    }, { libraryKey, stateKey, entryPrefix: libraryEntryPrefix }, { timeout: 60000 });
    const result = await page.evaluate(({ libraryKey }) => ({
      library: JSON.parse(localStorage.getItem(libraryKey) || "{}"),
      state: JSON.parse(localStorage.getItem("tecconcursos_caderno_automation_v2") || "{}"),
      href: location.href
    }), { libraryKey });
    assert.equal(result.library.entries["9000001"].title, "Coesão textual - Base FCC");
    assert.equal(fixture.stats.creationRequests.length, 0);
    assert.match(result.href, /\/questoes\/pastas\/42$/);
    assert.equal(result.state.running, false);
    assert.equal(result.state.creation, null);
    assert.equal(result.state.progress.phase, "completed");
  } finally {
    await context.close();
    await browser.close();
    await new Promise(resolve => fixture.server.close(resolve));
  }
});

test("executa o fluxo real de saída em múltiplas partes sem popup nem duplicação", { timeout: 300000 }, async () => {
  const fixture = await startFixtureServer();
  const browser = await chromium.launch({ headless: true });
  try {
    const cases = [1, 200, 201, 400, 1200, 1700];
    const results = [];
    for (const total of cases) {
      const context = await browser.newContext();
      const id = cadernoIdFor(total);
      const initialState = {
        version: 1,
        runId: "e2e-run-" + total,
        ownerId: null,
        running: true,
        creation: null,
        export: { job: { libraryId: id, cadernoId: id, title: "Caderno E2E " + total, code: "E2E-" + total, group: "E2E", sourceQuestionCount: total, ranges: [], rangeIndex: 0 } },
        progress: { phase: "starting-export", message: "Fixture E2E iniciada." }
      };
      await context.addInitScript(({ stateKey, libraryKey, initialState }) => {
        if (!localStorage.getItem(stateKey)) localStorage.setItem(stateKey, JSON.stringify(initialState));
        if (!localStorage.getItem(libraryKey)) localStorage.removeItem(libraryKey);
        window.__printCalls = 0;
      }, { stateKey, libraryKey, initialState });
      const page = await context.newPage();
      const events = [];
      page.on("console", message => { events.push("console:" + message.type() + ":" + message.text()); });
      page.on("pageerror", error => { events.push("pageerror:" + error.message); });
      page.on("dialog", dialog => { events.push("dialog:" + dialog.message()); dialog.dismiss(); });
      await page.goto(`${fixture.origin}/questoes/cadernos/${id}`, { waitUntil: "domcontentloaded" });
      try {
        await page.waitForFunction(({ stateKey, libraryKey, id, total, entryPrefix }) => {
          const state = JSON.parse(localStorage.getItem(stateKey) || "{}");
          const entry = JSON.parse(localStorage.getItem(entryPrefix + id) || "null");
          return state.running === false && state.progress && state.progress.phase === "completed" && entry && entry.questions && entry.questions.length === total;
        }, { stateKey, libraryKey, id, total, entryPrefix: libraryEntryPrefix }, { timeout: 120000 });
      } catch (error) {
        const diagnostic = await page.evaluate(({ stateKey, libraryKey, id, entryPrefix }) => {
          const state = JSON.parse(localStorage.getItem(stateKey) || "{}");
          const entry = JSON.parse(localStorage.getItem(entryPrefix + id) || "null");
          return { href: location.href, phase: state.progress && state.progress.phase, message: state.progress && state.progress.message, rangeIndex: state.export && state.export.job && state.export.job.rangeIndex, rangesTotal: state.export && state.export.job && state.export.job.ranges && state.export.job.ranges.length, questionNodeCount: document.querySelectorAll(".questao").length, savedQuestions: entry && entry.questions && entry.questions.length, events: state.progress && state.progress.events && state.progress.events.slice(-5) };
        }, { stateKey, libraryKey, id, entryPrefix: libraryEntryPrefix });
        throw new Error(error.message + "\nDIAGNOSTIC=" + JSON.stringify(diagnostic) + "\nEVENTS=" + JSON.stringify(events));
      }
      const result = await page.evaluate(({ stateKey, libraryKey, id, entryPrefix }) => ({
        state: JSON.parse(localStorage.getItem(stateKey) || "{}"),
        entry: JSON.parse(localStorage.getItem(entryPrefix + id) || "null"),
        printCalls: window.__printCalls || 0,
        path: window.location.pathname
      }), { stateKey, libraryKey, id, entryPrefix: libraryEntryPrefix });
      assert.equal(result.state.progress.phase, "completed");
      assert.equal(result.state.running, false);
      assert.equal(result.entry.questions.length, total);
      assert.equal(new Set(result.entry.questions.map(question => question.number)).size, total);
      assert.equal(result.entry.parts.length, Math.ceil(total / 200));
      assert.equal(result.printCalls, 1);
      assert.deepEqual(events, []);
      assert.match(result.path, /\/imprimir$/);
      results.push({ total, parts: result.entry.parts.length });
      await context.close();
    }
    assert.deepEqual(results, [
      { total: 1, parts: 1 },
      { total: 200, parts: 1 },
      { total: 201, parts: 2 },
      { total: 400, parts: 2 },
      { total: 1200, parts: 6 },
      { total: 1700, parts: 9 }
    ]);
  } finally {
    await browser.close();
    await new Promise(resolve => fixture.server.close(resolve));
  }
});

test("retoma depois de falha na parte 7 sem repetir as seis partes concluídas", { timeout: 300000 }, async () => {
  const fixture = await startFixtureServer({ failOnceStarts: [1201] });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const total = 1700;
  const id = cadernoIdFor(total);
  const initialState = {
    version: 1,
    runId: "e2e-resume-after-part-6",
    ownerId: null,
    running: true,
    creation: null,
    export: { job: { libraryId: id, cadernoId: id, title: "Caderno E2E retomada", code: "E2E-RESUME", group: "E2E", sourceQuestionCount: total, ranges: [], rangeIndex: 0 } },
    progress: { phase: "starting-export", message: "Falha E2E de retomada iniciada." }
  };
  await context.addInitScript(({ stateKey, libraryKey, initialState }) => {
    if (!localStorage.getItem(stateKey)) {
      localStorage.setItem(stateKey, JSON.stringify(initialState));
      localStorage.removeItem(libraryKey);
    }
  }, { stateKey, libraryKey, initialState });
  const page = await context.newPage();
  const errors = [];
  page.on("console", message => { errors.push("console:" + message.type() + ":" + message.text()); });
  page.on("pageerror", error => { errors.push("pageerror:" + error.message); });
  page.on("dialog", dialog => { errors.push("dialog:" + dialog.message()); dialog.dismiss(); });
  try {
    await page.goto(`${fixture.origin}/questoes/cadernos/${id}`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(({ stateKey, libraryKey, id, entryPrefix }) => {
      const state = JSON.parse(localStorage.getItem(stateKey) || "{}");
      const entry = JSON.parse(localStorage.getItem(entryPrefix + id) || "null");
      return state.running === false && state.progress && state.progress.phase === "error" && state.export && state.export.job && state.export.job.rangeIndex === 6 && entry && entry.questions && entry.questions.length === 1200 && entry.parts && entry.parts.length === 6;
    }, { stateKey, libraryKey, id, entryPrefix: libraryEntryPrefix }, { timeout: 60000 });

    const failedState = await page.evaluate(({ stateKey, libraryKey, id, entryPrefix }) => ({
      state: JSON.parse(localStorage.getItem(stateKey) || "{}"),
      entry: JSON.parse(localStorage.getItem(entryPrefix + id) || "null"),
      path: location.pathname + location.search
    }), { stateKey, libraryKey, id, entryPrefix: libraryEntryPrefix });
    assert.equal(failedState.state.progress.phase, "error");
    assert.equal(failedState.state.export.job.rangeIndex, 6);
    assert.equal(failedState.entry.questions.length, 1200);
    assert.deepEqual(failedState.entry.parts.map(part => part.start), [1, 201, 401, 601, 801, 1001]);
    assert.match(failedState.state.progress.message, /Falha E2E simulada/);
    assert.match(failedState.path, /start=1201/);

    // A saída falhou, mas a execução persistida continua na parte 7. A
    // recarga representa a correção/reabertura da saída antes do clique de
    // retomada feito pelo usuário.
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator("#tec-library-launcher").click();
    await page.locator("#tec-library-panel [data-action='resume']").click();

    await page.waitForFunction(({ stateKey, libraryKey, id, total, entryPrefix }) => {
      const state = JSON.parse(localStorage.getItem(stateKey) || "{}");
      const entry = JSON.parse(localStorage.getItem(entryPrefix + id) || "null");
      return state.running === false && state.progress && state.progress.phase === "completed" && entry && entry.questions && entry.questions.length === total && entry.parts && entry.parts.length === 9;
    }, { stateKey, libraryKey, id, total, entryPrefix: libraryEntryPrefix }, { timeout: 120000 });

    const completed = await page.evaluate(({ stateKey, libraryKey, id, entryPrefix }) => ({
      state: JSON.parse(localStorage.getItem(stateKey) || "{}"),
      entry: JSON.parse(localStorage.getItem(entryPrefix + id) || "null")
    }), { stateKey, libraryKey, id, entryPrefix: libraryEntryPrefix });
    assert.equal(completed.state.progress.phase, "completed");
    assert.equal(completed.entry.questions.length, total);
    assert.equal(new Set(completed.entry.questions.map(question => question.number)).size, total);
    assert.deepEqual(completed.entry.parts.map(part => part.start), [1, 201, 401, 601, 801, 1001, 1201, 1401, 1601]);
    assert.deepEqual(fixture.stats.printRequests.filter(request => request.start < 1201).map(request => request.start), [1, 201, 401, 601, 801, 1001]);
    assert.deepEqual(fixture.stats.printRequests.filter(request => request.start === 1201).map(request => request.failOnce), [true, false]);
    assert.deepEqual(fixture.stats.printRequests.filter(request => request.start > 1201).map(request => request.start), [1401, 1601]);
    assert.deepEqual(errors, []);
  } catch (error) {
    const diagnostic = await page.evaluate(({ stateKey, libraryKey, id, entryPrefix }) => ({
      href: location.href,
      state: JSON.parse(localStorage.getItem(stateKey) || "{}"),
      entry: JSON.parse(localStorage.getItem(entryPrefix + id) || "null"),
      failureApplied: Boolean(window.__fixtureFailureApplied),
      extractorType: window.TecConcursosModules && window.TecConcursosModules.library && typeof window.TecConcursosModules.library.extractPrintedQuestions,
      questionNodeCount: document.querySelectorAll(".questao").length,
      bodySample: String(document.body && (document.body.innerText || document.body.textContent) || "").slice(0, 400)
    }), { stateKey, libraryKey, id, entryPrefix: libraryEntryPrefix }).catch(error => ({ evaluateError: error.message }));
    throw new Error(error.message + "\nDIAGNOSTIC=" + JSON.stringify(diagnostic) + "\nPRINT_REQUESTS=" + JSON.stringify(fixture.stats.printRequests) + "\nERRORS=" + JSON.stringify(errors));
  } finally {
    await context.close();
    await browser.close();
    await new Promise(resolve => fixture.server.close(resolve));
  }
});

test("bloqueia uma segunda aba durante a execução real e exibe o proprietário", { timeout: 120000 }, async () => {
  const fixture = await startFixtureServer();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const total = 1700;
  const id = cadernoIdFor(total);
  const initialState = {
    version: 1,
    runId: "e2e-lock-run",
    ownerId: null,
    running: true,
    creation: null,
    export: { job: { libraryId: id, cadernoId: id, title: "Caderno E2E lock", code: "E2E-LOCK", group: "E2E", sourceQuestionCount: total, ranges: [], rangeIndex: 0 } },
    progress: { phase: "starting-export", message: "Fixture de lock iniciada." }
  };
  await context.addInitScript(({ stateKey, libraryKey, initialState }) => {
    if (!localStorage.getItem(stateKey)) {
      localStorage.setItem(stateKey, JSON.stringify(initialState));
      localStorage.removeItem(libraryKey);
    }
  }, { stateKey, libraryKey, initialState });
  const firstPage = await context.newPage();
  const secondPage = await context.newPage();
  const errors = [];
  for (const page of [firstPage, secondPage]) {
    page.on("pageerror", error => errors.push(error.message));
    page.on("dialog", dialog => { errors.push("dialog:" + dialog.message()); dialog.dismiss(); });
  }
  try {
    await firstPage.goto(`${fixture.origin}/questoes/cadernos/${id}`, { waitUntil: "domcontentloaded" });
    await firstPage.waitForFunction(({ lockKey }) => {
      const lock = JSON.parse(localStorage.getItem(lockKey) || "null");
      return Boolean(lock && lock.ownerId && lock.expiresAt > Date.now());
    }, { lockKey: "tecconcursos_caderno_automation_lock_v1" }, { timeout: 10000 });

    await secondPage.goto(`${fixture.origin}/questoes/cadernos/${id}`, { waitUntil: "domcontentloaded" });
    await secondPage.locator("#tec-library-launcher").click();
    await secondPage.waitForFunction(() => {
      const node = document.querySelector("#tec-progress");
      return Boolean(node && /outra aba/i.test(node.textContent || ""));
    }, null, { timeout: 10000 });

    const result = await secondPage.evaluate(() => ({
      progress: document.querySelector("#tec-progress").textContent,
      lock: JSON.parse(localStorage.getItem("tecconcursos_caderno_automation_lock_v1") || "null")
    }));
    assert.match(result.progress, /outra aba/i);
    assert.ok(result.lock && result.lock.ownerId);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
    await browser.close();
    await new Promise(resolve => fixture.server.close(resolve));
  }
});

test("cria o caderno com o título do plano antes de iniciar a impressão", { timeout: 60000 }, async () => {
  const fixture = await startFixtureServer();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const initialState = {
    version: 1,
    runId: "e2e-creation-run",
    ownerId: null,
    running: true,
    creation: {
      plan: {
        version: 1,
        banks: ["FCC"],
        years: [2025],
        removeCancelled: false,
        removeOutdated: false,
        matters: [{ code: "MAT-001", title: "Coesão textual - Base FCC", group: "Português", subjectPaths: ["Língua Portuguesa > Coesão textual"], subjectIds: [] }]
      },
      folderId: "42",
      filterUrl: fixture.origin + "/questoes/filtrar?idPasta=42",
      index: 0,
      phase: "prepare",
      outcomes: []
    },
    export: null,
    progress: { phase: "starting", message: "Criação E2E iniciada." }
  };
  await context.addInitScript(({ stateKey, libraryKey, initialState }) => {
    if (!localStorage.getItem(stateKey)) {
      localStorage.setItem(stateKey, JSON.stringify(initialState));
      localStorage.removeItem(libraryKey);
    }
  }, { stateKey, libraryKey, initialState });
  const page = await context.newPage();
  const errors = [];
  page.on("console", message => errors.push("console:" + message.type() + ":" + message.text()));
  page.on("pageerror", error => errors.push(error.message));
  page.on("dialog", dialog => { errors.push("dialog:" + dialog.message()); dialog.dismiss(); });
  try {
    await page.goto(initialState.creation.filterUrl, { waitUntil: "domcontentloaded" });
    try {
      await page.waitForFunction(({ stateKey, libraryKey, entryPrefix }) => {
        const state = JSON.parse(localStorage.getItem(stateKey) || "{}");
        const entry = JSON.parse(localStorage.getItem(entryPrefix + "9000400") || "null");
        return state.running === false && state.creation === null && state.progress && state.progress.phase === "completed" && entry && entry.questions && entry.questions.length === 400;
      }, { stateKey, libraryKey, entryPrefix: libraryEntryPrefix }, { timeout: 15000 });
    } catch (error) {
      const diagnostic = await page.evaluate(({ stateKey, libraryKey }) => {
        const state = JSON.parse(localStorage.getItem(stateKey) || "{}");
        const library = JSON.parse(localStorage.getItem(libraryKey) || "{}");
        return { href: location.href, phase: state.progress && state.progress.phase, message: state.progress && state.progress.message, creation: state.creation && { index: state.creation.index, phase: state.creation.phase, current: state.creation.current, outcomes: state.creation.outcomes }, export: state.export, entries: Object.keys(library.entries || {}), text: document.body && document.body.innerText.slice(0, 1600), events: state.progress && state.progress.events && state.progress.events.slice(-8) };
      }, { stateKey, libraryKey });
      throw new Error(error.message + "\nDIAGNOSTIC=" + JSON.stringify(diagnostic) + "\nERRORS=" + JSON.stringify(errors));
    }
    const result = await page.evaluate(({ stateKey, libraryKey, entryPrefix }) => ({
      state: JSON.parse(localStorage.getItem(stateKey) || "{}"),
      entry: JSON.parse(localStorage.getItem(entryPrefix + "9000400") || "null"),
      path: location.pathname
    }), { stateKey, libraryKey, entryPrefix: libraryEntryPrefix });
    assert.deepEqual(errors, []);
    assert.equal(result.state.progress.phase, "completed");
    assert.equal(result.entry.title, "Coesão textual - Base FCC");
    assert.equal(result.entry.questions.length, 400);
    assert.equal(result.entry.parts.length, 2);
    assert.match(result.path, /\/filtrar$/);
  } finally {
    await context.close();
    await browser.close();
    await new Promise(resolve => fixture.server.close(resolve));
  }
});

test("processa vários cadernos do plano em sequência e retoma no caderno intermediário", { timeout: 300000 }, async () => {
  const matters = [
    { id: "9100001", code: "MAT-001", title: "Coesão textual - Base FCC", group: "Português", topic: "Coesão textual", count: 1, bank: "FCC", year: 2025, vacancy: "Analista" },
    { id: "9100002", code: "MAT-002", title: "Concordância verbal - Base FCC", group: "Português", topic: "Concordância", count: 201, bank: "Fundatec", year: 2023, vacancy: "Técnico" },
    { id: "9100003", code: "MAT-028", title: "Porcentagem - Treino", group: "Raciocínio Lógico-Matemático", topic: "Porcentagem", count: 400, bank: "FGV", year: 2024, vacancy: "Analista Judiciário" },
    { id: "9100004", code: "MAT-198", title: "Segurança - Frameworks", group: "Redes e Segurança", topic: "CIS", count: 401, bank: "Objetiva", year: 2026, vacancy: "Especialista" }
  ].map(matter => Object.assign({ organization: "Órgão " + matter.code, role: matter.vacancy, subject: "Língua Portuguesa" }, matter));
  const banks = ["FCC", "Fundatec", "Vunesp", "Cesgranrio", "FGV", "Legalle", "Fundação La Salle", "Instituto AOCP", "Objetiva"];
  const years = [2023, 2020, 2022, 2018, 2025, 2021, 2017, 2024, 2019, 2026, 2016];
  const fixture = await startFixtureServer({ multiMatters: matters, failOnceParts: ["9100002:201"] });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const initialState = {
    version: 1,
    runId: "e2e-multiple-matters",
    ownerId: null,
    running: true,
    creation: {
      plan: {
        version: 1,
        banks,
        years,
        removeCancelled: true,
        removeOutdated: true,
        matters: matters.map(matter => ({ code: matter.code, title: matter.title, group: matter.group, subjectPaths: ["Língua Portuguesa > " + matter.topic], subjectIds: [] }))
      },
      folderId: "42",
      filterUrl: fixture.origin + "/questoes/filtrar?idPasta=42",
      index: 0,
      phase: "prepare",
      outcomes: []
    },
    export: null,
    progress: { phase: "starting", message: "Fluxo de múltiplos cadernos iniciado." }
  };
  await context.addInitScript(({ stateKey, libraryKey, initialState }) => {
    if (!localStorage.getItem(stateKey)) {
      localStorage.setItem(stateKey, JSON.stringify(initialState));
      localStorage.removeItem(libraryKey);
    }
  }, { stateKey, libraryKey, initialState });
  const page = await context.newPage();
  const errors = [];
  page.on("console", message => errors.push("console:" + message.type() + ":" + message.text()));
  page.on("pageerror", error => errors.push("pageerror:" + error.message));
  page.on("dialog", dialog => { errors.push("dialog:" + dialog.message()); dialog.dismiss(); });
  try {
    await page.goto(initialState.creation.filterUrl, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(({ stateKey, libraryKey, entryPrefix }) => {
      const state = JSON.parse(localStorage.getItem(stateKey) || "{}");
      const entry1 = JSON.parse(localStorage.getItem(entryPrefix + "9100001") || "null");
      const entry2 = JSON.parse(localStorage.getItem(entryPrefix + "9100002") || "null");
      return state.running === false && state.progress && state.progress.phase === "error" && state.creation && state.creation.index === 1 && state.export && state.export.job && state.export.job.rangeIndex === 1 && entry1 && entry1.questions && entry1.questions.length === 1 && entry2 && entry2.questions && entry2.questions.length === 200;
    }, { stateKey, libraryKey, entryPrefix: libraryEntryPrefix }, { timeout: 120000 });

    const interrupted = await page.evaluate(({ stateKey, libraryKey, entryPrefix }) => ({
      state: JSON.parse(localStorage.getItem(stateKey) || "{}"),
      entries: {
        "9100001": JSON.parse(localStorage.getItem(entryPrefix + "9100001") || "null"),
        "9100002": JSON.parse(localStorage.getItem(entryPrefix + "9100002") || "null")
      },
      url: location.href
    }), { stateKey, libraryKey, entryPrefix: libraryEntryPrefix });
    assert.equal(interrupted.state.creation.index, 1);
    assert.equal(interrupted.state.export.job.cadernoId, "9100002");
    assert.equal(interrupted.state.export.job.rangeIndex, 1);
    assert.equal(interrupted.entries["9100001"].questions.length, 1);
    assert.equal(interrupted.entries["9100002"].questions.length, 200);
    assert.match(interrupted.url, /start=201/);

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator("#tec-library-launcher").click();
    await page.locator("#tec-library-panel [data-action='resume']").click();
    await page.waitForFunction(({ stateKey, libraryKey, entryPrefix }) => {
      const state = JSON.parse(localStorage.getItem(stateKey) || "{}");
      const index = JSON.parse(localStorage.getItem(libraryKey) || "{}");
      const keys = Object.keys(index.entries || {});
      return state.running === false && state.creation === null && state.progress && state.progress.phase === "completed" && keys.length === 4 && keys.every(key => {
        const entry = JSON.parse(localStorage.getItem(entryPrefix + key) || "null");
        return entry && entry.questions && entry.questions.length > 0;
      });
    }, { stateKey, libraryKey, entryPrefix: libraryEntryPrefix }, { timeout: 180000 });

    const completed = await page.evaluate(({ stateKey, libraryKey, entryPrefix }) => {
      const index = JSON.parse(localStorage.getItem(libraryKey) || "{}");
      const entries = {};
      for (const key of Object.keys(index.entries || {})) {
        entries[key] = JSON.parse(localStorage.getItem(entryPrefix + key) || "null");
      }
      return {
        state: JSON.parse(localStorage.getItem(stateKey) || "{}"),
        entries
      };
    }, { stateKey, libraryKey, entryPrefix: libraryEntryPrefix });
    assert.deepEqual(completed.state.creation, null);
    assert.deepEqual(completed.state.export, null);
    assert.deepEqual(completed.state.progress.phase, "completed");
    assert.deepEqual(completed.state.progress.matterIndex, matters.length);
    assert.deepEqual(completed.state.progress.mattersTotal, matters.length);
    assert.deepEqual(completed.state.progress.events.filter(event => event.event === "resume-enter").length >= matters.length, true);
    for (const matter of matters) {
      const entry = completed.entries[matter.id];
      assert.ok(entry, "caderno não salvo: " + matter.id);
      assert.equal(entry.title, matter.title);
      assert.equal(entry.questions.length, matter.count);
      assert.equal(entry.totalQuestions, matter.count);
      assert.deepEqual(entry.parts.map(part => part.start), Array.from({ length: Math.ceil(matter.count / 200) }, (_, index) => index * 200 + 1));
      assert.equal(new Set(entry.questions.map(question => question.id)).size, matter.count);
      assert.deepEqual([...new Set(entry.questions.map(question => question.bank))], [matter.bank]);
      assert.deepEqual([...new Set(entry.questions.map(question => question.year))], [matter.year]);
    }
    assert.deepEqual(completed.state.creation, null);
    assert.deepEqual(fixture.stats.creationRequests.map(request => request.matter), matters.map(matter => matter.code));
    for (const request of fixture.stats.creationRequests) {
      assert.deepEqual(request.banks, banks);
      assert.deepEqual(request.years, years);
      assert.deepEqual(request.removed, ["Remover anuladas", "Remover desatualizadas"]);
    }
    assert.deepEqual(fixture.stats.printRequests.filter(request => request.id === "9100001").map(request => request.start), [1]);
    assert.deepEqual(fixture.stats.printRequests.filter(request => request.id === "9100002").map(request => request.start), [1, 201, 201]);
    assert.deepEqual(fixture.stats.printRequests.filter(request => request.id === "9100003").map(request => request.start), [1, 201]);
    assert.deepEqual(fixture.stats.printRequests.filter(request => request.id === "9100004").map(request => request.start), [1, 201, 401]);
    assert.deepEqual(errors, []);
  } catch (error) {
    const diagnostic = await page.evaluate(({ stateKey, libraryKey }) => ({
      href: location.href,
      state: JSON.parse(localStorage.getItem(stateKey) || "{}"),
      entries: JSON.parse(localStorage.getItem(libraryKey) || "{}").entries || {},
      text: String(document.body && document.body.innerText || "").slice(0, 1200)
    }), { stateKey, libraryKey }).catch(evaluateError => ({ evaluateError: evaluateError.message }));
    throw new Error(error.message + "\nDIAGNOSTIC=" + JSON.stringify(diagnostic) + "\nPRINT_REQUESTS=" + JSON.stringify(fixture.stats.printRequests) + "\nCREATION_REQUESTS=" + JSON.stringify(fixture.stats.creationRequests) + "\nERRORS=" + JSON.stringify(errors));
  } finally {
    await context.close();
    await browser.close();
    await new Promise(resolve => fixture.server.close(resolve));
  }
});
