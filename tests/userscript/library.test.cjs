const test = require("node:test");
const assert = require("node:assert/strict");
const library = require("../../src/userscript/library.cjs");

function storageStub() {
  const data = new Map();
  return { read: (key, fallback) => data.has(key) ? data.get(key) : fallback, write: (key, value) => data.set(key, value) };
}

function fragmentNode(html, baseURI) {
  const fragment = {
    baseURI,
    innerHTML: html,
    cloneNode() {
      const clone = { baseURI, innerHTML: html };
      clone.querySelectorAll = (selector) => selector === "img" ? [{
        currentSrc: "",
        getAttribute(name) {
          const match = clone.innerHTML.match(new RegExp(name + "\\s*=\\s*([\\\"'])(.*?)\\1", "i"));
          return match ? match[2] : null;
        },
        setAttribute(name, value) {
          const pattern = new RegExp("(" + name + "\\s*=\\s*)([\\\"'])(.*?)\\2", "i");
          clone.innerHTML = clone.innerHTML.replace(pattern, "$1$2" + value + "$2");
        }
      }] : [];
      return clone;
    }
  };
  return fragment;
}

const entry = {
  id: "95080137",
  cadernoId: "95080137",
  code: "MAT-001",
  title: "Coesão textual",
  group: "Português",
  questions: [{
    id: "3821151",
    number: 1,
    bank: "FCC",
    year: 2026,
    vacancy: "Ass GA",
    organization: "CPRH",
    role: "Assistente Administrativo",
    subject: "Língua Portuguesa",
    topic: "Coesão",
    statement: "Texto da questão",
    options: [{ letter: "A", text: "Alternativa A" }, { letter: "B", text: "Alternativa B" }]
  }]
};

test("interpreta banca, vaga, órgão, cargo e ano do cabeçalho impresso", () => {
  assert.deepEqual(library.parseHeader("FCC - Ass GA (CPRH)/CPRH/Assistente Administrativo/2026"), {
    raw: "FCC - Ass GA (CPRH)/CPRH/Assistente Administrativo/2026",
    bank: "FCC",
    vacancy: "Ass GA (CPRH)",
    organization: "CPRH",
    role: "Assistente Administrativo",
    year: 2026
  });
});

test("interpreta ano posicionado entre a banca e a vaga no cabeçalho real", () => {
  assert.deepEqual(library.parseHeader("FCC - 2022 - Analista Judiciário (TRT 9ª Região)/Judiciária/Oficial de Justiça Avaliador Federal"), {
    raw: "FCC - 2022 - Analista Judiciário (TRT 9ª Região)/Judiciária/Oficial de Justiça Avaliador Federal",
    bank: "FCC",
    vacancy: "Analista Judiciário (TRT 9ª Região)",
    organization: "Judiciária",
    role: "Oficial de Justiça Avaliador Federal",
    year: 2022
  });
});

test("preserva o número original da questão ao consolidar uma parte iniciada em 201", () => {
  const node = {
    querySelector(selector) {
      if (selector === "a[href*='/questoes/']") return { href: "https://www.tecconcursos.com.br/questoes/123" };
      if (selector === ".cabecalho .informacoes") return { children: [{ className: "linkQuestao" }, { className: "", innerText: "FCC - Cargo/Órgão/Cargo/2025" }] };
      if (selector === ".classificacao") return { innerText: "Língua Portuguesa - Coesão" };
      if (selector === ".enunciado") return { innerText: "201) Enunciado", innerHTML: "201) Enunciado" };
      if (selector === ".enunciado strong") return { innerText: "201)" };
      return null;
    },
    querySelectorAll() { return []; }
  };
  assert.equal(library.parsePrintedQuestion(node, 0).number, 201);
});

test("normaliza imagens relativas para URLs absolutas ao capturar o HTML impresso", () => {
  const statement = fragmentNode('<p>Texto</p><img src="/questoes/img/enunciado.png">', "https://www.tecconcursos.com.br/questoes/cadernos/95080137/imprimir");
  const option = fragmentNode('<strong>A)</strong> alternativa <img src="//cdn.example.test/alternativa.jpg">', "https://www.tecconcursos.com.br/questoes/cadernos/95080137/imprimir");
  const node = {
    querySelector(selector) {
      if (selector === "a[href*='/questoes/']") return { href: "https://www.tecconcursos.com.br/questoes/123" };
      if (selector === ".cabecalho .informacoes") return { children: [{ className: "", innerText: "FCC - Cargo/Órgão/Cargo/2025" }] };
      if (selector === ".classificacao") return { innerText: "Língua Portuguesa - Coesão" };
      if (selector === ".enunciado") return statement;
      if (selector === ".enunciado strong") return { innerText: "1)" };
      if (selector === ".gabarito, .resposta-correta") return { innerText: "B" };
      return null;
    },
    querySelectorAll(selector) {
      return selector === ".alternativa" ? [Object.assign(option, { innerText: "A) alternativa", textContent: "A) alternativa" })] : [];
    }
  };

  const question = library.parsePrintedQuestion(node, 0);

  assert.match(question.statementHtml, /src="https:\/\/www\.tecconcursos\.com\.br\/questoes\/img\/enunciado\.png"/);
  assert.match(question.options[0].html, /src="https:\/\/cdn\.example\.test\/alternativa\.jpg"/);
});

test("restaura a URL protegida da imagem ao serializar a questão", () => {
  const statement = fragmentNode('<p>Texto</p><img src="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=" data-tec-original-src="/questoes/img/enunciado.png">', "https://www.tecconcursos.com.br/questoes/cadernos/95080137/imprimir");
  const node = {
    querySelector(selector) {
      if (selector === "a[href*='/questoes/']") return { href: "https://www.tecconcursos.com.br/questoes/123" };
      if (selector === ".cabecalho .informacoes") return { children: [{ className: "", innerText: "FCC - Cargo/Órgão/Cargo/2025" }] };
      if (selector === ".classificacao") return { innerText: "Língua Portuguesa - Coesão" };
      if (selector === ".enunciado") return statement;
      if (selector === ".enunciado strong") return { innerText: "1)" };
      return null;
    },
    querySelectorAll() { return []; }
  };

  const question = library.parsePrintedQuestion(node, 0);

  assert.match(question.statementHtml, /src="https:\/\/www\.tecconcursos\.com\.br\/questoes\/img\/enunciado\.png"/);
  assert.doesNotMatch(question.statementHtml, /data:image\/gif/);
});

test("cede o thread entre lotes e interrompe a extração quando a automação é pausada", async () => {
  const node = {
    querySelector(selector) {
      if (selector === "a[href*='/questoes/']") return { href: "https://www.tecconcursos.com.br/questoes/123" };
      if (selector === ".cabecalho .informacoes") return { children: [{ className: "", innerText: "FCC - Cargo/Órgão/Cargo/2025" }] };
      if (selector === ".classificacao") return { innerText: "Língua Portuguesa - Coesão" };
      if (selector === ".enunciado") return { innerText: "1) Enunciado", innerHTML: "1) Enunciado" };
      if (selector === ".enunciado strong") return { innerText: "1)" };
      return null;
    },
    querySelectorAll() { return []; }
  };
  const documentNode = { querySelectorAll: () => Array.from({ length: 5 }, () => node) };
  let yields = 0;
  let checks = 0;
  const paused = Object.assign(new Error("pausada"), { code: "AUTOMATION_PAUSED" });

  await assert.rejects(
    library.extractPrintedQuestionsAsync(documentNode, {
      chunkSize: 2,
      yieldToBrowser: async () => { yields += 1; },
      ensureRunning: () => {
        checks += 1;
        if (checks >= 2) throw paused;
      }
    }),
    error => error.code === "AUTOMATION_PAUSED"
  );
  assert.equal(yields, 1);
  assert.equal(checks, 2);
});

test("biblioteca consolida partes sem duplicar questão", () => {
  const instance = library.createLibrary(storageStub());
  instance.appendPart(Object.assign({}, entry, { start: 1 }), entry.questions);
  const saved = instance.appendPart(Object.assign({}, entry, { start: 201 }), entry.questions);
  assert.equal(saved.questions.length, 1);
  assert.equal(saved.parts.length, 2);
});

test("gera Excel e HTML interativo baixáveis", async () => {
  const csv = library.buildCsv(entry);
  const xlsx = await library.buildXlsxBlob(entry);
  const html = library.buildInteractiveHtml(entry);
  assert.match(csv, /Alternativa A/);
  assert.match(csv, /FCC/);
  assert.match(csv, /2026/);
  assert.equal(xlsx.type, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  const bytes = new Uint8Array(await xlsx.arrayBuffer());
  assert.ok(bytes.byteLength > 100);
  assert.deepEqual(Array.from(bytes.slice(0, 2)), [0x50, 0x4B]);
  assert.match(new TextDecoder().decode(bytes), /autoFilter ref="A1:S2"/);
  assert.match(html, /Baixar HTML com histórico/);
  assert.match(html, /tecconcursos-html-v1/);
  assert.match(html, /duplo clique/i);
  assert.match(html, /background:#0b1120/);
  assert.match(html, /id=\"feedback\"/);
  assert.match(html, /\.option\.correct/);
  const scripts = Array.from(html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi));
  assert.doesNotThrow(() => new Function(scripts[scripts.length - 1][1]));
});
