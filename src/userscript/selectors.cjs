(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) {
    root.TecConcursosModules = root.TecConcursosModules || {};
    root.TecConcursosModules.selectors = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var PAGE_PATTERNS = {
    caderno: /\/questoes\/cadernos(?:\/|$)/i,
    filtro: /\/questoes\/filtrar(?:\/|$)/i,
    pasta: /\/questoes\/pastas(?:\/|$)/i
  };

  var QUESTION_ROOT_SELECTORS = [
    "#caderno .questao",
    ".questao",
    "[data-testid='question']",
    ".q-question",
    ".q-question-card"
  ];

  var NEXT_SELECTORS = [
    "button[aria-label='Próxima questão']",
    "button[title='Próxima questão']",
    "[aria-label='Próxima questão']",
    "[title='Próxima questão']",
    ".questao-navegacao-botao-proxima-cinza",
    ".q-btn-next",
    ".q-next-question"
  ];

  function getPath(locationLike) {
    if (!locationLike) return "";
    if (typeof locationLike === "string") {
      try {
        return new URL(locationLike, "https://www.tecconcursos.com.br").pathname;
      } catch (_) {
        return locationLike;
      }
    }
    return String(locationLike.pathname || "");
  }

  function getPageKind(locationLike) {
    var path = getPath(locationLike);
    if (PAGE_PATTERNS.caderno.test(path)) return "caderno";
    if (PAGE_PATTERNS.filtro.test(path)) return "filtro";
    if (PAGE_PATTERNS.pasta.test(path)) return "pasta";
    return "unknown";
  }

  function hostnameOf(locationLike) {
    if (!locationLike) return "";
    if (typeof locationLike === "string") {
      try { return String(new URL(locationLike, "https://www.tecconcursos.com.br").hostname || "").toLowerCase(); } catch (_) { return ""; }
    }
    if (locationLike.hostname) return String(locationLike.hostname).toLowerCase();
    try { return String(new URL(locationLike.href || "", "https://www.tecconcursos.com.br").hostname || "").toLowerCase(); } catch (_) { return ""; }
  }

  function isTecConcursosPage(locationLike) {
    var hostname = hostnameOf(locationLike);
    return hostname === "tecconcursos.com.br" || hostname.endsWith(".tecconcursos.com.br");
  }

  function isSupportedPage(locationLike) {
    return getPageKind(locationLike) !== "unknown" || isTecConcursosPage(locationLike);
  }

  function isVisible(element) {
    if (!element || element.hidden || element.disabled) return false;
    var className = String(element.className || "");
    if (/(^|\s)ng-hide(?:\s|$)/.test(className)) return false;
    if (typeof element.offsetParent === "undefined") return true;
    return element.offsetParent !== null || element === element.ownerDocument?.activeElement;
  }

  function queryAll(rootNode, selector) {
    if (!rootNode || typeof rootNode.querySelectorAll !== "function") return [];
    return Array.from(rootNode.querySelectorAll(selector));
  }

  function findQuestionRoot(rootNode) {
    for (var i = 0; i < QUESTION_ROOT_SELECTORS.length; i += 1) {
      var node = rootNode && typeof rootNode.querySelector === "function"
        ? rootNode.querySelector(QUESTION_ROOT_SELECTORS[i])
        : null;
      if (node) return node;
    }
    return null;
  }

  function findNextButton(rootNode) {
    for (var i = 0; i < NEXT_SELECTORS.length; i += 1) {
      var candidates = queryAll(rootNode, NEXT_SELECTORS[i]);
      for (var j = 0; j < candidates.length; j += 1) {
        if (isVisible(candidates[j])) return candidates[j];
      }
    }
    return null;
  }

  function findPreviousButton(rootNode) {
    var selectors = [
      "button[aria-label='Questão anterior']",
      "button[title='Questão anterior']",
      ".questao-navegacao-botao-anterior-cinza"
    ];
    for (var i = 0; i < selectors.length; i += 1) {
      var candidates = queryAll(rootNode, selectors[i]);
      for (var j = 0; j < candidates.length; j += 1) {
        if (isVisible(candidates[j])) return candidates[j];
      }
    }
    return null;
  }

  return {
    PAGE_PATTERNS: PAGE_PATTERNS,
    QUESTION_ROOT_SELECTORS: QUESTION_ROOT_SELECTORS,
    getPageKind: getPageKind,
    isTecConcursosPage: isTecConcursosPage,
    isSupportedPage: isSupportedPage,
    isVisible: isVisible,
    findQuestionRoot: findQuestionRoot,
    findNextButton: findNextButton,
    findPreviousButton: findPreviousButton
  };
});
