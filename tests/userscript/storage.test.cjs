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
