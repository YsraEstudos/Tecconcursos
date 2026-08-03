(function (root) {
  "use strict";

  function installEarlyPrintGuard() {
    var modules = root.TecConcursosModules;
    if (!modules || !modules.storage || !modules.automationState || !modules.printBlocker || !root.document) return;
    var storage = modules.storage.createStorage(root);
    var stateModule = modules.automationState;
    var state = stateModule.readState(storage);
    var pageWindow = root;
    var addElement = null;
    try {
      pageWindow = typeof unsafeWindow !== "undefined" ? unsafeWindow : root;
    } catch (_) {}
    try {
      addElement = typeof GM_addElement === "function" ? GM_addElement : null;
    } catch (_) {}
    modules.printBlocker.suppressNativePrintOnOutputPage(root, {
      enabled: Boolean(state.export && state.export.job),
      pageWindow: pageWindow,
      addElement: addElement
    });
  }

  function start() {
    var modules = root.TecConcursosModules;
    var documentNode = root.document;
    if (!modules || !documentNode || !documentNode.body) return;
    if (!modules.selectors.isSupportedPage(root.location)) return;

    var storage = modules.storage.createStorage(root);
    var pageKind = modules.selectors.getPageKind(root.location);
    var collector = null;
    if ((pageKind === "caderno" || pageKind === "filtro") && !documentNode.getElementById("tec-scraper-panel")) {
      collector = modules.collector.createCollector({
        document: documentNode,
        storage: storage,
        parser: modules.parseQuestion,
        api: modules.api,
        gabarito: modules.gabarito,
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
        onExportHtml: function () {
          try {
            var count = collector.exportHtml(documentNode, { library: modules.library });
            ui.setStatus(count ? count + " questão(ões) exportada(s) para HTML interativo." : "Nenhuma questão salva para exportar.", false);
          } catch (error) {
            ui.setStatus("Falha ao exportar HTML: " + String(error && error.message || error), true);
          }
        },
        onExportExcel: function () {
          Promise.resolve(collector.exportExcel(documentNode, { library: modules.library })).then(function (count) {
            ui.setStatus(count ? count + " questão(ões) exportada(s) para Excel." : "Nenhuma questão salva para exportar.", false);
          }).catch(function (error) {
            ui.setStatus("Falha ao exportar Excel: " + String(error && error.message || error), true);
          });
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

        if (!modules.library || !modules.automation || !modules.libraryUi || documentNode.getElementById("tec-library-panel")) return;
        var library = modules.library.createLibrary(storage);
        var automation = modules.automation.createAutomation({ root: root, document: documentNode, storage: storage, library: library });
        var menu;
        function refreshMenu() {
          if (menu) menu.refresh();
        }
        var libraryUi = modules.libraryUi.createPanel(documentNode, {
      aiContextText: modules.aiContext && modules.aiContext.getText ? modules.aiContext.getText() : "",
      getPlan: automation.readPlan,
      getState: automation.getState,
      getStatus: automation.status,
      getProgress: automation.getProgress,
      defaultFolderId: automation.defaultFolderId,
      onFolderIdChange: automation.saveFolderId,
      listLibrary: library.list,
      onImport: function (rawPlan) {
        var plan = modules.plan.parsePlanText(rawPlan);
        automation.savePlan(plan);
        return plan.matters.length + " matéria(s) salva(s) no plano.";
      },
      onExportPlan: function () {
        var plan = automation.readPlan();
        if (!plan.matters.length) return "Nenhum plano salvo para exportar.";
        var markdown = modules.plan.serializePlan(plan);
        var stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 10);
        modules.library.downloadBlob(documentNode, "Tecconcursos_Materias_Consolidado-" + stamp + ".md", new Blob([markdown], { type: "text/markdown;charset=utf-8" }));
        return plan.matters.length + " matéria(s) exportada(s) como Markdown consolidado.";
      },
           onCreate: function (folderId) {
             if (root.confirm && !root.confirm("Criar cadernos e iniciar a exportação do plano? O processo poderá ser pausado e retomado.")) return "Operação cancelada.";
             var result = automation.startCreation(folderId);
             refreshMenu();
             return result;
           },
           onRestart: function (folderId) {
             if (root.confirm && !root.confirm("Reiniciar a busca de materiais? O plano salvo será procurado na pasta e cadernos existentes serão reutilizados.")) return "Operação cancelada.";
             var result = automation.restartMaterialSearch(folderId);
             refreshMenu();
             return result;
           },
          onCurrent: function () {
            if (root.confirm && !root.confirm("Exportar este caderno para a biblioteca local?")) return "Operação cancelada.";
            var result = automation.startCurrentCaderno();
            refreshMenu();
            return result;
          },
          onPause: function () {
            var result = automation.pause("library-panel");
            refreshMenu();
            return result;
          },
          onResume: function () {
            var result = automation.resumePaused();
            refreshMenu();
            return result;
          },
          onTakeover: function () {
            var result = automation.takeover();
            refreshMenu();
            return result;
          },
          onError: function (error) {
            var result = automation.fail(error);
            refreshMenu();
            return result;
          },
      onDownloadDiagnostics: function () {
        var diagnostics = automation.getDiagnostics();
        var stamp = new Date().toISOString().replace(/[:.]/g, "-");
        var filename = "tecconcursos-log-detalhado-" + stamp + ".json";
        modules.library.downloadBlob(documentNode, filename, new Blob([JSON.stringify(diagnostics, null, 2)], { type: "application/json;charset=utf-8" }));
        return diagnostics.progress.events.length;
      },
      onSelect: function () {},
      onDownloadXlsx: function (id) {
        var entry = library.get(id);
        if (!entry) return;
        Promise.resolve(modules.library.buildXlsxBlob(entry)).then(function (blob) {
          modules.library.downloadBlob(documentNode, modules.library.outputBaseName(entry) + ".xlsx", blob);
          if (libraryUi) libraryUi.setStatus("Excel baixado com as imagens disponíveis incorporadas.", false);
        }).catch(function (error) {
          if (libraryUi) libraryUi.setStatus("Falha ao gerar o Excel: " + String(error && error.message || error), true);
        });
      },
      onDownloadHtml: function (id) {
        var entry = library.get(id);
        if (!entry) return;
        modules.library.downloadBlob(documentNode, modules.library.outputBaseName(entry) + ".html", new Blob([modules.library.buildInteractiveHtml(entry)], { type: "text/html;charset=utf-8" }));
      },
      onRemove: function (id) {
        if (!root.confirm || root.confirm("Remover este caderno da biblioteca local?")) library.remove(id);
          }
        });
        if (modules.tampermonkeyMenu) {
          menu = modules.tampermonkeyMenu.createMenu({
            root: root,
            getState: automation.getState,
            onPause: function () {
              var result = automation.pause("tampermonkey-menu");
              refreshMenu();
              return result;
            },
            onResume: function () {
              var result = automation.resumePaused();
              refreshMenu();
              return result;
            },
            onError: function (error) {
              var result = automation.fail(error);
              refreshMenu();
              if (libraryUi) libraryUi.setStatus("Falha no comando do Tampermonkey: " + String(error && error.message || error), true);
              return result;
            }
          });
          menu.refresh();
        }
        if (modules.automationControls) {
          modules.automationControls.createEscapeStop({
            root: root,
            onStop: function () {
              var stopped = false;
              if (collector && collector.isRunning()) {
                collector.stop();
                stopped = true;
              }
              var state = automation.getState();
              var message = "Nenhuma automação estava em execução.";
              if (state.running && (state.creation || state.export)) {
                message = automation.pause("escape");
                stopped = true;
              }
              refreshMenu();
              if (libraryUi) libraryUi.setStatus(stopped ? "Automação parada pelo ESC." : message, false);
              return message;
            },
            onError: function (error) {
              if (libraryUi) libraryUi.setStatus("Falha ao parar pelo ESC: " + String(error && error.message || error), true);
            }
          });
        }
        root.setTimeout(function () {
      Promise.resolve(automation.resumeOnPageLoad()).then(function (message) {
        refreshMenu();
        if (libraryUi) libraryUi.setStatus(message || automation.status(), false);
      }).catch(function (error) {
        automation.fail(error);
        refreshMenu();
        if (libraryUi) libraryUi.setStatus("Falha na automação: " + String(error && error.message || error), true);
      });
    }, 300);
  }

  installEarlyPrintGuard();
  if (root.document && root.document.readyState === "loading") {
    root.document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    root.setTimeout(start, 0);
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
