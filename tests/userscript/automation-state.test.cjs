const test = require("node:test");
const assert = require("node:assert/strict");
const state = require("../../src/userscript/automation-state.cjs");

test("normaliza estados inválidos sem aceitar arrays como estado de execução", () => {
  assert.deepEqual(state.normalizeState(null), state.defaultState());
  assert.deepEqual(state.normalizeState("estado quebrado"), state.defaultState());
  assert.deepEqual(state.normalizeState([]), state.defaultState());
  assert.deepEqual(state.normalizeState({ running: true }), { running: true });
});

test("mantém histórico de progresso limitado e com a fase mais recente", () => {
  const current = {};
  for (let index = 0; index < 25; index += 1) {
    state.markProgress(current, { phase: "phase-" + index, message: "message-" + index });
  }

  assert.equal(current.progress.history.length, 20);
  assert.equal(current.progress.history[0].phase, "phase-5");
  assert.equal(current.progress.history.at(-1).phase, "phase-24");
  assert.ok(Date.parse(current.progress.updatedAt));
});

test("limita eventos diagnósticos e aplica o compactador recebido", () => {
  const current = { progress: { phase: "waiting-questions" } };
  for (let index = 0; index < 305; index += 1) {
    state.appendEvent(current, "poll", { index, secret: "não deve sair" }, "https://example.test", details => ({ index: details.index }));
  }

  assert.equal(current.progress.events.length, 300);
  assert.equal(current.progress.events[0].details.index, 5);
  assert.equal(current.progress.events.at(-1).details.index, 304);
  assert.equal(current.progress.events[0].url, "https://example.test");
  assert.equal(current.progress.events[0].phase, "waiting-questions");
  assert.equal(Object.hasOwn(current.progress.events[0].details, "secret"), false);
});

test("abandona o namespace GM v1 sem ler, excluir ou sobrescrever a chave contaminada", () => {
  const operations = [];
  const storage = {
    usesGM: true,
    read: (key, fallback) => {
      operations.push(["read", key]);
      if (key === "tecconcursos_caderno_automation_v1") {
        throw new Error("Message exceeded maximum allowed size of 64MiB");
      }
      return fallback;
    },
    remove: key => operations.push(["remove", key]),
    write: (key, value) => operations.push(["write", key, value])
  };

  const current = state.readState(storage);

  assert.deepEqual(current, state.defaultState());
  assert.deepEqual(operations, [["read", "tecconcursos_caderno_automation_v2"]]);
});
