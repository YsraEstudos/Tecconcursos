(function (root, factory) {
  var api = factory(
    typeof module !== "undefined" && module.exports ? {
      state: require("./automation-state.cjs"),
      dom: require("./automation-dom.cjs")
    } : {
      state: root.TecConcursosModules.automationState,
      dom: root.TecConcursosModules.automationDom
    }
  );
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) {
    root.TecConcursosModules = root.TecConcursosModules || {};
    root.TecConcursosModules.automationDiagnostics = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (deps) {
  "use strict";

  function createDiagnostics(context) {
    var lastPersistedPatchKey = "";
    var lastPersistedAt = 0;
    var INTERMEDIATE_PERSIST_INTERVAL_MS = 1000;

    function currentTime() {
      return typeof context.now === "function" ? Number(context.now()) || Date.now() : Date.now();
    }

    function patchKey(patch) {
      var source = patch && typeof patch === "object" ? patch : {};
      return JSON.stringify(Object.keys(source).sort().reduce(function (result, key) {
        result[key] = source[key];
        return result;
      }, {}));
    }

    function isIntermediatePatch(patch) {
      var phase = String(patch && patch.phase || "");
      return phase === "filtering" || phase === "waiting-output";
    }

    function markProgress(state, patch) {
      return deps.state.markProgress(state, patch);
    }

    function recordEvent(state, eventName, details) {
      return deps.state.appendEvent(
        state,
        eventName,
        details,
        context.root && context.root.location && context.root.location.href,
        deps.dom.compactDiagnosticValue
      );
    }

    function persistProgress(state, patch) {
      var nextPatchKey = patchKey(patch);
      var now = currentTime();
      if (nextPatchKey === lastPersistedPatchKey) return state;
      markProgress(state, patch);
      recordEvent(state, "progress", patch);
      if (isIntermediatePatch(patch) && lastPersistedAt && now - lastPersistedAt < INTERMEDIATE_PERSIST_INTERVAL_MS) return state;
      var result = context.writeState(state);
      lastPersistedPatchKey = nextPatchKey;
      lastPersistedAt = now;
      return result;
    }

    function getProgress() {
      var state = context.readState();
      var progress = state.progress && typeof state.progress === "object" ? state.progress : {};
      var updatedAtMs = progress.updatedAt ? Date.parse(progress.updatedAt) : NaN;
      var ageMs = Number.isFinite(updatedAtMs) ? Math.max(0, Date.now() - updatedAtMs) : null;
      var job = state.export && state.export.job;
      var creation = state.creation;
      var lock = context.lockManager.lockInfo(state);
      return Object.assign({}, progress, {
        running: Boolean(state.running),
        stale: Boolean(state.running && ageMs != null && ageMs >= context.staleAfterMs),
        ageMs: ageMs,
        matterIndex: creation ? Number(creation.index) || 0 : progress.matterIndex,
        mattersTotal: creation && creation.plan ? creation.plan.matters.length : progress.mattersTotal,
        rangeIndex: job ? Number(job.rangeIndex) || 0 : progress.rangeIndex,
        rangesTotal: job && job.ranges ? job.ranges.length : progress.rangesTotal,
        ownerId: lock.ownerId,
        ownsLock: lock.ownsLock,
        lockActive: lock.active,
        lockedByOtherTab: lock.lockedByOtherTab,
        lockOwnerId: lock.lockOwnerId,
        lockExpiresAt: lock.expiresAt
      });
    }

    function getDiagnostics() {
      var state = context.readState();
      var progress = getProgress();
      return {
        generatedAt: new Date().toISOString(),
        status: context.status(),
        page: context.pageDiagnosticSnapshot(context.root, context.document),
        state: {
          running: Boolean(state.running),
          runId: state.runId || null,
          ownerId: state.ownerId || context.ownerId,
          creationIndex: state.creation ? Number(state.creation.index) || 0 : null,
          creationPhase: state.creation ? String(state.creation.phase || "") : null,
          exportRangeIndex: state.export && state.export.job ? Number(state.export.job.rangeIndex) || 0 : null,
          exportRangesTotal: state.export && state.export.job && state.export.job.ranges ? state.export.job.ranges.length : null
        },
        lock: context.lockManager.lockInfo(state),
        progress: {
          phase: progress.phase || "",
          message: progress.message || "",
          updatedAt: progress.updatedAt || null,
          stale: Boolean(progress.stale),
          history: Array.isArray(progress.history) ? progress.history : [],
          events: Array.isArray(progress.events) ? progress.events : []
        }
      };
    }

    return {
      markProgress: markProgress,
      recordEvent: recordEvent,
      persistProgress: persistProgress,
      getProgress: getProgress,
      getDiagnostics: getDiagnostics
    };
  }

  return { createDiagnostics: createDiagnostics };
});
