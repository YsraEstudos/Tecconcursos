const test = require("node:test");
const assert = require("node:assert/strict");
const dom = require("../../src/userscript/automation-dom.cjs");

test("normaliza texto e identifica visibilidade sem depender de Angular", () => {
  assert.equal(dom.clean("  Coerência\u00a0.  Coesão  "), "Coerência . Coesão");
  assert.equal(dom.sameText(" OBJETIVA CONCURSOS ", "objetiva concursos"), true);
  assert.equal(dom.isVisible({ nodeType: 1, className: "", style: {}, parentElement: null }), true);
  assert.equal(dom.isVisible({ nodeType: 1, className: "ng-hide", style: {}, parentElement: null }), false);
});

test("aciona fallback Angular quando o elemento não possui click utilizável", () => {
  let calls = 0;
  const documentNode = {
    defaultView: {
      angular: {
        element() {
          return { triggerHandler() { calls += 1; } };
        }
      }
    }
  };
  assert.equal(dom.clickElement(documentNode, {}), true);
  assert.equal(calls, 1);
});
