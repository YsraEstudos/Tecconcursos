(function (root) {
  "use strict";

  function start() {
    var modules = root.TecConcursosModules;
    var documentNode = root.document;
    if (!modules || !documentNode || !documentNode.body) return;
    if (!modules.selectors.isSupportedPage(root.location)) return;
    if (documentNode.getElementById("tec-scraper-panel")) return;

    var storage = modules.storage.createStorage(root);
    var collector = modules.collector.createCollector({
      document: documentNode,
      storage: storage,
      parser: modules.parseQuestion,
      api: modules.api,
      apiOptions: { retryCount: 3, retryDelayMs: 1000 },
      navigation: modules.navigation,
      format: modules.format,
      timing: modules.timing,
      waitTimeoutMs: 15000
    });
    var ui = modules.ui.createPanel(documentNode, {
      onStart: async function (limit) {
        ui.setRunning(true);
        try {
          await collector.start({
            limit: limit,
            onStatus: function (message) {
              ui.setStatus(message, false);
              ui.setCount(collector.getQuestions().length);
            }
          });
          ui.setStatus("Coleta finalizada ou pausada.", false);
        } catch (error) {
          ui.setStatus("Falha: " + String(error && error.message || error), true);
        } finally {
          ui.setCount(collector.getQuestions().length);
          ui.setRunning(false);
        }
      },
      onStop: function () {
        collector.stop();
        ui.setStatus("Pausa solicitada.", false);
        ui.setRunning(false);
      },
      onExportText: function () {
        var count = collector.exportText(documentNode);
        ui.setStatus(count + " questão(ões) exportada(s) para TXT.", false);
      },
      onExportJson: function () {
        var count = collector.exportJson(documentNode);
        ui.setStatus(count + " questão(ões) exportada(s) para JSON.", false);
      },
      onClear: function () {
        if (!root.confirm || root.confirm("Limpar as questões salvas?")) {
          collector.clear();
          ui.setCount(0);
          ui.setStatus("Armazenamento limpo.", false);
        }
      }
    });
    if (ui) ui.setStatus("Pronto nesta página de " + modules.selectors.getPageKind(root.location) + ".", false);
  }

  if (root.document && root.document.readyState === "loading") {
    root.document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    root.setTimeout(start, 0);
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
