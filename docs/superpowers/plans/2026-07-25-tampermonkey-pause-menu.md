# Controle de pausa no menu do Tampermonkey Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar ao menu oficial de comandos do Tampermonkey um comando dinâmico `Parar automação`/`Retomar automação` que reutiliza a pausa persistida do TecConcursos e bloqueia novas transições depois da pausa.

**Architecture:** Criar um módulo isolado para registrar, atualizar e remover um único comando do Tampermonkey. Integrá-lo ao `entry.cjs` usando a instância existente de automação, e adicionar um guard de execução consultado pelos fluxos antes de cliques e navegações importantes. O estado, o lease e a retomada continuam sob responsabilidade de `automation.cjs`.

**Tech Stack:** Userscript JavaScript em módulos UMD/CommonJS `.cjs`, Node.js `node:test`, bundle gerado por `scripts/build-userscript.cjs`, testes E2E locais com Playwright.

## Global Constraints

- Não alterar o menu interno do Tampermonkey que contém `Edit` e `Delete`; usar somente `GM_registerMenuCommand`/`GM_unregisterMenuCommand`.
- Não criar uma segunda fonte de verdade para pausa; usar `automation.pause()` e `automation.resumePaused()` e o estado `tecconcursos_caderno_automation_v1` existente.
- Preservar `runId`, `ownerId`, lease, histórico, `filterUrl`, partes concluídas e contratos de clique Angular.
- Não introduzir dependências novas nem imprimir credenciais, cookies, tokens ou cabeçalhos.
- Executar testes com Node/npm do projeto; para este projeto a verificação principal é `npm run check`.
- Fazer alterações explícitas em arquivos conhecidos; nunca usar `git add -A` porque o checkout já possui alterações locais pré-existentes.

---

### Task 1: Criar o módulo testável do comando Tampermonkey

**Files:**
- Create: `src/userscript/tampermonkey-menu.cjs`
- Test: `tests/userscript/tampermonkey-menu.test.cjs`

**Interfaces:**
- Produces `commandLabel(state)`, `hasPendingRun(state)` e `createMenu(options)`.
- `createMenu(options)` recebe `{ root, getState, onPause, onResume, onError }` e retorna `{ refresh, destroy }`.
- `refresh()` registra somente um comando quando `state.creation` ou `state.export` existir; usa `⏹ Parar automação` para `state.running === true` e `▶ Retomar automação` caso contrário.

- [ ] **Step 1: Write the failing tests**

  Adicionar um fake de `GM_registerMenuCommand`/`GM_unregisterMenuCommand` que guarde os registros atuais e testar:

  ```js
  test("registra Parar quando existe uma execução em andamento", () => {
    const menu = createMenuFor({ running: true, creation: {} });
    menu.refresh();
    assert.equal(activeCommand().name, "⏹ Parar automação");
  });

  test("o callback chama pausa, troca o rótulo e não duplica comandos", async () => {
    let state = { running: true, export: { job: {} } };
    let pauses = 0;
    const menu = createMenu({
      root: fakeTampermonkeyRoot(),
      getState: () => state,
      onPause: () => { pauses += 1; state = { running: false, export: { job: {} } }; },
      onResume: () => { state = { running: true, export: { job: {} } }; }
    });
    menu.refresh();
    await activeCommand().callback();
    assert.equal(pauses, 1);
    assert.equal(activeCommand().name, "▶ Retomar automação");
    assert.equal(activeCommands().length, 1);
  });

  test("remove o comando quando não existe execução pendente", () => {
    const menu = createMenuFor({ running: false });
    menu.refresh();
    assert.equal(activeCommands().length, 0);
  });
  ```

- [ ] **Step 2: Run the focused test to verify it fails**

  Run: `node --test tests/userscript/tampermonkey-menu.test.cjs`

  Expected: FAIL because `src/userscript/tampermonkey-menu.cjs` and its exported functions do not exist yet.

- [ ] **Step 3: Write the minimal implementation**

  Implement the UMD wrapper used by the existing modules. `refresh()` must remove the previous command before registering the new label when `GM_unregisterMenuCommand` exists. The callback must choose the action from the latest state, resolve synchronous or Promise-returning handlers, refresh on success, call `onError` on failure, and refresh after failure without creating a second command.

- [ ] **Step 4: Run the focused test to verify it passes**

  Run: `node --test tests/userscript/tampermonkey-menu.test.cjs`

  Expected: PASS with all menu-label, callback and cleanup assertions green.

- [ ] **Step 5: Commit**

  Do not stage unrelated pre-existing files. If a commit is requested later, stage only `src/userscript/tampermonkey-menu.cjs` and `tests/userscript/tampermonkey-menu.test.cjs` for this task.

### Task 2: Expor um checkpoint de automação pausável

**Files:**
- Modify: `src/userscript/automation.cjs`
- Modify: `tests/userscript/automation-lifecycle.test.cjs`

**Interfaces:**
- Produces `automation.ensureRunning(state)`, que lança um erro com `code === "AUTOMATION_PAUSED"` quando a execução persistida não está mais ativa ou perdeu o lease.
- `automation.fail(error)` deve reconhecer esse erro e preservar uma pausa já persistida, sem convertê-la em fase `error`.

- [ ] **Step 1: Write the failing tests**

  Acrescentar testes que pausam uma execução, chamam `ensureRunning` com o snapshot antigo e confirmam o erro de pausa; e que passam esse erro a `fail()` e confirmam que a fase permanece `paused`.

  ```js
  test("interrompe um passo quando o estado foi pausado pelo menu", async () => {
    const storage = storageStub({ [automation.STATE_KEY]: pendingState("run-guard") });
    const instance = automation.createAutomation({ root: rootStub(), document: documentStub(), storage, library: {} });
    await instance.resume();
    const snapshot = instance.getState();
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
  ```

- [ ] **Step 2: Run the focused test to verify it fails**

  Run: `node --test tests/userscript/automation-lifecycle.test.cjs`

  Expected: FAIL because `ensureRunning` is not exported and `fail()` currently treats the guard error as a normal failure.

- [ ] **Step 3: Write the minimal implementation**

  Add a small `automationPausedError()` helper and `ensureRunning()` that re-reads state and verifies the current lease. Export the guard from the instance. Add an early return in `fail()` for `AUTOMATION_PAUSED`, preserving the state written by `pause()`.

- [ ] **Step 4: Run the focused test to verify it passes**

  Run: `node --test tests/userscript/automation-lifecycle.test.cjs`

  Expected: PASS, including all existing lifecycle tests.

- [ ] **Step 5: Commit**

  Do not stage unrelated files; this task's scope is the automation module and its lifecycle tests.

### Task 3: Aplicar checkpoints antes dos cliques e navegações críticas

**Files:**
- Modify: `src/userscript/automation-filters.cjs`
- Modify: `src/userscript/automation-caderno.cjs`
- Modify: `src/userscript/automation-print.cjs`
- Modify: `src/userscript/automation-output.cjs`
- Modify: `src/userscript/automation-orchestrator.cjs`
- Modify: `src/userscript/automation.cjs`
- Test: `tests/userscript/automation-filters.test.cjs`
- Test: `tests/userscript/automation-output.test.cjs`

**Interfaces:**
- Cada workflow receberá opcionalmente `ensureRunning` no contexto.
- `selectTreeValue`, `clearActiveFilters` e `applyMatterFilters` aceitarão um último callback de guard sem alterar os argumentos existentes quando ele não for fornecido.
- Erros `AUTOMATION_PAUSED` devem atravessar catches que hoje tratam timeout de busca como candidato alternativo.

- [ ] **Step 1: Write the failing tests**

  Adicionar um teste de filtro que chama `selectTreeValue` com um guard que lança antes do clique e confirma que o alvo não foi acionado. Adicionar um teste de saída que pausa no guard antes da navegação para a próxima parte e confirma que `location.href` não muda nem a parte é avançada.

- [ ] **Step 2: Run the focused tests to verify they fail**

  Run: `node --test tests/userscript/automation-filters.test.cjs tests/userscript/automation-output.test.cjs`

  Expected: FAIL because the current filter/output workflows do not receive or consult a pause guard.

- [ ] **Step 3: Write the minimal implementation**

  Thread `ensureRunning` from `automation.cjs` into the caderno, print and output workflows. Check it:

  - before `clearActiveFilters`, each tree-item click and the shortcut clicks;
  - after asynchronous waits and before filling or clicking `Gerar Caderno`;
  - before selecting the print tab and before clicking `Imprimir Caderno`;
  - while waiting for output questions and again before extraction/library append;
  - immediately before every `location.href` assignment in the orchestrator/output transitions.

  Preserve the existing part-save ordering: a paused step must not increment `rangeIndex`, clear `export`, append a completed part, or release a state as completed. Let the top-level `entry.cjs` catch call `automation.fail()`, which now preserves the paused phase for the guard error.

- [ ] **Step 4: Run the focused tests to verify they pass**

  Run: `node --test tests/userscript/automation-filters.test.cjs tests/userscript/automation-output.test.cjs tests/userscript/automation-lifecycle.test.cjs`

  Expected: PASS with the new guard assertions and all existing workflow/lifecycle tests.

- [ ] **Step 5: Commit**

  Keep the staged scope limited to the workflow modules and their focused tests.

### Task 4: Integrar o comando no entry point e no bundle

**Files:**
- Modify: `src/userscript/entry.cjs`
- Modify: `scripts/build-userscript.cjs`
- Modify: `tests/userscript/bundle.test.cjs`
- Modify: `README.md`
- Modify: `src/userscript/AI_CONTEXT.md`

**Interfaces:**
- `entry.cjs` cria `modules.tampermonkeyMenu.createMenu(...)` depois da instância de automação e antes do `setTimeout` de retomada.
- Os handlers de criar, exportar, pausar, retomar, takeover e erro chamam `menu.refresh()` depois de alterar o estado.
- O bundle metadata contém `@grant GM_registerMenuCommand` e `@grant GM_unregisterMenuCommand`.

- [ ] **Step 1: Write the failing bundle/integration assertions**

  Atualizar `tests/userscript/bundle.test.cjs` para exigir os dois grants e os textos `Parar automação`/`Retomar automação`; adicionar uma asserção de que o módulo `tampermonkey-menu.cjs` está presente no bundle.

- [ ] **Step 2: Run the bundle test to verify it fails**

  Run: `node --test tests/userscript/bundle.test.cjs`

  Expected: FAIL because the build metadata, module order and entry integration do not contain the new command.

- [ ] **Step 3: Write the minimal implementation**

  Add the grants and module to `scripts/build-userscript.cjs`. In `entry.cjs`, create the controller with wrappers around `automation.pause` and `automation.resumePaused`, register it before automatic resume, and call `menu.refresh()` after UI actions. Keep the current panel behavior unchanged. Document in `README.md` that the command is available in the Tampermonkey script-command menu and update `AI_CONTEXT.md` with the new operational contract.

- [ ] **Step 4: Run the bundle test to verify it passes**

  Run: `npm run build:userscript; node --test tests/userscript/bundle.test.cjs`

  Expected: PASS and regenerated `tecconcursos-scraper.user.js` plus `dist/tecconcursos-scraper.user.js` contain the metadata and module.

- [ ] **Step 5: Commit**

  Review generated bundle diffs before staging. Stage only the source, tests, documentation, build script and the two generated userscripts that belong to this feature; leave unrelated pre-existing diffs untouched.

### Task 5: Executar a verificação completa e revisar o diff

**Files:**
- Verify: all files changed by Tasks 1–4
- Verify: `docs/superpowers/specs/2026-07-25-tampermonkey-pause-menu-design.md`
- Verify: `docs/superpowers/plans/2026-07-25-tampermonkey-pause-menu.md`

- [ ] **Step 1: Run the complete deterministic checks**

  Run in this order:

  ```powershell
  npm test
  npm run build:userscript
  npm run check
  ```

  Expected: exit code 0, no failing tests, clean userscript syntax/quality checks, and a successful bundle generation.

- [ ] **Step 2: Run the local E2E flow**

  Run: `npm run test:e2e`

  Expected: local automation and HTML flows pass. This validates the local fixture only and does not prove the real TecConcursos DOM is unchanged.

- [ ] **Step 3: Inspect the final diff and generated metadata**

  Run: `git diff --stat -- <explicit changed files>` and `rg -n "GM_registerMenuCommand|GM_unregisterMenuCommand|Parar automação|Retomar automação" tecconcursos-scraper.user.js dist/tecconcursos-scraper.user.js`.

  Confirm that no credentials or unrelated files entered the feature diff, that both generated bundles match, and that the full Windows paths for changed files remain below the repository's practical path limit.

- [ ] **Step 4: Report evidence and limitations**

  Report exact test/build results, the raw userscript update URL, and the limitation that the command is in Tampermonkey's userscript-command menu rather than the internal `Edit`/`Delete` menu. Do not claim real-site interaction validation unless it was actually performed.
