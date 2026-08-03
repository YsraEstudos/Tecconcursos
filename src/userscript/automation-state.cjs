(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) {
    root.TecConcursosModules = root.TecConcursosModules || {};
    root.TecConcursosModules.automationState = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var STATE_KEY = "tecconcursos_caderno_automation_v1";
  var GM_STATE_SAFETY_KEY = "tecconcursos_caderno_gm_state_safety_v1";
  var PLAN_KEY = "tecconcursos_caderno_plan_v1";
  var FOLDER_KEY = "tecconcursos_default_folder_id_v1";
  var MAX_PER_PRINT = 200;
  var STALE_AFTER_MS = 90000;
  var OUTPUT_WAIT_TIMEOUT_MS = 60000;
  var INACTIVITY_PAUSE_MS = 60000;

  function defaultState() {
    return { version: 1, running: false, creation: null, export: null };
  }

  function normalizeState(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : defaultState();
  }

  function ensureGmStateSafety(storage) {
    if (!storage || storage.usesGM !== true) return false;
    if (storage.read(GM_STATE_SAFETY_KEY, false)) return false;
    if (typeof storage.remove === "function") storage.remove(STATE_KEY);
    storage.write(GM_STATE_SAFETY_KEY, true);
    return true;
  }

  function markProgress(state, patch) {
    var previous = state.progress && typeof state.progress === "object" ? state.progress : {};
    var next = Object.assign({}, previous, patch || {});
    next.updatedAt = new Date().toISOString();
    var history = Array.isArray(previous.history) ? previous.history.slice(-19) : [];
    history.push({ at: next.updatedAt, phase: String(next.phase || ""), message: String(next.message || "") });
    next.history = history;
    state.progress = next;
    return next;
  }

  function appendEvent(state, eventName, details, url, compact) {
    var progress = state.progress && typeof state.progress === "object" ? state.progress : {};
    var events = Array.isArray(progress.events) ? progress.events.slice(-299) : [];
    events.push({
      at: new Date().toISOString(),
      event: String(eventName || "event"),
      phase: String(progress.phase || ""),
      url: String(url || ""),
      details: typeof compact === "function" ? compact(details) : details
    });
    progress.events = events;
    state.progress = progress;
    return state;
  }

  return {
    STATE_KEY: STATE_KEY,
    GM_STATE_SAFETY_KEY: GM_STATE_SAFETY_KEY,
    PLAN_KEY: PLAN_KEY,
    FOLDER_KEY: FOLDER_KEY,
    MAX_PER_PRINT: MAX_PER_PRINT,
    STALE_AFTER_MS: STALE_AFTER_MS,
    OUTPUT_WAIT_TIMEOUT_MS: OUTPUT_WAIT_TIMEOUT_MS,
    INACTIVITY_PAUSE_MS: INACTIVITY_PAUSE_MS,
    defaultState: defaultState,
    normalizeState: normalizeState,
    ensureGmStateSafety: ensureGmStateSafety,
    markProgress: markProgress,
    appendEvent: appendEvent
  };
});
