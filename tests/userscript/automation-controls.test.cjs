const test = require("node:test");
const assert = require("node:assert/strict");
const controls = require("../../src/userscript/automation-controls.cjs");

function eventRoot() {
  const listeners = new Map();
  return {
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeEventListener(type, listener) {
      if (listeners.get(type) === listener) listeners.delete(type);
    },
    dispatch(event) {
      const listener = listeners.get("keydown");
      if (listener) listener(event);
    },
    hasKeydownListener() { return listeners.has("keydown"); }
  };
}

test("ESC interrompe a automação e impede a ação padrão do navegador", () => {
  const root = eventRoot();
  let stops = 0;
  let prevented = 0;
  let propagationStopped = 0;
  const controller = controls.createEscapeStop({
    root,
    onStop() { stops += 1; }
  });

  root.dispatch({
    key: "Escape",
    preventDefault() { prevented += 1; },
    stopPropagation() { propagationStopped += 1; }
  });

  assert.equal(stops, 1);
  assert.equal(prevented, 1);
  assert.equal(propagationStopped, 1);
  controller.destroy();
  assert.equal(root.hasKeydownListener(), false);
});

test("teclas diferentes de ESC não param a automação", () => {
  const root = eventRoot();
  let stops = 0;
  controls.createEscapeStop({ root, onStop() { stops += 1; } });

  root.dispatch({ key: "Enter" });

  assert.equal(stops, 0);
});
