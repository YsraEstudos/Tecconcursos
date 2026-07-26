const test = require("node:test");
const assert = require("node:assert/strict");
const timing = require("../../src/userscript/timing.cjs");

test("gera delays dentro de 6-10 segundos e permite variação", () => {
  assert.equal(timing.randomInt(6000, 10000, () => 0), 6000);
  assert.equal(timing.randomInt(6000, 10000, () => 0.999999), 10000);
  const values = new Set([
    timing.randomInt(6000, 10000, () => 0.1),
    timing.randomInt(6000, 10000, () => 0.8)
  ]);
  assert.deepEqual([...values], [6400, 9200]);
});
