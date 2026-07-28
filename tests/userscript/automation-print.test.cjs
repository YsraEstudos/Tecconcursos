const test = require("node:test");
const assert = require("node:assert/strict");
const print = require("../../src/userscript/automation-print.cjs");

test("aguarda um intervalo humano antes de cada clique do fluxo de impressão", async () => {
  const events = [];
  let outputOpened = false;
  const printTab = {
    innerText: "Imprimir",
    textContent: "Imprimir",
    getAttribute(name) { return name === "ng-click" ? "onSelecionarAba" : ""; },
    click() { events.push("print-tab"); }
  };
  const confirm = {
    disabled: false,
    click() { events.push("confirm"); outputOpened = true; }
  };
  const initial = {
    value: "1",
    max: "1",
    getAttribute() { return "1"; },
    setAttribute() {},
    dispatchEvent() {}
  };
  const quantity = { value: "1", dispatchEvent() {} };
  const documentNode = {
    querySelectorAll(selector) { return selector === "div[role='button']" ? [printTab] : []; },
    querySelector(selector) {
      if (selector === "#questaoInicialInput") return initial;
      if (selector === "#questoesSequenciais") return { checked: true };
      if (selector === "#numeroQuestoesInput, #numeroQuestoes") return quantity;
      if (selector === "#confirmar-button") return confirm;
      if (selector.includes("form[action")) return { setAttribute() {} };
      return null;
    }
  };
  const state = { running: true, export: { job: { ranges: [], rangeIndex: 0 } } };
  const workflow = print.createPrintWorkflow({
    root: { location: { pathname: "/questoes/cadernos/99288375" } },
    document: documentNode,
    maxPerPrint: 200,
    persistProgress() {},
    isPrintPage() { return outputOpened; },
    ensureRunning() {},
    delayBeforeAction() { events.push("delay"); },
    waitFor(_document, predicate) {
      const result = predicate();
      return result ? Promise.resolve(result) : Promise.reject(new Error("não aguardou"));
    }
  });

  await workflow.submitCurrentRange(state);

  assert.deepEqual(events, ["delay", "print-tab", "delay", "confirm"]);
});

test("recomenda partes menores quando a saída tem muitas imagens", () => {
  assert.equal(print.recommendedMaxPerPrint({ imageCount: 0, contentHtmlLength: 1000 }, 200), 200);
  assert.equal(print.recommendedMaxPerPrint({ imageCount: 15, contentHtmlLength: 1000 }, 200), 100);
  assert.equal(print.recommendedMaxPerPrint({ imageCount: 50, contentHtmlLength: 1000 }, 200), 50);
  assert.equal(print.recommendedMaxPerPrint({ imageCount: 0, contentHtmlLength: 1600000 }, 200), 50);
});
