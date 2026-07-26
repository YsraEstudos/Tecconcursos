(function (root, factory) {
  var api = factory(
    typeof module !== "undefined" && module.exports ? { library: require("./library.cjs") } : { library: root.TecConcursosModules.library }
  );
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) {
    root.TecConcursosModules = root.TecConcursosModules || {};
    root.TecConcursosModules.automationOutput = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (deps) {
  "use strict";

  function createOutputWorkflow(context) {
    var rootNode = context.root;
    var documentNode = context.document;
    var outputWaitTimeoutMs = context.outputWaitTimeoutMs || 60000;
    var library = context.library;
    var extractPrintedQuestions = context.extractPrintedQuestions || deps.library.extractPrintedQuestions;

    function ensureRunning(state) {
      if (typeof context.ensureRunning === "function") context.ensureRunning(state);
    }

    function isPausedError(error) {
      return Boolean(error && error.code === "AUTOMATION_PAUSED");
    }

    async function waitForPrintedQuestions(state) {
      ensureRunning(state);
      var job = state.export.job;
      var current = job.ranges[job.rangeIndex];
      var expected = current ? Number(current.count) || 0 : 0;
      var lastCount = -1;
      var observedCount = 0;
      var lastHeartbeat = 0;
      context.persistProgress(state, {
        phase: "waiting-output",
        message: "Aguardando a página HTML montar as questões da parte " + String(job.rangeIndex + 1) + " de " + String(job.ranges.length) + ".",
        matterCode: job.code,
        matterTitle: job.title,
        rangeIndex: job.rangeIndex,
        rangesTotal: job.ranges.length,
        expectedQuestionNodes: expected
      });
      try {
        await context.waitFor(documentNode, function () {
          ensureRunning(state);
          var count = documentNode && typeof documentNode.querySelectorAll === "function" ? documentNode.querySelectorAll(".questao").length : 0;
          observedCount = count;
          if (count !== lastCount) {
            lastCount = count;
            context.recordEvent(state, "output-question-count", { count: count, expected: expected });
          }
          if (Date.now() - lastHeartbeat >= 1000) {
            lastHeartbeat = Date.now();
            context.persistProgress(state, {
              phase: "waiting-output",
              message: "Aguardando questões: " + count + (expected ? "/" + expected : "") + ".",
              questionNodeCount: count,
              expectedQuestionNodes: expected,
              rangeIndex: job.rangeIndex,
              rangesTotal: job.ranges.length
            });
          }
          return count > 0 && (!expected || count >= expected);
        }, outputWaitTimeoutMs, "A página HTML de impressão não montou a quantidade esperada de questões em " + Math.floor(outputWaitTimeoutMs / 1000) + " segundos.");
      } catch (error) {
        if (isPausedError(error)) throw error;
        context.recordEvent(state, "output-timeout", { expected: expected, observed: observedCount, page: context.pageDiagnosticSnapshot(rootNode, documentNode) });
        context.writeState(state);
        throw new Error("A página de impressão não trouxe a quantidade esperada de questões (" + observedCount + "/" + expected + "). " + error.message);
      }
      context.recordEvent(state, "output-ready", context.pageDiagnosticSnapshot(rootNode, documentNode));
      context.writeState(state);
    }

    async function finishExportPart(state) {
      ensureRunning(state);
      var job = state.export.job;
      var current = job.ranges[job.rangeIndex];
      context.persistProgress(state, {
        phase: "reading-output",
        message: "Lendo a parte " + String(job.rangeIndex + 1) + " de " + String(job.ranges.length) + " da saída de impressão.",
        matterCode: job.code,
        matterTitle: job.title,
        rangeIndex: job.rangeIndex,
        rangesTotal: job.ranges.length,
        printTotalQuestions: job.printTotalQuestions
      });
      await waitForPrintedQuestions(state);
      ensureRunning(state);
      var questions = extractPrintedQuestions(documentNode);
      if (!questions.length) {
        context.recordEvent(state, "extraction-empty", { page: context.pageDiagnosticSnapshot(rootNode, documentNode), expected: current && current.count });
        context.writeState(state);
        throw new Error("A página de impressão montou o DOM, mas nenhuma questão pôde ser extraída.");
      }
      ensureRunning(state);
      context.recordEvent(state, "questions-extracted", { extracted: questions.length, expected: current && current.count, page: context.pageDiagnosticSnapshot(rootNode, documentNode) });
      context.writeState(state);
      var titleNode = documentNode.querySelector("h1");
      var entry = library.appendPart(Object.assign({}, job, {
        title: job.title || context.clean(titleNode && (titleNode.innerText || titleNode.textContent)),
        start: current.start,
        totalQuestions: job.ranges.reduce(function (total, range) { return total + range.count; }, 0),
        sourceQuestionCount: Number(job.sourceQuestionCount) || 0,
        printTotalQuestions: Number(job.printTotalQuestions) || 0
      }), questions);
      job.rangeIndex += 1;
      if (job.rangeIndex < job.ranges.length) {
        ensureRunning(state);
        context.persistProgress(state, {
          phase: "part-saved",
          message: "Parte salva (" + questions.length + " questões). Retomando a parte " + String(job.rangeIndex + 1) + " de " + String(job.ranges.length) + ".",
          matterCode: job.code,
          matterTitle: job.title,
          rangeIndex: job.rangeIndex,
          rangesTotal: job.ranges.length,
          printTotalQuestions: job.printTotalQuestions
        });
        ensureRunning(state);
        rootNode.location.href = context.cadernoUrl(rootNode, job.cadernoId);
        return "Parte salva: " + questions.length + " questões. Indo para a próxima parte.";
      }
      ensureRunning(state);
      state.export = null;
      if (state.creation) {
        state.creation.outcomes.push({ code: state.creation.current.code, cadernoId: job.cadernoId, entryId: entry.id, savedAt: new Date().toISOString() });
        state.creation.index += 1;
        state.creation.phase = "prepare";
        state.creation.current = null;
        context.persistProgress(state, {
          phase: "next-matter",
          message: "Caderno " + entry.title + " consolidado. Preparando o próximo caderno.",
          matterIndex: state.creation.index,
          mattersTotal: state.creation.plan.matters.length,
          lastSavedEntryId: entry.id,
          lastSavedQuestions: questions.length
        });
        ensureRunning(state);
        rootNode.location.href = state.creation.filterUrl;
        return "Caderno " + entry.title + " consolidado na biblioteca. Preparando o próximo.";
      }
      state.running = false;
      context.persistProgress(state, {
        phase: "completed",
        message: "Caderno " + entry.title + " consolidado na biblioteca.",
        matterIndex: 1,
        mattersTotal: 1,
        lastSavedEntryId: entry.id,
        lastSavedQuestions: questions.length
      });
      context.lockManager.releaseLease(state);
      return "Caderno " + entry.title + " consolidado na biblioteca.";
    }

    return {
      waitForPrintedQuestions: waitForPrintedQuestions,
      finishExportPart: finishExportPart
    };
  }

  return { createOutputWorkflow: createOutputWorkflow };
});
