(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) {
    root.TecConcursosModules = root.TecConcursosModules || {};
    root.TecConcursosModules.automationActivity = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function isPageHidden(documentNode) {
    return Boolean(documentNode && (documentNode.hidden === true || documentNode.visibilityState === "hidden"));
  }

  function createInactivityMonitor(options) {
    var config = options || {};
    var rootNode = config.root || {};
    var documentNode = config.document;
    var timeoutMs = Math.max(1000, Math.floor(Number(config.timeoutMs) || 60000));
    var onInactive = typeof config.onInactive === "function" ? config.onInactive : function () {};
    var timer = null;
    var started = false;
    var set = rootNode.setTimeout || (typeof setTimeout === "function" ? setTimeout : null);
    var clear = rootNode.clearTimeout || (typeof clearTimeout === "function" ? clearTimeout : null);

    function cancel() {
      if (timer != null && clear) clear(timer);
      timer = null;
    }

    function schedule() {
      if (!started || timer != null || !set || !isPageHidden(documentNode)) return;
      timer = set(function () {
        timer = null;
        if (started && isPageHidden(documentNode)) onInactive();
      }, timeoutMs);
      if (timer && typeof timer.unref === "function") timer.unref();
    }

    function onVisibilityChange() {
      if (isPageHidden(documentNode)) schedule();
      else cancel();
    }

    function start() {
      if (started) return true;
      started = true;
      if (documentNode && typeof documentNode.addEventListener === "function") documentNode.addEventListener("visibilitychange", onVisibilityChange);
      onVisibilityChange();
      return true;
    }

    function stop() {
      if (!started) return false;
      started = false;
      cancel();
      if (documentNode && typeof documentNode.removeEventListener === "function") documentNode.removeEventListener("visibilitychange", onVisibilityChange);
      return true;
    }

    return { start: start, stop: stop, cancel: cancel, isStarted: function () { return started; } };
  }

  return {
    isPageHidden: isPageHidden,
    createInactivityMonitor: createInactivityMonitor
  };
});
