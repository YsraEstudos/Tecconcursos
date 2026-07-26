const test = require("node:test");
const assert = require("node:assert/strict");
const menuModule = require("../../src/userscript/tampermonkey-menu.cjs");

function fakeTampermonkeyRoot() {
  const commands = new Map();
  let nextId = 1;
  return {
    commands,
    GM_registerMenuCommand(name, callback) {
      const id = nextId++;
      commands.set(id, { id, name, callback });
      return id;
    },
    GM_unregisterMenuCommand(id) {
      commands.delete(id);
    }
  };
}

function activeCommand(root) {
  const values = Array.from(root.commands.values());
  return values[values.length - 1];
}

function activeCommands(root) {
  return Array.from(root.commands.values());
}

function createMenuFor(initialState) {
  let state = initialState;
  const root = fakeTampermonkeyRoot();
  const menu = menuModule.createMenu({
    root,
    getState: () => state,
    onPause: () => { state = Object.assign({}, state, { running: false }); },
    onResume: () => { state = Object.assign({}, state, { running: true }); }
  });
  return { root, menu };
}

test("registra Parar quando existe uma execução em andamento", () => {
  const { root, menu } = createMenuFor({ running: true, creation: {} });

  menu.refresh();

  assert.equal(activeCommand(root).name, "⏹ Parar automação");
});

test("o callback chama pausa, troca o rótulo e não duplica comandos", async () => {
  let state = { running: true, export: { job: {} } };
  let pauses = 0;
  const root = fakeTampermonkeyRoot();
  const menu = menuModule.createMenu({
    root,
    getState: () => state,
    onPause: () => {
      pauses += 1;
      state = { running: false, export: { job: {} } };
    },
    onResume: () => {
      state = { running: true, export: { job: {} } };
    }
  });

  menu.refresh();
  await activeCommand(root).callback();

  assert.equal(pauses, 1);
  assert.equal(activeCommand(root).name, "▶ Retomar automação");
  assert.equal(activeCommands(root).length, 1);
});

test("remove o comando quando não existe execução pendente", () => {
  const { root, menu } = createMenuFor({ running: false });

  menu.refresh();

  assert.equal(activeCommands(root).length, 0);
});
