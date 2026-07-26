(function (root, factory) {
  var api = factory(
    typeof module !== "undefined" && module.exports ? require("./selectors.cjs") : root.TecConcursosModules.selectors
  );
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) {
    root.TecConcursosModules = root.TecConcursosModules || {};
    root.TecConcursosModules.navigation = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (selectors) {
  "use strict";

  function waitForQuestionChange(documentNode, previousId, readId, options) {
    var config = options || {};
    var timeoutMs = Number(config.timeoutMs) > 0 ? Number(config.timeoutMs) : 15000;
    var pollMs = Number(config.pollMs) > 0 ? Number(config.pollMs) : 100;
    var cancelled = typeof config.isCancelled === "function" ? config.isCancelled : function () { return false; };
    var current = typeof readId === "function" ? readId() : "";
    if (current && current !== previousId) return Promise.resolve(true);

    return new Promise(function (resolve) {
      var settled = false;
      var observer = null;
      var timer = null;
      var interval = null;

      function finish(value) {
        if (settled) return;
        settled = true;
        if (observer && observer.disconnect) observer.disconnect();
        if (timer) clearTimeout(timer);
        if (interval) clearInterval(interval);
        resolve(value);
      }

      function check() {
        if (cancelled()) return finish(false);
        var next = typeof readId === "function" ? readId() : "";
        if (next && next !== previousId) return finish(true);
      }

      var MutationObserverCtor = documentNode && documentNode.defaultView
        ? documentNode.defaultView.MutationObserver
        : typeof MutationObserver !== "undefined" ? MutationObserver : null;
      var observationRoot = documentNode && typeof documentNode.querySelector === "function"
        ? documentNode.querySelector("#caderno") || documentNode.querySelector("#prova-conteudo") || documentNode.body
        : documentNode && documentNode.body;
      if (MutationObserverCtor && observationRoot) {
        observer = new MutationObserverCtor(check);
        observer.observe(observationRoot, { childList: true, subtree: true, characterData: true });
      }
      interval = setInterval(check, pollMs);
      timer = setTimeout(function () { finish(false); }, timeoutMs);
      check();
    });
  }

  function clickNext(documentNode) {
    var button = selectors.findNextButton(documentNode);
    if (!button || typeof button.click !== "function") return false;
    button.click();
    return true;
  }

  return {
    waitForQuestionChange: waitForQuestionChange,
    clickNext: clickNext
  };
});
