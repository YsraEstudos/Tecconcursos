const test = require("node:test");
const assert = require("node:assert/strict");
const activity = require("../../src/userscript/automation-activity.cjs");

function fakeClock() {
  let nextId = 1;
  const timers = new Map();
  return {
    setTimeout(callback, delay) {
      const id = nextId++;
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
    runAll() {
      for (const [id, timer] of Array.from(timers)) {
        timers.delete(id);
        timer.callback();
      }
    },
    pending() { return timers.size; }
  };
}

function documentStub() {
  const listeners = new Map();
  return {
    hidden: true,
    visibilityState: "hidden",
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeEventListener(type, listener) { if (listeners.get(type) === listener) listeners.delete(type); },
    dispatch(type) { const listener = listeners.get(type); if (listener) listener(); }
  };
}

test("pausa uma página oculta após o timeout e cancela ao voltar", () => {
  const clock = fakeClock();
  const documentNode = documentStub();
  let pauses = 0;
  const monitor = activity.createInactivityMonitor({
    root: clock,
    document: documentNode,
    timeoutMs: 60000,
    onInactive() { pauses += 1; }
  });

  monitor.start();
  assert.equal(clock.pending(), 1);
  clock.runAll();
  assert.equal(pauses, 1);

  documentNode.hidden = false;
  documentNode.visibilityState = "visible";
  documentNode.dispatch("visibilitychange");
  assert.equal(clock.pending(), 0);
  monitor.stop();
});

test("não agenda pausa enquanto a página está visível", () => {
  const clock = fakeClock();
  const documentNode = documentStub();
  documentNode.hidden = false;
  documentNode.visibilityState = "visible";
  const monitor = activity.createInactivityMonitor({ root: clock, document: documentNode, onInactive() {} });

  monitor.start();

  assert.equal(clock.pending(), 0);
  monitor.stop();
});
