const test = require("node:test");
const assert = require("node:assert/strict");
const navigation = require("../../src/userscript/navigation.cjs");

test("observa o contêiner estável do caderno em vez do body inteiro", async () => {
  const observed = [];
  class FakeMutationObserver {
    constructor() {}
    observe(target, options) {
      observed.push({ target, options });
    }
    disconnect() {}
  }
  const caderno = {};
  const documentNode = {
    body: {},
    defaultView: { MutationObserver: FakeMutationObserver },
    querySelector: (selector) => selector === "#caderno" ? caderno : null
  };

  const result = await navigation.waitForQuestionChange(
    documentNode,
    "q-1",
    () => "q-1",
    { timeoutMs: 1, pollMs: 1 }
  );

  assert.equal(result, false);
  assert.equal(observed[0].target, caderno);
  assert.deepEqual(observed[0].options, { childList: true, subtree: true, characterData: true });
});
