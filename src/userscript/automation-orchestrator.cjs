(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) {
    root.TecConcursosModules = root.TecConcursosModules || {};
    root.TecConcursosModules.automationOrchestrator = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function createOrchestrator(context) {
    function openFilterForPendingCreation(state) {
      if (typeof context.ensureRunning === "function") context.ensureRunning(state);
      var creation = state && state.creation;
      var filterUrl = creation && String(creation.filterUrl || "");
      if (!filterUrl) throw new Error("A execução pendente não possui a URL de filtros da pasta.");
      context.persistProgress(state, {
        phase: "opening-filter",
        message: "Abrindo a página de filtros para retomar a criação do próximo caderno.",
        matterIndex: creation.index,
        mattersTotal: creation.plan && creation.plan.matters ? creation.plan.matters.length : 0
      });
      if (typeof context.ensureRunning === "function") context.ensureRunning(state);
      if (context.root && context.root.location) context.root.location.href = filterUrl;
      return "Abrindo a página de filtros para retomar a criação do caderno.";
    }

    function openCadernoForPendingExport(state) {
      if (typeof context.ensureRunning === "function") context.ensureRunning(state);
      var job = state && state.export && state.export.job;
      var cadernoId = job && String(job.cadernoId || "");
      if (!cadernoId) throw new Error("A exportação pendente não possui o ID do caderno para retomar.");
      var cadernoUrl = context.cadernoUrl(context.root, cadernoId);
      context.persistProgress(state, {
        phase: "opening-caderno",
        message: "Abrindo o caderno salvo para retomar a impressão.",
        matterCode: job.code,
        matterTitle: job.title,
        rangeIndex: job.rangeIndex,
        rangesTotal: job.ranges && job.ranges.length
      });
      if (typeof context.ensureRunning === "function") context.ensureRunning(state);
      if (context.root && context.root.location) context.root.location.href = cadernoUrl;
      return "Abrindo o caderno salvo para retomar a impressão.";
    }

    async function resume() {
      var state = context.readState();
      if (!state.running) return context.status();
      var acquired = context.lockManager.acquireLease(state, false);
      if (!acquired.acquired) return context.lockManager.lockStatus(acquired.lock);
      if (typeof context.ensureRunning === "function") context.ensureRunning(state);
      context.recordEvent(state, "resume-enter", { page: context.pageDiagnosticSnapshot(context.root, context.document), running: Boolean(state.running) });
      context.writeState(state);
      if (context.isPrintPage(context.root) && state.export && state.export.job) return context.output.finishExportPart(state);
      if (context.isCadernoPage(context.root) && state.creation && state.creation.phase === "awaiting-caderno" && !state.export) {
        var createdId = context.cadernoIdFromLocation(context.root.location);
        if (!createdId) throw new Error("O TecConcursos abriu um caderno sem identificador.");
        var currentMatter = state.creation.current;
        state.export = { job: {
          libraryId: createdId,
          cadernoId: createdId,
          title: currentMatter.title,
          code: currentMatter.code,
          group: currentMatter.group,
          sourceQuestionCount: Number(currentMatter.sourceQuestionCount) || 0,
          ranges: [],
          rangeIndex: 0
        } };
        state.creation.phase = "exporting";
        context.persistProgress(state, {
          phase: "preparing-print",
          message: "Novo caderno aberto. Preparando a primeira parte da impressão.",
          matterCode: currentMatter.code,
          matterTitle: currentMatter.title,
          matterIndex: state.creation.index,
          mattersTotal: state.creation.plan.matters.length
        });
      }
      if (context.isCadernoPage(context.root) && state.export && state.export.job && typeof context.ensureRunning === "function") context.ensureRunning(state);
      if (context.isCadernoPage(context.root) && state.export && state.export.job) return context.print.submitCurrentRange(state);
      if (state.export && state.export.job && !context.isCadernoPage(context.root)) {
        if (typeof context.ensureRunning === "function") context.ensureRunning(state);
        return openCadernoForPendingExport(state);
      }
      if (state.creation && state.creation.phase === "prepare" && state.creation.filterUrl && !context.isFilterPage(context.root)) {
        return openFilterForPendingCreation(state);
      }
      if (context.isFilterPage(context.root) && state.creation && state.creation.phase === "prepare") {
        if (typeof context.ensureRunning === "function") context.ensureRunning(state);
        return context.caderno.createNextCaderno(state);
      }
      return context.status();
    }

    return { resume: resume };
  }

  return { createOrchestrator: createOrchestrator };
});
