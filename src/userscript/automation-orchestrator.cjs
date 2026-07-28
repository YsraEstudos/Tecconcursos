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

    function openFolderForPendingCreation(state) {
      if (typeof context.ensureRunning === "function") context.ensureRunning(state);
      var creation = state && state.creation;
      var folderUrl = creation && String(creation.folderUrl || "");
      if (!folderUrl) throw new Error("A execução pendente não possui a URL da pasta para procurar cadernos.");
      context.persistProgress(state, {
        phase: "opening-folder",
        message: "Abrindo a pasta para procurar cadernos já existentes.",
        matterIndex: creation.index,
        mattersTotal: creation.plan && creation.plan.matters ? creation.plan.matters.length : 0
      });
      if (typeof context.ensureRunning === "function") context.ensureRunning(state);
      if (context.root && context.root.location) context.root.location.href = folderUrl;
      return "Abrindo a pasta para procurar cadernos já existentes.";
    }

    async function reuseExistingCadernoOrOpenFilter(state) {
      if (typeof context.ensureRunning === "function") context.ensureRunning(state);
      if (context.isFolderPageReady && !context.isFolderPageReady(context.document)) {
        if (typeof context.waitFor !== "function") throw new Error("A página da pasta ainda não carregou a lista de cadernos.");
        await context.waitFor(context.document, function () {
          if (typeof context.ensureRunning === "function") context.ensureRunning(state);
          return context.isFolderPageReady(context.document);
        }, 10000, "A lista de cadernos da pasta não carregou a tempo.");
      }
      var creation = state && state.creation;
      var matter = creation && creation.plan && creation.plan.matters && creation.plan.matters[creation.index];
      if (!matter) {
        state.running = false;
        state.creation = null;
        context.persistProgress(state, {
          phase: "completed",
          message: "Todos os cadernos do plano foram processados.",
          matterIndex: creation && creation.index,
          mattersTotal: creation && creation.plan && creation.plan.matters ? creation.plan.matters.length : 0
        });
        context.lockManager.releaseLease(state);
        return "Todos os cadernos do plano foram processados.";
      }
      var link = typeof context.findCadernoLinkByTitle === "function"
        ? context.findCadernoLinkByTitle(context.document, matter.title)
        : null;
      if (!link) {
        creation.phase = "prepare";
        context.persistProgress(state, {
          phase: "opening-filter",
          message: "Caderno não encontrado na pasta. Abrindo os filtros para criar " + matter.title + ".",
          matterCode: matter.code,
          matterTitle: matter.title,
          matterIndex: creation.index,
          mattersTotal: creation.plan.matters.length
        });
        return openFilterForPendingCreation(state);
      }
      var existingId = context.cadernoIdFromLocation(link.href || link.getAttribute && link.getAttribute("href"));
      if (!existingId) throw new Error("Encontrei o caderno '" + matter.title + "', mas não consegui ler o ID do link.");
      creation.phase = "awaiting-existing-caderno";
      creation.current = Object.assign({}, matter, { cadernoId: existingId, reused: true });
      context.persistProgress(state, {
        phase: "opening-existing-caderno",
        message: "Caderno existente encontrado: " + matter.title + ". Abrindo para coletar as questões.",
        matterCode: matter.code,
        matterTitle: matter.title,
        matterIndex: creation.index,
        mattersTotal: creation.plan.matters.length,
        cadernoId: existingId
      });
      if (typeof context.ensureRunning === "function") context.ensureRunning(state);
      var targetUrl = context.cadernoUrl(context.root, existingId);
      if (typeof link.click === "function") link.click();
      else if (context.root && context.root.location) context.root.location.href = targetUrl;
      return "Caderno existente encontrado. Abrindo " + matter.title + ".";
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
      if (context.isCadernoPage(context.root) && state.creation && (state.creation.phase === "awaiting-caderno" || state.creation.phase === "awaiting-existing-caderno") && !state.export) {
        var currentMatter = state.creation.current;
        var createdId = currentMatter && currentMatter.cadernoId || context.cadernoIdFromLocation(context.root.location);
        if (!createdId) throw new Error("O TecConcursos abriu um caderno sem identificador.");
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
          message: currentMatter.reused ? "Caderno existente aberto. Preparando a primeira parte da impressão." : "Novo caderno aberto. Preparando a primeira parte da impressão.",
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
      if (state.creation && state.creation.reuseExistingCadernos && context.isFolderPage(context.root)) {
        return reuseExistingCadernoOrOpenFilter(state);
      }
      if (state.creation && state.creation.reuseExistingCadernos && state.creation.phase === "prepare" && !context.isFolderPage(context.root)) {
        return openFolderForPendingCreation(state);
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
