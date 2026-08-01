const test = require("node:test");
const assert = require("node:assert/strict");
const library = require("../../src/userscript/library.cjs");

function storageStub(initial) {
  const values = new Map(Object.entries(initial || {}));
  return {
    values,
    read(key, fallback) { return values.has(key) ? values.get(key) : fallback; },
    write(key, value) { values.set(key, value); return true; },
    remove(key) { values.delete(key); },
    list() { return Array.from(values.keys()); }
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
  assert.equal(storage.values.has("tecconcursos_export_library_v1"), false, "blob legado corrompido é removido");
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
  let indexReads = 0;
  const storage = {
    read(key, fallback) {
      if (key === library.INDEX_KEY) indexReads += 1;
      return key === library.INDEX_KEY ? values : fallback;
    },
    write() {},
    remove() {},
    list() { return []; }
  };

  const entries = library.createLibrary(storage).list();

  assert.equal(entries.length, 2);
  assert.equal(indexReads, 1);
});

test("migra a biblioteca antiga para chaves por entrada e remove o blob legado", () => {
  const legacy = {
    version: 1,
    entries: {
      "caderno-persistente": {
        id: "caderno-persistente",
        title: "Caderno persistente",
        code: "MAT-001",
        group: "Português",
        parts: [{ start: 1, count: 1 }],
        questions: [question("q1", 1)]
      }
    }
  };
  const storage = storageStub({ tecconcursos_export_library_v1: legacy });
  const instance = library.createLibrary(storage);

  assert.equal(instance.get("caderno-persistente").questions.length, 1);
  assert.ok(storage.values.has(library.LIBRARY_ENTRY_PREFIX + "caderno-persistente"));
  assert.equal(storage.values.has("tecconcursos_export_library_v1"), false, "blob legado removido após migrar");
  const index = storage.values.get(library.INDEX_KEY);
  assert.equal(Array.isArray(index.entries["caderno-persistente"].questions), false);
  assert.equal(index.entries["caderno-persistente"].questionCount, 1);
});

test("appendPart grava a entrada em chave própria e mantém o índice leve", () => {
  const storage = storageStub();
  const instance = library.createLibrary(storage);
  instance.appendPart(entry(1), [question("q1", 1), question("q2", 2)]);

  const saved = storage.values.get(library.LIBRARY_ENTRY_PREFIX + "caderno-persistente");
  assert.equal(saved.questions.length, 2);
  assert.equal(saved.questions[0].id, "q1");
  const index = storage.values.get(library.INDEX_KEY);
  assert.equal(index.entries["caderno-persistente"].questionCount, 2);
  assert.equal(index.entries["caderno-persistente"].questions, undefined);
});

test("remove apaga a entrada e o índice", () => {
  const storage = storageStub();
  const instance = library.createLibrary(storage);
  instance.appendPart(entry(1), [question("q1", 1)]);
  instance.remove("caderno-persistente");

  assert.equal(storage.values.has(library.LIBRARY_ENTRY_PREFIX + "caderno-persistente"), false);
  assert.deepEqual(instance.list(), []);
});

test("list expõe o metadado sem carregar as questões de cada entrada", () => {
  const storage = storageStub();
  const instance = library.createLibrary(storage);
  instance.appendPart(entry(1), [question("q1", 1)]);

  const listed = instance.list()[0];
  assert.equal(listed.questionCount, 1);
  assert.equal(listed.questions, undefined);
  assert.equal(listed.title, "Caderno persistente");
});

test("slimEntryForStorage só remove imagens embutidas quando a entrada é gigante", () => {
  const dataUri = "data:image/png;base64," + "A".repeat(1024 * 1024);
  const base = {
    id: "x",
    title: "X",
    questions: [{ id: "q1", number: 1, statementHtml: "<img src='" + dataUri + "'>", options: [{ letter: "A", html: "<img src='" + dataUri + "'>" }] }]
  };
  const small = library.slimEntryForStorage(base);
  assert.equal(small, base, "entrada pequena não é tocada");

  const huge = library.slimEntryForStorage({
    id: "y",
    title: "Y",
    questions: Array.from({ length: 40 }, (_, index) => Object.assign({}, base.questions[0], { id: "q" + index }))
  });
  assert.equal(huge.questions.length, 40);
  assert.equal(huge.questions[0].statementHtml.includes("base64"), false);
  assert.equal(huge.questions[0].options[0].html.includes("base64"), false);
  assert.equal(base.questions[0].statementHtml.includes("base64"), true, "original preservado");
});

test("appendPart enxuga imagens embutidas antes de gravar a entrada", () => {
  const storage = storageStub();
  const instance = library.createLibrary(storage);
  const dataUri = "data:image/png;base64," + "A".repeat(1024 * 1024);
  const questions = Array.from({ length: 40 }, (_, index) => ({
    id: "huge-" + index,
    number: index + 1,
    bank: "FCC",
    year: 2025,
    statement: "Questão " + (index + 1),
    statementHtml: "<img src='" + dataUri + "'>",
    options: []
  }));
  instance.appendPart(entry(1), questions);

  const saved = storage.values.get(library.LIBRARY_ENTRY_PREFIX + "caderno-persistente");
  assert.ok(saved, "entrada gravada");
  assert.ok(JSON.stringify(saved).length < 64 * 1024 * 1024, "entrada dentro do limite do GM");
  assert.equal(saved.questions[0].statementHtml.includes("base64"), false);
});

test("migração falha silenciosamente por entrada sem perder o resto", () => {
  const legacy = {
    version: 1,
    entries: {
      "caderno-persistente": {
        id: "caderno-persistente",
        title: "Caderno persistente",
        code: "MAT-001",
        group: "Português",
        questions: [question("q1", 1)]
      }
    }
  };
  const writes = new Map();
  const removals = [];
  const storage = {
    read(key, fallback) {
      if (key === "tecconcursos_export_library_v1") return legacy;
      return writes.has(key) ? writes.get(key) : fallback;
    },
    write(key, value) {
      if (key.indexOf(library.LIBRARY_ENTRY_PREFIX) === 0) return false;
      writes.set(key, value);
      return true;
    },
    remove(key) { removals.push(key); },
    list() { return ["tecconcursos_export_library_v1"]; }
  };
  const instance = library.createLibrary(storage);

  assert.equal(instance.get("caderno-persistente").questions.length, 1);
  assert.equal(legacy.entries["caderno-persistente"].questions.length, 1);
  assert.deepEqual(removals, [], "blob legado é mantido quando a migração não completa");
});

test("blob legado inacessível (acima do limite do GM) é removido e a biblioteca continua usável", () => {
  const removals = [];
  const storage = {
    read(key, fallback) {
      if (key === "tecconcursos_export_library_v1") throw new Error("Message exceeded maximum allowed size of 64MiB");
      return fallback;
    },
    write() { return true; },
    remove(key) { removals.push(key); },
    list() { return ["tecconcursos_export_library_v1", "tecconcursos_export_library_entry_v1:outro"]; }
  };
  const instance = library.createLibrary(storage);

  assert.deepEqual(instance.list(), []);
  assert.ok(removals.indexOf("tecconcursos_export_library_v1") !== -1, "blob legado inacessível é removido");
  assert.equal(removals.filter(key => key.indexOf(library.LIBRARY_ENTRY_PREFIX) === 0).length, 0, "entradas por chave não são apagadas");
});

test("limpeza da chave legada acontece uma única vez", () => {
  const legacy = {
    version: 1,
    entries: {
      "caderno-persistente": {
        id: "caderno-persistente",
        title: "Caderno persistente",
        questions: [question("q1", 1)]
      }
    }
  };
  const reads = new Map();
  const storage = {
    values: new Map(),
    read(key, fallback) {
      reads.set(key, (reads.get(key) || 0) + 1);
      if (key === "tecconcursos_export_library_v1") return legacy;
      return storage.values.has(key) ? storage.values.get(key) : fallback;
    },
    write(key, value) { storage.values.set(key, value); return true; },
    remove(key) { storage.values.delete(key); },
    list() {
      const keys = Array.from(storage.values.keys());
      if (keys.indexOf("tecconcursos_export_library_v1") === -1) keys.push("tecconcursos_export_library_v1");
      return keys;
    }
  };

  library.createLibrary(storage);
  const afterFirst = reads.get("tecconcursos_export_library_v1") || 0;
  library.createLibrary(storage);

  assert.equal(afterFirst, 1, "blob legado é lido só na primeira criação");
  assert.equal(reads.get("tecconcursos_export_library_v1"), 1);
  assert.equal(storage.values.has(library.LEGACY_CLEANUP_KEY), true);
});
