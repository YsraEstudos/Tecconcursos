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
  const values = new Map();
  const host = {
    GM_getValue: (key, fallback) => values.has(key) ? values.get(key) : fallback,
    GM_setValue: (key, value) => { calls.push([key, value]); values.set(key, value); },
    GM_deleteValue: (key) => values.delete(key),
    GM_listValues: () => Array.from(values.keys())
  };
  const storage = storageModule.createStorage(host);
  assert.equal(storage.usesGM, true);
  const oversized = { data: "x".repeat(41 * 1024 * 1024) };
  assert.equal(storage.write("gigante", oversized), false);
  assert.deepEqual(calls, []);
  storage.write("pequeno", { ok: true });
  assert.equal(calls.length, 1);
});

test("mede o payload em bytes UTF-8 e bloqueia mensagens muito abaixo de 64MiB", () => {
  const calls = [];
  const storage = storageModule.createStorage({
    GM_setValue: (key, value) => calls.push([key, value])
  });

  const unicodePayload = { data: "😀".repeat(3 * 1024 * 1024) };
  assert.equal(storage.write("unicode-grande", unicodePayload), false);
  assert.deepEqual(calls, []);
});

test("bloqueia uma nova chave quando o total GM ultrapassa o orçamento agregado", () => {
  const calls = [];
  const values = new Map(
    Array.from({ length: 7 }, (_, index) => ["biblioteca-" + index, "x".repeat(7 * 1024 * 1024)])
  );
  const host = {
    GM_getValue: (key, fallback) => values.has(key) ? values.get(key) : fallback,
    GM_setValue: (key, value) => { calls.push([key, value]); values.set(key, value); },
    GM_deleteValue: (key) => values.delete(key),
    GM_listValues: () => Array.from(values.keys())
  };
  const storage = storageModule.createStorage(host);

  assert.equal(storage.write("biblioteca-nova", "y".repeat(8 * 1024 * 1024)), false);
  assert.deepEqual(calls, []);
  assert.equal(values.has("biblioteca-nova"), false);
});

test("considera a substituição da chave e libera espaço depois da remoção", () => {
  const values = new Map([
    ["biblioteca-alvo", "a".repeat(8 * 1024 * 1024)],
    ...Array.from({ length: 6 }, (_, index) => ["biblioteca-" + index, "x".repeat(7 * 1024 * 1024)])
  ]);
  const writes = [];
  const host = {
    GM_getValue: (key, fallback) => values.has(key) ? values.get(key) : fallback,
    GM_setValue: (key, value) => { writes.push(key); values.set(key, value); },
    GM_deleteValue: (key) => values.delete(key),
    GM_listValues: () => Array.from(values.keys())
  };
  const storage = storageModule.createStorage(host);

  assert.equal(storage.write("biblioteca-alvo", "b".repeat(8 * 1024 * 1024)), true);
  storage.remove("biblioteca-0");
  assert.equal(storage.write("biblioteca-nova", "y".repeat(8 * 1024 * 1024)), true);
  assert.deepEqual(writes, ["biblioteca-alvo", "biblioteca-nova"]);
});

test("remove chaves GM legadas sem tentar ler payloads potencialmente oversized", () => {
  const values = new Map([
    ["tecconcursos_caderno_automation_v1", "estado legado"],
    ["tecconcursos_export_library_v1", "biblioteca legada"]
  ]);
  const reads = [];
  const removals = [];
  const host = {
    GM_getValue: (key, fallback) => {
      reads.push(key);
      if (values.has(key)) throw new Error("Message exceeded maximum allowed size of 64MiB");
      return values.has(key) ? values.get(key) : fallback;
    },
    GM_setValue: (key, value) => values.set(key, value),
    GM_deleteValue: (key) => { removals.push(key); values.delete(key); },
    GM_listValues: () => Array.from(values.keys())
  };

  const storage = storageModule.createStorage(host);

  assert.deepEqual(removals.sort(), [
    "tecconcursos_caderno_automation_v1",
    "tecconcursos_export_library_v1"
  ]);
  assert.equal(reads.some((key) => key.endsWith("_v1")), false);
  assert.equal(storage.write("pequeno", { ok: true }), true);
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
  assert.equal(storage.usesGM, true);
  assert.deepEqual(storage.list(), ["a", "b"]);

  const withoutGM = storageModule.createStorage({ localStorage: host.localStorage });
  assert.equal(withoutGM.usesGM, false);
  assert.deepEqual(withoutGM.list(), ["c", "d"]);
});
