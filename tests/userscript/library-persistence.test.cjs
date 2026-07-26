const test = require("node:test");
const assert = require("node:assert/strict");
const library = require("../../src/userscript/library.cjs");

function storageStub(initial) {
  const values = new Map(Object.entries(initial || {}));
  return {
    values,
    read(key, fallback) { return values.has(key) ? values.get(key) : fallback; },
    write(key, value) { values.set(key, value); },
    remove(key) { values.delete(key); }
  };
}

function question(id, number) {
  return { id, number, bank: "FCC", year: 2025, statement: "Questão " + number, options: [] };
}

function entry(start) {
  return { libraryId: "caderno-persistente", cadernoId: "caderno-persistente", title: "Caderno persistente", code: "MAT-001", group: "Português", start };
}

test("uma nova instância hidrata a biblioteca salva e mantém partes ordenadas", () => {
  const storage = storageStub();
  const first = library.createLibrary(storage);
  first.appendPart(entry(201), [question("q201", 201)]);
  first.appendPart(entry(1), [question("q1", 1)]);

  const reloaded = library.createLibrary(storage);
  const saved = reloaded.get("caderno-persistente");

  assert.equal(saved.questions.length, 2);
  assert.deepEqual(saved.questions.map(item => item.number), [201, 1]);
  assert.deepEqual(saved.parts.map(part => part.start), [1, 201]);
  assert.deepEqual(reloaded.list().map(item => item.title), ["Caderno persistente"]);
});

test("reprocessar a mesma parte é idempotente e não zera seu contador", () => {
  const storage = storageStub();
  const instance = library.createLibrary(storage);
  instance.appendPart(entry(1), [question("q1", 1)]);
  const saved = instance.appendPart(entry(1), [question("q1", 1)]);

  assert.equal(saved.questions.length, 1);
  assert.equal(saved.parts.length, 1);
  assert.equal(saved.parts[0].count, 1);
});

test("biblioteca corrompida é substituída por uma estrutura vazia ao ser lida", () => {
  const storage = storageStub({ tecconcursos_export_library_v1: [] });
  const instance = library.createLibrary(storage);

  assert.deepEqual(instance.list(), []);
  instance.appendPart(entry(1), [question("q1", 1)]);
  assert.equal(instance.get("caderno-persistente").questions.length, 1);
});

test("lista a biblioteca com uma única leitura do armazenamento", () => {
  const values = {
    version: 1,
    entries: {
      primeiro: { id: "primeiro", title: "Primeiro", group: "Grupo" },
      segundo: { id: "segundo", title: "Segundo", group: "Grupo" }
    }
  };
  let reads = 0;
  const storage = {
    read(key, fallback) {
      reads += 1;
      return key === "tecconcursos_export_library_v1" ? values : fallback;
    },
    write() {},
    remove() {}
  };

  const entries = library.createLibrary(storage).list();

  assert.equal(entries.length, 2);
  assert.equal(reads, 1);
});
