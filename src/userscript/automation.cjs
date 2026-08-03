(function (root, factory) {
  var api = factory(
    typeof module !== "undefined" && module.exports ? {
      plan: require("./plan.cjs"),
      library: require("./library.cjs"),
      dom: require("./automation-dom.cjs"),
      activity: require("./automation-activity.cjs"),
      lock: require("./automation-lock.cjs"),
      state: require("./automation-state.cjs"),
      filters: require("./automation-filters.cjs"),
      print: require("./automation-print.cjs"),
      output: require("./automation-output.cjs"),
      caderno: require("./automation-caderno.cjs"),
      diagnostics: require("./automation-diagnostics.cjs"),
      orchestrator: require("./automation-orchestrator.cjs"),
      timing: require("./timing.cjs")
    } : (function (modules) {
      return Object.assign({}, modules, {
        dom: modules.automationDom,
        activity: modules.automationActivity,
        lock: modules.automationLock,
        state: modules.automationState,
        filters: modules.automationFilters,
        print: modules.automationPrint,
        output: modules.automationOutput,
        caderno: modules.automationCaderno,
        diagnostics: modules.automationDiagnostics,
        orchestrator: modules.automationOrchestrator,
        timing: modules.timing
      });
    })(root.TecConcursosModules)
  );
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) {
    root.TecConcursosModules = root.TecConcursosModules || {};
    root.TecConcursosModules.automation = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (deps) {
  "use strict";

  var stateModule = deps.state;
  var STATE_KEY = stateModule.STATE_KEY;
  var PLAN_KEY = stateModule.PLAN_KEY;
  var FOLDER_KEY = stateModule.FOLDER_KEY;
  var MAX_PER_PRINT = stateModule.MAX_PER_PRINT;
  var STALE_AFTER_MS = stateModule.STALE_AFTER_MS;
  var OUTPUT_WAIT_TIMEOUT_MS = stateModule.OUTPUT_WAIT_TIMEOUT_MS;
  var INACTIVITY_PAUSE_MS = stateModule.INACTIVITY_PAUSE_MS;
  var ACTION_DELAY_MIN_MS = 300;
  var ACTION_DELAY_MAX_MS = 600;
  var clean = deps.dom.clean;
  var sameText = deps.dom.sameText;
  var isVisible = deps.dom.isVisible;
  var waitFor = deps.dom.waitFor;
  var clickElement = deps.dom.clickElement;
  var commitInputValue = deps.dom.commitInputValue;
  var fillCadernoName = deps.dom.fillCadernoName;
  var foundQuestionCount = deps.dom.foundQuestionCount;
  var pageDiagnosticSnapshot = deps.dom.pageDiagnosticSnapshot;
  var cadernoIdFromLocation = deps.library.cadernoIdFromLocation;

  function createAutomation(options) {
    var config = options || {};
    var rootNode = config.root;
    var documentNode = config.document;
    var storage = config.storage;
    var library = config.library;

    function readState() {
      return stateModule.readState(storage);
    }

    var pauseRequestHandler = null;
    var lockManager = deps.lock.createLockManager({
      root: rootNode,
      storage: storage,
      readState: readState,
      ownerId: config.ownerId,
      onPauseRequest: function (request) {
        if (pauseRequestHandler) return pauseRequestHandler(request);
        return undefined;
      }
    });
    var ownerId = lockManager.ownerId;

    function writeState(state, options) {
      if (!(options && options.skipLease)) lockManager.ensureLease(state);
      storage.write(STATE_KEY, state);
      return state;
    }

    var getProgress;
    function status() {
      var state = readState();
      var progress = getProgress();
      if (progress.phase === "error") return progress.message || "A automação falhou.";
      if (progress.phase === "paused") return progress.message || "Automação pausada.";
      if (state.running && progress.lockedByOtherTab) return lockManager.lockStatus(lockManager.readLock());
      if (!state.running) {
        if (progress.phase === "completed") return progress.message || "Automação concluída.";
        return "Pronto.";
      }
      if (progress.stale) return "Sem atividade há " + Math.max(1, Math.floor((progress.ageMs || 0) / 1000)) + "s. Verifique a aba de saída ou retome a execução.";
      if (state.export && state.export.job) {
        var job = state.export.job;
        return "Exportando " + job.title + ": parte " + String((job.rangeIndex || 0) + 1) + " de " + String((job.ranges || []).length || "?") + ".";
      }
      if (state.creation) return "Criando caderno " + String(state.creation.index + 1) + " de " + String(state.creation.plan.matters.length) + ".";
      return "Processo em andamento.";
    }

    var diagnostics = deps.diagnostics.createDiagnostics({
      root: rootNode,
      document: documentNode,
      ownerId: ownerId,
      staleAfterMs: STALE_AFTER_MS,
      readState: readState,
      writeState: writeState,
      lockManager: lockManager,
      status: function () { return status(); },
      pageDiagnosticSnapshot: pageDiagnosticSnapshot
    });
    getProgress = diagnostics.getProgress;

    var cadernoWorkflow = deps.caderno.createCadernoWorkflow({
      document: documentNode,
      lockManager: lockManager,
      persistProgress: diagnostics.persistProgress,
      foundQuestionCount: foundQuestionCount,
      isVisible: isVisible,
      sameText: sameText,
      fillCadernoName: fillCadernoName,
      waitFor: waitFor,
      clickElement: clickElement,
      ensureRunning: ensureRunning,
      delayBeforeAction: delayBeforeAction
    });
    var printWorkflow = deps.print.createPrintWorkflow({
      root: rootNode,
      document: documentNode,
      maxPerPrint: MAX_PER_PRINT,
      persistProgress: diagnostics.persistProgress,
      isPrintPage: deps.filters.isPrintPage,
      ensureRunning: ensureRunning,
      delayBeforeAction: delayBeforeAction
    });
    var outputWorkflow = deps.output.createOutputWorkflow({
      root: rootNode,
      document: documentNode,
      library: library,
      lockManager: lockManager,
      outputWaitTimeoutMs: OUTPUT_WAIT_TIMEOUT_MS,
      persistProgress: diagnostics.persistProgress,
      recordEvent: diagnostics.recordEvent,
      writeState: writeState,
      waitFor: waitFor,
      clean: clean,
      pageDiagnosticSnapshot: pageDiagnosticSnapshot,
      recommendedMaxPerPrint: deps.print.recommendedMaxPerPrint,
      cadernoUrl: deps.filters.cadernoUrl,
      ensureRunning: ensureRunning,
      delayBeforeAction: delayBeforeAction
    });
    var orchestrator = deps.orchestrator.createOrchestrator({
      root: rootNode,
      document: documentNode,
      lockManager: lockManager,
      readState: readState,
      writeState: writeState,
      status: status,
      recordEvent: diagnostics.recordEvent,
      persistProgress: diagnostics.persistProgress,
      pageDiagnosticSnapshot: pageDiagnosticSnapshot,
      cadernoIdFromLocation: cadernoIdFromLocation,
      cadernoUrl: deps.filters.cadernoUrl,
      findCadernoLinkByTitle: deps.filters.findCadernoLinkByTitle,
      isFolderPageReady: deps.filters.isFolderPageReady,
      isFilterPage: deps.filters.isFilterPage,
      isPrintPage: deps.filters.isPrintPage,
      isCadernoPage: deps.filters.isCadernoPage,
      isFolderPage: deps.filters.isFolderPage,
      waitFor: waitFor,
      caderno: cadernoWorkflow,
      print: printWorkflow,
      output: outputWorkflow,
      ensureRunning: ensureRunning,
      delayBeforeAction: delayBeforeAction
    });
    var resume = orchestrator.resume;

    function errorMessage(error) {
      return String(error && error.message || error || "Erro desconhecido").replace(/\s+/g, " ").trim();
    }

    function automationPausedError(message) {
      var error = new Error(message || "A automação foi pausada antes do próximo passo.");
      error.code = "AUTOMATION_PAUSED";
      return error;
    }

    function ensureRunning(state) {
      var current = readState();
      if (!current.running) throw automationPausedError();
      if (state && current.runId && state.runId && current.runId !== state.runId) {
        throw automationPausedError("A execução mudou enquanto o passo estava aguardando.");
      }
      if (current.runId && !lockManager.ownsLock(lockManager.readLock(), current)) {
        throw automationPausedError("O lease da execução não pertence mais a esta aba.");
      }
      return true;
    }

    function delayBeforeAction(state) {
      ensureRunning(state);
      var interrupted = null;
      var duration = deps.timing.randomInt(ACTION_DELAY_MIN_MS, ACTION_DELAY_MAX_MS);
      return deps.timing.sleep(duration, function () {
        try {
          ensureRunning(state);
          return false;
        } catch (error) {
          interrupted = error;
          return true;
        }
      }).then(function () {
        if (interrupted) throw interrupted;
        ensureRunning(state);
        return true;
      });
    }

    function readPlan() { return deps.plan.normalizePlan(storage.read(PLAN_KEY, {})); }
    function savePlan(plan) { var normalized = deps.plan.normalizePlan(plan); storage.write(PLAN_KEY, normalized); return normalized; }
    function readFolderId() {
      var fromLocation = deps.filters.folderIdFromLocation(rootNode);
      if (fromLocation) {
        storage.write(FOLDER_KEY, fromLocation);
        return fromLocation;
      }
      return clean(storage.read(FOLDER_KEY, ""));
    }
    function saveFolderId(value) {
      var id = clean(value);
      storage.write(FOLDER_KEY, id);
      return id;
    }
    function pause(source) {
      var state = readState();
      if (!state.running) return status();
      var currentLock = lockManager.readLock();
      if (state.runId && !lockManager.ownsLock(currentLock, state)) {
        var lockIsActive = Boolean(currentLock && Number(currentLock.expiresAt) > Date.now());
        var canReacquire = !lockIsActive || currentLock.ownerId === lockManager.ownerId;
        if (canReacquire) {
          var acquired = lockManager.acquireLease(state, false);
          if (acquired.acquired) currentLock = lockManager.readLock();
        }
        if (!lockManager.ownsLock(currentLock, state)) {
          var requested = typeof lockManager.requestPause === "function" && lockManager.requestPause(state, source || "manual");
          return requested
            ? "Pausa solicitada à aba proprietária. A execução será interrompida assim que receber o comando."
            : status();
        }
      }
      if (inactivityMonitor) inactivityMonitor.cancel();
      diagnostics.recordEvent(state, "manual-pause", { source: String(source || "manual") });
      state.running = false;
      diagnostics.persistProgress(state, { phase: "paused", message: "Automação pausada. A execução pode ser retomada." });
      lockManager.releaseLease(state);
      return status();
    }

    pauseRequestHandler = function (request) {
      var state = readState();
      if (!state.running || !state.runId) return status();
      if (request && request.runId && request.runId !== state.runId) return status();
      if (!lockManager.ownsLock(lockManager.readLock(), state)) return status();
      return pause("remote:" + String(request && request.sourceLabel || "manual"));
    };

    function pauseForInactivity() {
      var state = readState();
      if (!state.running) return status();
      if (state.runId && !lockManager.ownsLock(lockManager.readLock(), state)) return status();
      if (inactivityMonitor) inactivityMonitor.cancel();
      diagnostics.recordEvent(state, "inactivity-pause", {
        timeoutMs: INACTIVITY_PAUSE_MS,
        page: pageDiagnosticSnapshot(rootNode, documentNode)
      });
      state.running = false;
      diagnostics.persistProgress(state, {
        phase: "paused",
        message: "Automação pausada por inatividade após 1 minuto sem a página ativa. Clique em Retomar para continuar.",
        pausedBy: "inactivity",
        inactivityTimeoutMs: INACTIVITY_PAUSE_MS
      });
      lockManager.releaseLease(state);
      return status();
    }

    var inactivityMonitor = deps.activity && typeof deps.activity.createInactivityMonitor === "function"
      ? deps.activity.createInactivityMonitor({
        root: rootNode,
        document: documentNode,
        timeoutMs: INACTIVITY_PAUSE_MS,
        onInactive: pauseForInactivity
      })
      : null;
    if (inactivityMonitor) inactivityMonitor.start();
    function fail(error) {
      var state = readState();
      if (error && error.code === "AUTOMATION_PAUSED") return status();
      if (!state.running && !state.creation && !state.export) return status();
      if (state.runId && !lockManager.ownsLock(lockManager.readLock(), state)) return status();
      diagnostics.recordEvent(state, "error-detected", { error: errorMessage(error), page: pageDiagnosticSnapshot(rootNode, documentNode) });
      state.running = false;
      diagnostics.persistProgress(state, { phase: "error", message: "Falha na automação: " + errorMessage(error), error: errorMessage(error), failedAt: new Date().toISOString() });
      lockManager.releaseLease(state);
      return status();
    }
    function resumePaused() {
      var state = readState();
      if (!state.creation && !state.export) throw new Error("Não há uma automação pausada ou pendente para retomar.");
      var acquired = lockManager.acquireLease(state, false);
      if (!acquired.acquired) return lockManager.lockStatus(acquired.lock);
      state.running = true;
      diagnostics.persistProgress(state, { phase: "resuming", message: "Retomando a automação na etapa salva..." });
      return resume();
    }

    function pauseForManualResume(state) {
      state.running = false;
      stateModule.markProgress(state, {
        phase: "paused",
        message: "Automação pausada ao reabrir o site. Clique em Retomar para continuar.",
        pausedAt: new Date().toISOString()
      });
      stateModule.appendEvent(state, "manual-resume-required", {
        reason: "execution-owner-not-restored"
      }, rootNode && rootNode.location && rootNode.location.href, deps.dom.compactDiagnosticValue);
      storage.write(STATE_KEY, state);
      return status();
    }

    async function resumeOnPageLoad() {
      var state = readState();
      if (!state.running || (!state.creation && !state.export)) return status();
      var currentLock = lockManager.readLock();
      var ownsRestoredLease = lockManager.ownsLock(currentLock, state) && (!state.ownerId || state.ownerId === ownerId);
      if (ownsRestoredLease || (!state.ownerId && !currentLock)) return resume();
      if (currentLock && Number(currentLock.expiresAt) > Date.now() && currentLock.ownerId !== ownerId) {
        return lockManager.lockStatus(currentLock);
      }
      return pauseForManualResume(state);
    }
    function startCreation(folderId) {
      var plan = readPlan();
      if (!plan.matters.length) throw new Error("Importe o plano consolidado antes de criar os cadernos.");
      var id = clean(folderId || readFolderId());
      if (!id) throw new Error("Informe a pasta de destino do TecConcursos.");
      var existing = readState();
      if (existing.running || existing.creation || existing.export) {
        throw new Error(status() || "Já existe uma automação em andamento.");
      }
      saveFolderId(id);
      var state = {
        version: 1,
        runId: lockManager.createRunId(),
        ownerId: ownerId,
        running: true,
        creation: { plan: plan, folderId: id, filterUrl: deps.filters.filterUrl(rootNode, id), index: 0, phase: "prepare", outcomes: [] },
        export: null,
        progress: { phase: "starting", message: "Plano iniciado.", matterIndex: 0, mattersTotal: plan.matters.length, startedAt: new Date().toISOString() }
      };
      var acquired = lockManager.acquireLease(state, false);
      if (!acquired.acquired) throw lockManager.lockError(acquired.lock);
      writeState(state);
      if (!deps.filters.isFilterPage(rootNode)) {
        rootNode.location.href = state.creation.filterUrl;
        return "Abrindo a página de filtros para iniciar a criação.";
      }
      return resume();
    }

    function restartMaterialSearch(folderId) {
      var existing = readState();
      if (existing.running) throw new Error("Pause a automação atual antes de reiniciar a busca por materiais.");
      if (existing.runId) lockManager.releaseLease(existing);
      var plan = readPlan();
      if (!plan.matters.length) throw new Error("Importe o plano consolidado antes de reiniciar a busca por materiais.");
      var id = clean(folderId || readFolderId());
      if (!id) throw new Error("Informe a pasta de destino do TecConcursos.");
      saveFolderId(id);
      var state = {
        version: 1,
        runId: lockManager.createRunId(),
        ownerId: ownerId,
        running: true,
        creation: {
          plan: plan,
          folderId: id,
          folderUrl: deps.filters.folderUrl(rootNode, id),
          filterUrl: deps.filters.filterUrl(rootNode, id),
          reuseExistingCadernos: true,
          index: 0,
          phase: "prepare",
          outcomes: []
        },
        export: null,
        progress: { phase: "starting", message: "Busca de materiais reiniciada.", matterIndex: 0, mattersTotal: plan.matters.length, startedAt: new Date().toISOString() }
      };
      var acquired = lockManager.acquireLease(state, false);
      if (!acquired.acquired) throw lockManager.lockError(acquired.lock);
      writeState(state);
      if (!deps.filters.isFolderPage(rootNode)) {
        rootNode.location.href = state.creation.folderUrl;
        return "Abrindo a pasta para reiniciar a busca de materiais.";
      }
      return resume();
    }
    function startCurrentCaderno() {
      var id = cadernoIdFromLocation(rootNode.location);
      if (!id || !deps.filters.isCadernoPage(rootNode)) throw new Error("Abra um caderno antes de iniciar a exportação.");
      var titleNode = documentNode.querySelector("h1, .titulo-caderno");
      var state = readState();
      if (state.running || state.creation || state.export) throw new Error(status() || "Já existe uma automação em andamento.");
      state.runId = lockManager.createRunId();
      state.ownerId = ownerId;
      state.running = true;
      state.export = { job: {
        libraryId: id,
        cadernoId: id,
        title: clean(titleNode && (titleNode.innerText || titleNode.textContent)) || "Caderno " + id,
        code: "MANUAL-" + id,
        group: "Exportações manuais",
        ranges: [],
        rangeIndex: 0
      } };
      var acquired = lockManager.acquireLease(state, false);
      if (!acquired.acquired) throw lockManager.lockError(acquired.lock);
      diagnostics.persistProgress(state, { phase: "starting-export", message: "Preparando a exportação do caderno atual.", matterIndex: 0, mattersTotal: 1 });
      return resume();
    }
    function takeover() {
      var state = readState();
      if (!state.creation && !state.export) throw new Error("Não há uma automação pendente para assumir.");
      if (!state.runId) state.runId = lockManager.createRunId();
      state.ownerId = ownerId;
      state.running = true;
      var acquired = lockManager.acquireLease(state, true);
      if (!acquired.acquired) throw lockManager.lockError(acquired.lock);
      diagnostics.persistProgress(state, {
        phase: "taking-over",
        message: "Execução assumida por esta aba. Retomando na etapa salva.",
        takeoverAt: new Date().toISOString()
      });
      return resume();
    }

    return {
      readPlan: readPlan,
      savePlan: savePlan,
      getState: readState,
      status: status,
      pause: pause,
      pauseForInactivity: pauseForInactivity,
      ensureRunning: ensureRunning,
      takeover: takeover,
      startCreation: startCreation,
      restartMaterialSearch: restartMaterialSearch,
      startCurrentCaderno: startCurrentCaderno,
      resume: resume,
      resumeOnPageLoad: resumeOnPageLoad,
      resumePaused: resumePaused,
      fail: fail,
      getProgress: diagnostics.getProgress,
      getDiagnostics: diagnostics.getDiagnostics,
      readFolderId: readFolderId,
      saveFolderId: saveFolderId,
      defaultFolderId: readFolderId
    };
  }

  return {
    STATE_KEY: STATE_KEY,
    PLAN_KEY: PLAN_KEY,
    FOLDER_KEY: FOLDER_KEY,
    LOCK_KEY: deps.lock.LOCK_KEY,
    OWNER_SESSION_KEY: deps.lock.OWNER_SESSION_KEY,
    MAX_PER_PRINT: MAX_PER_PRINT,
    STALE_AFTER_MS: STALE_AFTER_MS,
    LOCK_LEASE_MS: deps.lock.LOCK_LEASE_MS,
    LOCK_HEARTBEAT_MS: deps.lock.LOCK_HEARTBEAT_MS,
    filterHeadingLabel: deps.filters.filterHeadingLabel,
    sameText: sameText,
    commitInputValue: commitInputValue,
    fillCadernoName: fillCadernoName,
    foundQuestionCount: foundQuestionCount,
    preparePrintForm: deps.print.preparePrintForm,
    pageDiagnosticSnapshot: pageDiagnosticSnapshot,
    searchCandidates: deps.filters.searchCandidates,
    searchBoxMatchesHeading: deps.filters.searchBoxMatchesHeading,
    treeItemMatches: deps.filters.treeItemMatches,
    hasSelectedTreeItem: deps.filters.hasSelectedTreeItem,
    treeItemClickTarget: deps.filters.treeItemClickTarget,
    invokeAngularTreeItem: deps.dom.invokeAngularTreeItem,
    activeFilterCount: deps.filters.activeFilterCount,
    splitRanges: deps.print.splitRanges,
    createAutomation: createAutomation
  };
});
