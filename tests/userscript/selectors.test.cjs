const test = require("node:test");
const assert = require("node:assert/strict");
const selectors = require("../../src/userscript/selectors.cjs");

test("reconhece a rota de caderno e a rota de filtros", () => {
  assert.equal(selectors.getPageKind({ pathname: "/questoes/cadernos/95080137" }), "caderno");
  assert.equal(selectors.getPageKind({ pathname: "/questoes/filtrar" }), "filtro");
  assert.equal(selectors.getPageKind({ pathname: "/questoes/busca" }), "unknown");
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
