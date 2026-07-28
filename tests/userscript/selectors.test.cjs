const test = require("node:test");
const assert = require("node:assert/strict");
const selectors = require("../../src/userscript/selectors.cjs");

test("reconhece a rota de caderno e a rota de filtros", () => {
  assert.equal(selectors.getPageKind({ pathname: "/questoes/cadernos/95080137" }), "caderno");
  assert.equal(selectors.getPageKind({ pathname: "/questoes/filtrar" }), "filtro");
  assert.equal(selectors.getPageKind({ pathname: "/questoes/pastas/6423024" }), "pasta");
  assert.equal(selectors.isSupportedPage({ pathname: "/questoes/pastas/6423024" }), true);
  assert.equal(selectors.getPageKind({ pathname: "/questoes/busca" }), "unknown");
});

test("considera qualquer rota do domínio TecConcursos como página suportada para a Biblioteca TC", () => {
  assert.equal(selectors.isSupportedPage({ hostname: "www.tecconcursos.com.br", pathname: "/financeiro" }), true);
  assert.equal(selectors.isSupportedPage({ hostname: "tecconcursos.com.br", pathname: "/" }), true);
  assert.equal(selectors.isSupportedPage({ hostname: "example.com", pathname: "/financeiro" }), false);
});

test("encontra o botão visível de próxima questão pelo contrato observado", () => {
  let clicks = 0;
  const button = {
    ariaLabel: "Próxima questão",
    disabled: false,
    hidden: false,
    offsetParent: {},
    className: "",
    click: () => { clicks += 1; }
  };
  const root = {
    querySelectorAll: (selector) => selector === "button[aria-label='Próxima questão']" ? [button] : []
  };
  const found = selectors.findNextButton(root);
  assert.equal(found, button);
  found.click();
  assert.equal(clicks, 1);
});
