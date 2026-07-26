(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) {
    root.TecConcursosModules = root.TecConcursosModules || {};
    root.TecConcursosModules.automationControls = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function createEscapeStop(options) {
    var config = options || {};
    var rootNode = config.root;
    var destroyed = false;

    function handleKeydown(event) {
      if (destroyed || !event || (event.key !== "Escape" && event.keyCode !== 27)) return;
      if (typeof event.preventDefault === "function") event.preventDefault();
      if (typeof event.stopPropagation === "function") event.stopPropagation();
      try {
        var result = typeof config.onStop === "function" ? config.onStop(event) : null;
        if (result && typeof result.then === "function" && typeof config.onError === "function") {
          result.catch(config.onError);
        }
      } catch (error) {
        if (typeof config.onError === "function") config.onError(error);
      }
    }

    if (rootNode && typeof rootNode.addEventListener === "function") {
      rootNode.addEventListener("keydown", handleKeydown, true);
    }

    return {
      destroy: function () {
        if (destroyed) return;
        destroyed = true;
        if (rootNode && typeof rootNode.removeEventListener === "function") {
          rootNode.removeEventListener("keydown", handleKeydown, true);
        }
      }
    };
  }

  return { createEscapeStop: createEscapeStop };
});
