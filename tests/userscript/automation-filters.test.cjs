const test = require("node:test");
const assert = require("node:assert/strict");
const filters = require("../../src/userscript/automation-filters.cjs");

test("aguarda a aba de matéria aparecer antes de informar que ela não existe", async () => {
  let menuReads = 0;
  let selected = false;
  const input = { value: "", dispatchEvent() {} };
  const target = { click() { selected = true; } };
  const item = {
    nodeType: 1,
    className: "",
    style: {},
    parentElement: null,
    classList: { contains(name) { return name === "arvore-item-selecionado" && selected; } },
    getAttribute(name) { return name === "title" ? "Concordância" : null; },
    innerText: "Concordância",
    textContent: "Concordância",
    querySelector(selector) { return selector === ".arvore-item-conteudo" ? target : null; }
  };
  const tab = {
    nodeType: 1,
    className: "",
    style: {},
    parentElement: null,
    innerText: "Matéria e assunto",
    textContent: "Matéria e assunto"
  };
  const box = {
    nodeType: 1,
    className: "",
    style: {},
    parentElement: null,
    getAttribute(name) { return name === "titulo" ? "Matérias e assuntos" : null; },
    querySelectorAll(selector) {
      if (selector === "a") return [];
      if (selector === ".arvore-item") return [item];
      return [];
    },
    querySelector() { return input; }
  };
  const documentNode = {
    querySelectorAll(selector) {
      if (selector === ".menu-alternador-opcao") {
        menuReads += 1;
        return menuReads < 2 ? [] : [tab];
      }
      if (selector === ".gerador-buscador") return [box];
      return [];
    }
  };

  await filters.selectTreeValue(documentNode, "Matéria e assunto", "Concordância");

  assert.equal(menuReads >= 2, true);
  assert.equal(selected, true);
});

test("não clica em um filtro depois que o guard de pausa é acionado", async () => {
  let clicked = false;
  let selected = false;
  const item = {
    nodeType: 1,
    className: "",
    style: {},
    parentElement: null,
    classList: { contains(name) { return name === "arvore-item-selecionado" && selected; } },
    getAttribute(name) { return name === "title" ? "2024" : null; },
    innerText: "2024",
    textContent: "2024",
    querySelector() { return this; },
    click() { clicked = true; selected = true; }
  };
  const box = {
    nodeType: 1,
    className: "",
    style: {},
    parentElement: null,
    getAttribute(name) { return name === "titulo" ? "Anos" : null; },
    innerText: "Anos",
    textContent: "Anos",
    querySelectorAll(selector) { return selector === ".arvore-item" ? [item] : []; },
    querySelector() { return null; }
  };
  const documentNode = {
    querySelectorAll(selector) {
      if (selector === ".menu-alternador-opcao") return [{ innerText: "Ano", textContent: "Ano", nodeType: 1, className: "", style: {}, parentElement: null }];
      if (selector === ".gerador-buscador") return [box];
      return [];
    }
  };
  const pauseError = Object.assign(new Error("pausada"), { code: "AUTOMATION_PAUSED" });

  await assert.rejects(
    filters.selectTreeValue(documentNode, "Ano", "2024", () => { throw pauseError; }),
    error => error.code === "AUTOMATION_PAUSED"
  );
  assert.equal(clicked, false);
});

test("reutiliza o painel de busca estável durante a seleção do item", async () => {
  let searchBoxReads = 0;
  let selected = false;
  const input = { value: "", dispatchEvent() {} };
  const target = { click() { selected = true; } };
  const item = {
    nodeType: 1,
    className: "",
    style: {},
    parentElement: null,
    classList: { contains(name) { return name === "arvore-item-selecionado" && selected; } },
    getAttribute(name) { return name === "title" ? "FCC" : null; },
    innerText: "FCC",
    textContent: "FCC",
    querySelector(selector) { return selector === ".arvore-item-conteudo" ? target : null; }
  };
  const tab = {
    nodeType: 1,
    className: "",
    style: {},
    parentElement: null,
    innerText: "Banca",
    textContent: "Banca"
  };
  const box = {
    nodeType: 1,
    className: "",
    style: {},
    parentElement: null,
    getAttribute(name) { return name === "titulo" ? "Bancas" : null; },
    querySelectorAll(selector) {
      if (selector === "a") return [];
      if (selector === ".arvore-item") return [item];
      return [];
    },
    querySelector() { return input; }
  };
  const documentNode = {
    querySelectorAll(selector) {
      if (selector === ".menu-alternador-opcao") return [tab];
      if (selector === ".gerador-buscador") {
        searchBoxReads += 1;
        return [box];
      }
      return [];
    }
  };

  await filters.selectTreeValue(documentNode, "Banca", "FCC");

  assert.equal(selected, true);
  assert.equal(searchBoxReads, 1);
});
