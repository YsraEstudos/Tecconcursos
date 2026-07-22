const test = require("node:test");
const assert = require("node:assert/strict");
const timing = require("../../src/userscript/timing.cjs");

test("gera delays dentro de 4-8 segundos e permite variação", () => {
  assert.equal(timing.randomInt(4000, 8000, () => 0), 4000);
  assert.equal(timing.randomInt(4000, 8000, () => 0.999999), 8000);
  const values = new Set([
    timing.randomInt(4000, 8000, () => 0.1),
    timing.randomInt(4000, 8000, () => 0.8)
  ]);
  assert.deepEqual([...values], [4400, 7200]);
});
