(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) {
    root.TecConcursosModules = root.TecConcursosModules || {};
    root.TecConcursosModules.automationDom = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function clean(value) {
    return String(value == null ? "" : value).replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  }

  function sameText(left, right) {
    return clean(left).toLocaleLowerCase("pt-BR") === clean(right).toLocaleLowerCase("pt-BR");
  }

  function isVisible(element) {
    var current = element;
    while (current && current.nodeType === 1) {
      if (current.disabled || current.hidden) return false;
      var classes = String(current.className || "");
      if (/(^|\s)ng-hide(\s|$)/.test(classes)) return false;
      if (current.style && (current.style.display === "none" || current.style.visibility === "hidden")) return false;
      current = current.parentElement;
    }
    return Boolean(element);
  }

  function waitFor(documentNode, predicate, timeoutMs, message) {
    var timeout = Number(timeoutMs) || 10000;
    return new Promise(function (resolve, reject) {
      var started = Date.now();
      function tick() {
        var result = predicate();
        if (result) return resolve(result);
        if (Date.now() - started >= timeout) return reject(new Error(message || "O TecConcursos não carregou o controle esperado a tempo."));
        setTimeout(tick, 300);
      }
      tick();
    });
  }

  function setInputValue(input, value) {
    if (!input) return false;
    var descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value");
    if (descriptor && typeof descriptor.set === "function") descriptor.set.call(input, String(value));
    else input.value = String(value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  function clickElement(documentNode, element) {
    if (!element) return false;
    try {
      if (typeof element.click === "function") {
        element.click();
        return true;
      }
    } catch (_) {}
    try {
      var pageWindow = documentNode && documentNode.defaultView;
      if (typeof unsafeWindow !== "undefined") pageWindow = unsafeWindow;
      var angular = pageWindow && pageWindow.angular;
      if (angular && typeof angular.element === "function") {
        var angularElement = angular.element(element);
        if (angularElement && typeof angularElement.triggerHandler === "function") {
          angularElement.triggerHandler("click");
          return true;
        }
      }
    } catch (_) {}
    return false;
  }

  function commitInputValue(input, value) {
    if (!setInputValue(input, value)) return false;
    input.dispatchEvent(new Event("blur", { bubbles: false }));
    return true;
  }

  function fillCadernoName(documentNode, input, title) {
    var expected = String(title == null ? "" : title);
    if (!input || !expected.trim()) return false;
    if (!clickElement(documentNode, input)) return false;
    try {
      if (typeof input.focus === "function") input.focus();
    } catch (_) {}
    if (!commitInputValue(input, expected)) return false;
    return String(input.value == null ? "" : input.value) === expected;
  }

  function foundQuestionCount(documentNode) {
    if (!documentNode || typeof documentNode.querySelectorAll !== "function") return 0;
    var node = Array.from(documentNode.querySelectorAll("strong")).filter(isVisible).find(function (candidate) {
      var text = clean(candidate.innerText || candidate.textContent);
      var parentText = clean(candidate.parentElement && (candidate.parentElement.innerText || candidate.parentElement.textContent));
      return /^\d[\d.\s]*$/.test(text) && /questões encontradas/i.test(parentText);
    });
    if (!node) return 0;
    return Number(clean(node.innerText || node.textContent).replace(/[^\d]/g, "")) || 0;
  }

  function clickText(documentNode, selector, label) {
    var target = Array.from(documentNode.querySelectorAll(selector)).filter(isVisible).find(function (node) {
      return sameText(node.innerText || node.textContent, label);
    });
    if (target) clickElement(documentNode, target);
    return Boolean(target);
  }

  function invokeAngularTreeItem(documentNode, item) {
    var pageWindow = documentNode && documentNode.defaultView;
    if (typeof unsafeWindow !== "undefined") pageWindow = unsafeWindow;
    var angular = pageWindow && pageWindow.angular;
    if (!angular || typeof angular.element !== "function") return false;
    var clickable = item.querySelector(".arvore-item-conteudo") || item;
    var angularElement = angular.element(clickable);
    var scope = angularElement && ((typeof angularElement.isolateScope === "function" && angularElement.isolateScope()) || (typeof angularElement.scope === "function" && angularElement.scope()));
    if (!scope || !scope.vm || typeof scope.vm.notificarClick !== "function") return false;
    var notify = function () { scope.vm.notificarClick(); };
    if (scope.$root && scope.$root.$$phase) notify();
    else if (typeof scope.$apply === "function") scope.$apply(notify);
    else notify();
    return true;
  }

  function pageDiagnosticSnapshot(rootNode, documentNode) {
    var questionNodes = documentNode && typeof documentNode.querySelectorAll === "function" ? Array.from(documentNode.querySelectorAll(".questao")) : [];
    var firstQuestion = questionNodes[0];
    var lastQuestion = questionNodes[questionNodes.length - 1];
    var bodyRaw = documentNode && documentNode.body ? String(documentNode.body.innerText || documentNode.body.textContent || "") : "";
    var bodyText = clean(bodyRaw.slice(0, 2400)).slice(0, 800);
    var contentNode = documentNode && typeof documentNode.querySelector === "function" ? documentNode.querySelector("#prova-conteudo") : null;
    var loadingNodes = documentNode && typeof documentNode.querySelectorAll === "function" ? Array.from(documentNode.querySelectorAll(".ajax-loading, #ajax-loading, .loading, .carregando")) : [];
    var pageWindow = rootNode && rootNode.window ? rootNode.window : rootNode;
    var scriptSources = documentNode && typeof documentNode.querySelectorAll === "function" ? Array.from(documentNode.querySelectorAll("script[src]")).map(function (node) { return String(node.src || ""); }).slice(-8) : [];
    var controls = ["#configurar-impressao", "#questaoInicialInput", "#numeroQuestoesInput", "#numeroQuestoes", "#confirmar-button", "#prova-conteudo", "#questaoInicial"];
    var controlState = {};
    controls.forEach(function (selector) {
      var node = documentNode && typeof documentNode.querySelector === "function" ? documentNode.querySelector(selector) : null;
      controlState[selector] = node ? {
        present: true,
        value: node.value == null ? null : String(node.value),
        disabled: Boolean(node.disabled),
        text: clean(node.innerText || node.textContent).slice(0, 160)
      } : { present: false };
    });
    return {
      href: String(rootNode && rootNode.location && rootNode.location.href || ""),
      pathname: String(rootNode && rootNode.location && rootNode.location.pathname || ""),
      readyState: String(documentNode && documentNode.readyState || ""),
      title: clean(documentNode && documentNode.title),
      questionNodeCount: questionNodes.length,
      contentChildCount: contentNode && contentNode.children ? contentNode.children.length : null,
      contentHtmlLength: contentNode && contentNode.innerHTML != null ? String(contentNode.innerHTML).length : null,
      loadingMarkerCount: loadingNodes.length,
      scriptCount: documentNode && typeof documentNode.querySelectorAll === "function" ? documentNode.querySelectorAll("script").length : null,
      scriptSources: scriptSources,
      printFunctionType: pageWindow && typeof pageWindow.print === "function" ? "function" : typeof (pageWindow && pageWindow.print),
      firstQuestionText: clean(firstQuestion && (firstQuestion.innerText || firstQuestion.textContent)).slice(0, 240),
      lastQuestionText: clean(lastQuestion && (lastQuestion.innerText || lastQuestion.textContent)).slice(0, 240),
      controls: controlState,
      bodySample: bodyText
    };
  }

  function compactDiagnosticValue(value) {
    var text;
    try { text = JSON.stringify(value == null ? {} : value); } catch (_) { text = String(value); }
    return text.length > 1800 ? text.slice(0, 1800) + "…" : text;
  }

  return {
    clean: clean,
    sameText: sameText,
    isVisible: isVisible,
    waitFor: waitFor,
    setInputValue: setInputValue,
    clickElement: clickElement,
    commitInputValue: commitInputValue,
    fillCadernoName: fillCadernoName,
    foundQuestionCount: foundQuestionCount,
    clickText: clickText,
    invokeAngularTreeItem: invokeAngularTreeItem,
    pageDiagnosticSnapshot: pageDiagnosticSnapshot,
    compactDiagnosticValue: compactDiagnosticValue
  };
});
