(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) {
    root.TecConcursosModules = root.TecConcursosModules || {};
    root.TecConcursosModules.tampermonkeyMenu = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var PAUSE_LABEL = "⏹ Parar automação";
  var RESUME_LABEL = "▶ Retomar automação";

  function hasPendingRun(state) {
    return Boolean(state && (state.creation || state.export));
  }

  function commandLabel(state) {
    if (!hasPendingRun(state)) return "";
    return state.running ? PAUSE_LABEL : RESUME_LABEL;
  }

  function apiFunction(rootNode, name) {
    if (rootNode && typeof rootNode[name] === "function") return rootNode[name];
    try {
      return typeof globalThis[name] === "function" ? globalThis[name] : null;
    } catch (_) {
      return null;
    }
  }

  function createMenu(options) {
    var config = options || {};
    var rootNode = config.root || {};
    var register = apiFunction(rootNode, "GM_registerMenuCommand");
    var unregister = apiFunction(rootNode, "GM_unregisterMenuCommand");
    var commandId = null;

    function reportError(error) {
      if (typeof config.onError !== "function") return;
      try { config.onError(error); } catch (_) {}
    }

    function removeCurrentCommand() {
      if (commandId == null || typeof unregister !== "function") {
        commandId = null;
        return;
      }
      try { unregister(commandId); } catch (_) {}
      commandId = null;
    }

    function readState() {
      return typeof config.getState === "function" ? config.getState() : null;
    }

    function refresh() {
      var label;
      try {
        label = commandLabel(readState());
      } catch (error) {
        reportError(error);
        label = "";
      }
      removeCurrentCommand();
      if (!label || typeof register !== "function") return false;

      var callback = function () {
        var state;
        try {
          state = readState();
          var action = state && state.running ? config.onPause : config.onResume;
          if (typeof action !== "function") return undefined;
          return Promise.resolve(action()).then(function (result) {
            refresh();
            return result;
          }, function (error) {
            reportError(error);
            refresh();
            return undefined;
          });
        } catch (error) {
          reportError(error);
          refresh();
          return undefined;
        }
      };

      try {
        commandId = register(label, callback);
        return true;
      } catch (error) {
        commandId = null;
        reportError(error);
        return false;
      }
    }

    function destroy() {
      removeCurrentCommand();
    }

    return { refresh: refresh, destroy: destroy };
  }

  return {
    PAUSE_LABEL: PAUSE_LABEL,
    RESUME_LABEL: RESUME_LABEL,
    hasPendingRun: hasPendingRun,
    commandLabel: commandLabel,
    createMenu: createMenu
  };
});
