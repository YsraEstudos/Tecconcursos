const test = require("node:test");
const assert = require("node:assert/strict");
const blocker = require("../../src/userscript/print-blocker.cjs");

test("bloqueia window.print na saída e não permite que a página o substitua", () => {
  let nativePrints = 0;
  const originalPrint = () => { nativePrints += 1; };
  const root = {
    location: { pathname: "/questoes/cadernos/99288375/imprimir" },
    print: originalPrint,
    document: null
  };

  assert.equal(blocker.suppressNativePrintOnOutputPage(root), true);
  root.print = originalPrint;
  root.print();

  assert.equal(nativePrints, 0);
  assert.equal(blocker.suppressNativePrintOnOutputPage({ location: { pathname: "/questoes/cadernos/99288375" } }), false);
});

test("bloqueia popup e submissão de impressão somente quando há exportação pendente", () => {
  let nativePrints = 0;
  let nativeOpens = 0;
  let nativeSubmits = 0;
  let nativeRequestSubmits = 0;
  const originalPrint = () => { nativePrints += 1; };
  const originalOpen = () => { nativeOpens += 1; return { opened: true }; };
  function HTMLFormElement() {}
  HTMLFormElement.prototype.submit = function () { nativeSubmits += 1; };
  HTMLFormElement.prototype.requestSubmit = function () { nativeRequestSubmits += 1; };
  const documentNode = {
    addEventListener() {},
    removeEventListener() {}
  };
  const root = {
    location: { pathname: "/questoes/cadernos/99288375/imprimir", href: "https://www.tecconcursos.com.br/questoes/cadernos/99288375/imprimir" },
    print: originalPrint,
    open: originalOpen,
    HTMLFormElement,
    document: documentNode
  };

  assert.equal(blocker.suppressNativePrintOnOutputPage(root, { enabled: true, pageWindow: root }), true);
  root.print();
  assert.equal(nativePrints, 0);
  assert.equal(root.open("/questoes/cadernos/99288375/imprimir"), null);
  assert.equal(nativeOpens, 0);

  const form = new HTMLFormElement();
  form.action = "/questoes/cadernos/99288375/imprimir";
  form.submit();
  form.requestSubmit();
  assert.equal(nativeSubmits, 0);
  assert.equal(nativeRequestSubmits, 0);

  const inactiveRoot = {
    location: root.location,
    print: originalPrint,
    open: originalOpen,
    HTMLFormElement: function HTMLFormElementInactive() {},
    document: documentNode
  };
  inactiveRoot.HTMLFormElement.prototype.submit = function () { nativeSubmits += 1; };
  inactiveRoot.HTMLFormElement.prototype.requestSubmit = function () { nativeRequestSubmits += 1; };
  assert.equal(blocker.suppressNativePrintOnOutputPage(inactiveRoot, { enabled: false, pageWindow: inactiveRoot }), true);
  inactiveRoot.print();
  inactiveRoot.open("/questoes/cadernos/99288375/imprimir");
  const inactiveForm = new inactiveRoot.HTMLFormElement();
  inactiveForm.action = "/questoes/cadernos/99288375/imprimir";
  inactiveForm.submit();
  inactiveForm.requestSubmit();
  assert.equal(nativePrints, 1);
  assert.equal(nativeOpens, 1);
  assert.equal(nativeSubmits, 1);
  assert.equal(nativeRequestSubmits, 1);
});

test("intercepta cliques e envios destinados à rota de impressão", () => {
  const listeners = {};
  const root = {
    location: { pathname: "/questoes/cadernos/99288375/imprimir", href: "https://www.tecconcursos.com.br/questoes/cadernos/99288375/imprimir" },
    print() {},
    document: {
      addEventListener(type, listener) { listeners[type] = listener; },
      removeEventListener() {}
    }
  };

  blocker.suppressNativePrintOnOutputPage(root, { enabled: true, pageWindow: root });

  let prevented = false;
  let stopped = false;
  const anchor = {
    tagName: "A",
    href: "https://www.tecconcursos.com.br/questoes/cadernos/99288375/imprimir"
  };
  listeners.click({
    target: anchor,
    preventDefault() { prevented = true; },
    stopImmediatePropagation() { stopped = true; }
  });
  assert.equal(prevented, true);
  assert.equal(stopped, true);

  prevented = false;
  stopped = false;
  listeners.click({
    target: { tagName: "BUTTON", formAction: "https://www.tecconcursos.com.br/questoes/cadernos/99288375/imprimir" },
    preventDefault() { prevented = true; },
    stopImmediatePropagation() { stopped = true; }
  });
  assert.equal(prevented, false);
  assert.equal(stopped, false);

  prevented = false;
  stopped = false;
  const form = { action: "/questoes/cadernos/99288375/imprimir" };
  listeners.submit({
    target: form,
    preventDefault() { prevented = true; },
    stopImmediatePropagation() { stopped = true; }
  });
  assert.equal(prevented, true);
  assert.equal(stopped, true);
});

test("instala a ponte page-world uma única vez por documento", () => {
  let bridgeCalls = 0;
  const root = {
    location: { pathname: "/questoes/cadernos/99288375/imprimir" },
    print() {},
    document: {}
  };
  const addElement = (_tagName, attributes) => {
    bridgeCalls += 1;
    assert.match(attributes.textContent, /__tecConcursosPrintGuard/);
    return { remove() {} };
  };

  blocker.suppressNativePrintOnOutputPage(root, { enabled: true, pageWindow: root, addElement });
  blocker.suppressNativePrintOnOutputPage(root, { enabled: true, pageWindow: root, addElement });

  assert.equal(bridgeCalls, 1);
});
