(function (root, factory) {
  var api = factory(
    typeof module !== "undefined" && module.exports ? { dom: require("./automation-dom.cjs") } : { dom: root.TecConcursosModules.automationDom }
  );
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) {
    root.TecConcursosModules = root.TecConcursosModules || {};
    root.TecConcursosModules.automationPrint = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (deps) {
  "use strict";

  var clean = deps.dom.clean;
  var sameText = deps.dom.sameText;
  var isVisible = deps.dom.isVisible;
  var waitFor = deps.dom.waitFor;
  var setInputValue = deps.dom.setInputValue;
  var clickElement = deps.dom.clickElement;

  function splitRanges(total, maxPerPrint) {
    var count = Math.max(0, Math.floor(Number(total) || 0));
    var size = Math.max(1, Math.floor(Number(maxPerPrint) || 200));
    var ranges = [];
    for (var start = 1; start <= count; start += size) {
      ranges.push({ start: start, count: Math.min(size, count - start + 1) });
    }
    return ranges;
  }

  function recommendedMaxPerPrint(metrics, fallback) {
    var limit = Math.max(1, Math.floor(Number(fallback) || 200));
    var imageCount = Math.max(0, Math.floor(Number(metrics && metrics.imageCount) || 0));
    var contentHtmlLength = Math.max(0, Math.floor(Number(metrics && metrics.contentHtmlLength) || 0));
    if (imageCount >= 40 || contentHtmlLength >= 1500000) return Math.min(limit, 50);
    if (imageCount >= 12 || contentHtmlLength >= 600000) return Math.min(limit, 100);
    return limit;
  }

  function clickPrintTab(documentNode) {
    var target = Array.from(documentNode.querySelectorAll("div[role='button']")).filter(isVisible).find(function (node) {
      return sameText(node.innerText || node.textContent, "Imprimir") && /onSelecionarAba|mostrarAlertaExclusivoParaAssinantes/.test(node.getAttribute("ng-click") || "");
    });
    if (target) clickElement(documentNode, target);
    return Boolean(target);
  }

  function preparePrintForm(documentNode) {
    if (!documentNode || typeof documentNode.querySelector !== "function") return false;
    var form = documentNode.querySelector("#configurar-impressao form, form[action*='/questoes/cadernos/'][action*='/imprimir']");
    if (!form) return false;
    // O fluxo usa a aba atual para que o próximo estado seja retomado sem popup.
    form.setAttribute("target", "_self");
    return true;
  }

  function createPrintWorkflow(context) {
    var rootNode = context.root;
    var documentNode = context.document;
    var maxPerPrint = context.maxPerPrint || 200;

    function ensureRunning(state) {
      if (typeof context.ensureRunning === "function") context.ensureRunning(state);
    }

    function waitForRunning(state, predicate, timeoutMs, message) {
      return waitFor(documentNode, function () {
        ensureRunning(state);
        return predicate();
      }, timeoutMs, message);
    }

    async function submitCurrentRange(state) {
      ensureRunning(state);
      var job = state.export.job;
      if (typeof context.delayBeforeAction === "function") await context.delayBeforeAction(state);
      ensureRunning(state);
      if (!clickPrintTab(documentNode)) throw new Error("Não encontrei a aba Imprimir do caderno.");
      var initialInput = await waitForRunning(state, function () { return documentNode.querySelector("#questaoInicialInput"); }, 10000, "A tela de impressão não exibiu o campo de questão inicial.");
      var total = Number(initialInput.getAttribute("max") || initialInput.max || 0);
      if (!job.ranges.length) {
        if (!total) throw new Error("O TecConcursos não informou a quantidade total de questões para imprimir.");
        job.maxPerPrint = Math.max(1, Math.floor(Number(job.maxPerPrint) || maxPerPrint));
        job.ranges = splitRanges(total, job.maxPerPrint);
        job.rangeIndex = 0;
      }
      if (!job.printTotalQuestions) job.printTotalQuestions = total;
      var current = job.ranges[job.rangeIndex];
      if (!current) throw new Error("Não existe uma parte pendente para imprimir.");
      ensureRunning(state);
      context.persistProgress(state, {
        phase: "preparing-print",
        message: "Preparando parte " + String(job.rangeIndex + 1) + " de " + String(job.ranges.length) + ": questões " + current.start + " a " + String(current.start + current.count - 1) + ".",
        matterCode: job.code,
        matterTitle: job.title,
        rangeIndex: job.rangeIndex,
        rangesTotal: job.ranges.length,
        printTotalQuestions: job.printTotalQuestions
      });
      var sequential = documentNode.querySelector("#questoesSequenciais");
      ensureRunning(state);
      if (sequential && !sequential.checked && typeof context.delayBeforeAction === "function") await context.delayBeforeAction(state);
      ensureRunning(state);
      if (sequential && !sequential.checked && !clickElement(documentNode, sequential)) throw new Error("Não consegui selecionar 'A partir da questão'.");
      setInputValue(initialInput, current.start);
      var quantityInput = documentNode.querySelector("#numeroQuestoesInput, #numeroQuestoes");
      if (quantityInput) setInputValue(quantityInput, current.count);
      if (String(initialInput.value) !== String(current.start)) throw new Error("O início da impressão não foi atualizado para a questão " + current.start + ".");
      if (quantityInput && String(quantityInput.value) !== String(current.count)) throw new Error("A quantidade da parte não foi atualizada para " + current.count + " questões.");
      var confirm = documentNode.querySelector("#confirmar-button");
      if (!confirm || confirm.disabled) throw new Error("O botão 'Imprimir Caderno' não ficou disponível.");
      if (!preparePrintForm(documentNode)) throw new Error("Não encontrei o formulário de impressão do caderno.");
      ensureRunning(state);
      context.persistProgress(state, {
        phase: "opening-output",
        message: "Enviando a parte " + String(job.rangeIndex + 1) + " de " + String(job.ranges.length) + " para a saída de impressão.",
        matterCode: job.code,
        matterTitle: job.title,
        rangeIndex: job.rangeIndex,
        rangesTotal: job.ranges.length,
        printTotalQuestions: job.printTotalQuestions
      });
      if (typeof context.delayBeforeAction === "function") await context.delayBeforeAction(state);
      ensureRunning(state);
      if (!clickElement(documentNode, confirm)) throw new Error("Encontrei 'Imprimir Caderno', mas não consegui acionar o botão.");
      await waitForRunning(state, function () { return context.isPrintPage(rootNode); }, 8000, "O clique em 'Imprimir Caderno' não abriu a página HTML de saída.");
      return "Abrindo a parte iniciada na questão " + current.start + ".";
    }

    return { submitCurrentRange: submitCurrentRange };
  }

  return {
    splitRanges: splitRanges,
    recommendedMaxPerPrint: recommendedMaxPerPrint,
    clickPrintTab: clickPrintTab,
    preparePrintForm: preparePrintForm,
    createPrintWorkflow: createPrintWorkflow
  };
});
