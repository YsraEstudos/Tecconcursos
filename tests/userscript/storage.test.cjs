const test = require("node:test");
const assert = require("node:assert/strict");
const storageModule = require("../../src/userscript/storage.cjs");

test("persiste e remove dados no fallback localStorage", () => {
  const values = new Map();
  const host = {
    localStorage: {
      getItem: (key) => values.has(key) ? values.get(key) : null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key)
    }
  };
  const storage = storageModule.createStorage(host);
  storage.write("questions", [{ id: "1" }]);
  assert.deepEqual(storage.read("questions", []), [{ id: "1" }]);
  storage.remove("questions");
  assert.deepEqual(storage.read("questions", []), []);
});

test("não envia valores maiores que o limite de 64MiB para o GM", () => {
  const calls = [];
  const host = {
    GM_getValue: (key, fallback) => fallback,
    GM_setValue: (key, value) => { calls.push([key, value]); },
    GM_deleteValue: () => {}
  };
  const storage = storageModule.createStorage(host);
  const oversized = { data: "x".repeat(41 * 1024 * 1024) };
  assert.equal(storage.write("gigante", oversized), false);
  assert.deepEqual(calls, []);
  storage.write("pequeno", { ok: true });
  assert.equal(calls.length, 1);
});

test("lista as chaves via GM_listValues e pelo fallback localStorage", () => {
  const gmValues = new Map([["a", 1], ["b", 2]]);
  const localValues = new Map([["c", "x"], ["d", "y"]]);
  const host = {
    GM_listValues: () => Array.from(gmValues.keys()),
    localStorage: {
      length: localValues.size,
      key: (index) => Array.from(localValues.keys())[index],
      getItem: (key) => localValues.has(key) ? localValues.get(key) : null,
      setItem: (key, value) => localValues.set(key, value),
      removeItem: (key) => localValues.delete(key)
    }
  };
  const storage = storageModule.createStorage(host);
  assert.deepEqual(storage.list(), ["a", "b"]);

  const withoutGM = storageModule.createStorage({ localStorage: host.localStorage });
  assert.deepEqual(withoutGM.list(), ["c", "d"]);
});
