(function (root, factory) {
  var api = factory(
    typeof module !== "undefined" && module.exports ? {
      selectors: require("./selectors.cjs"),
      parser: require("./parse-question.cjs"),
      api: require("./api.cjs"),
      gabarito: require("./gabarito.cjs"),
      library: require("./library.cjs"),
      navigation: require("./navigation.cjs"),
      format: require("./format.cjs"),
      timing: require("./timing.cjs")
    } : root.TecConcursosModules
  );
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) {
    root.TecConcursosModules = root.TecConcursosModules || {};
    root.TecConcursosModules.collector = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (deps) {
  "use strict";

  function createCollector(options) {
    var config = options || {};
    var documentNode = config.document;
    var storage = config.storage;
    var parser = config.parser;
    var questionApi = config.api || deps.api;
    var gabarito = config.gabarito || deps.gabarito;
    var libraryModule = config.library || deps.library;
    var navigation = config.navigation;
    var format = config.format;
    var timing = config.timing;
    var storageKey = config.storageKey || "tec_questions_data_v2";
    var waitTimeoutMs = Number(config.waitTimeoutMs) > 0 ? Number(config.waitTimeoutMs) : 15000;
    var minClickDelayMs = Number(config.minClickDelayMs) > 0 ? Number(config.minClickDelayMs) : 6000;
    var maxClickDelayMs = Number(config.maxClickDelayMs) > 0 ? Number(config.maxClickDelayMs) : 10000;
    var apiOptions = config.apiOptions || { retryCount: 3, retryDelayMs: 1000 };
    var running = false;
    var runToken = 0;
    var questionsCache = null;

    function readQuestions() {
      if (!questionsCache) {
        var value = storage.read(storageKey, []);
        questionsCache = Array.isArray(value) ? value : [];
      }
      return questionsCache;
    }

    function writeQuestions(questions) {
      questionsCache = Array.isArray(questions) ? questions : [];
      storage.write(storageKey, questions);
    }

    function mergeAnswer(existing, question) {
      if (!question.gabarito) return existing;
      var merged = Object.assign({}, existing);
      var changed = false;
      ["gabarito", "answerField", "statusCode", "apiIndex", "apiQuestionId", "answerSource"].forEach(function (key) {
        if (question[key] !== undefined && question[key] !== existing[key]) {
          merged[key] = question[key];
          changed = true;
        }
      });
      return changed ? merged : existing;
    }

    function clearLegacyAnswer(existing) {
      if (!existing || existing.answerSource !== "api" || existing.answerField) return existing;
      var migrated = Object.assign({}, existing);
      ["gabarito", "statusCode", "apiIndex", "apiQuestionId", "answerSource"].forEach(function (key) {
        delete migrated[key];
      });
      return migrated;
    }

    async function captureCurrent(onStatus) {
      var question = parser.parseQuestionFromDocument(documentNode);
      if (!question) return { question: null, added: false, updated: false, questions: readQuestions() };

      var enriched = question;
      var answerError = null;
      if (
        question.pageKind === "caderno" &&
        questionApi &&
        typeof questionApi.enrichQuestionFromApi === "function"
      ) {
        onStatus("Consultando gabarito da questão #" + question.id + "...");
        var apiResult = await questionApi.enrichQuestionFromApi(documentNode, question, apiOptions);
        enriched = apiResult.question || question;
        answerError = apiResult.error || null;
      }

      var questions = readQuestions();
      var existingIndex = questions.findIndex(function (item) {
        return String(item.id) === String(enriched.id);
      });
      var added = existingIndex < 0;
      var updated = false;

      if (added) {
        questions.push(enriched);
        writeQuestions(questions);
      } else {
        var existing = questions[existingIndex];
        var migrated = answerError ? clearLegacyAnswer(existing) : existing;
        var merged = mergeAnswer(migrated, enriched);
        if (merged === migrated && migrated !== existing) merged = migrated;
        if (merged !== questions[existingIndex]) {
          questions[existingIndex] = merged;
          questions = questions.slice();
          writeQuestions(questions);
          updated = true;
        }
      }

      return {
        question: enriched,
        added: added,
        updated: updated,
        answerError: answerError,
        questions: questions
      };
    }

    async function applyOfficialGabarito(onStatus) {
      if (!gabarito || typeof gabarito.fetchCadernoGabarito !== "function" || typeof gabarito.applyToQuestions !== "function") return;
      var questions = readQuestions();
      if (!questions.length) return;
      if (questions.every(function (item) { return item.gabarito; })) return;
      var lastIndex = 0;
      questions.forEach(function (item) {
        lastIndex = Math.max(lastIndex, Number(item.cadernoIndex) || 0);
      });
      try {
        onStatus("Coletando o gabarito oficial do caderno no final das questões...");
        var entries = await gabarito.fetchCadernoGabarito(documentNode, Object.assign({}, apiOptions, { count: lastIndex }));
        var result = gabarito.applyToQuestions(readQuestions(), entries);
        if (result.applied > 0) {
          writeQuestions(result.questions);
          onStatus("Gabarito oficial aplicado a " + result.applied + " questão(ões) que estavam sem resposta.");
        } else {
          onStatus("Gabarito oficial verificado: nenhuma questão precisava de resposta.");
        }
      } catch (error) {
        onStatus("Não foi possível coletar o gabarito oficial: " + String(error && error.message || error));
      }
    }

    async function start(settings) {
      if (running) return { stopped: false, reason: "already-running", count: readQuestions().length };
      var runSettings = settings || {};
      var limit = Math.max(0, Math.floor(Number(runSettings.limit) || 0));
      var token = runToken + 1;
      runToken = token;
      running = true;
      var addedThisRun = 0;
      var endReached = false;
      var status = typeof runSettings.onStatus === "function" ? runSettings.onStatus : function () {};
      try {
        while (running && token === runToken) {
          var result = await captureCurrent(status);
          if (!result.question) {
            status("Nenhuma questão compatível encontrada nesta página.");
            break;
          }
          var answerLabel = result.question.gabarito
            ? " | Gabarito: " + result.question.gabarito
            : " | Gabarito indisponível";
          if (result.added) {
            addedThisRun += 1;
            status("Questão #" + result.question.id + " salva (" + result.questions.length + ")" + answerLabel + ".");
          } else if (result.updated) {
            status("Questão #" + result.question.id + " atualizada com o gabarito" + answerLabel + ".");
          } else {
            status("Questão #" + result.question.id + " já estava salva" + answerLabel + ".");
          }
          if (result.answerError && !result.question.gabarito) {
            status("Questão #" + result.question.id + " salva, mas a API não retornou o gabarito: " + result.answerError.message);
          }
          if (limit > 0 && addedThisRun >= limit) {
            status("Limite de " + limit + " questão(ões) nova(s) atingido.");
            var lastButton = deps.selectors.findNextButton(documentNode);
            endReached = !lastButton || lastButton.disabled;
            break;
          }

          var nextButton = deps.selectors.findNextButton(documentNode);
          if (!nextButton || nextButton.disabled) {
            endReached = true;
            status("Fim do caderno ou botão 'Próxima questão' indisponível.");
            break;
          }
          var previousId = result.question.id;
          var delayMs = timing.randomInt(minClickDelayMs, maxClickDelayMs);
          status("Aguardando " + (delayMs / 1000).toFixed(1) + "s antes do próximo clique.");
          var delayFinished = await timing.sleep(delayMs, function () {
            return !running || token !== runToken;
          });
          if (!delayFinished || !running || token !== runToken) break;
          if (!navigation.clickNext(documentNode)) {
            status("Não foi possível clicar em 'Próxima questão'.");
            break;
          }
          var changed = await navigation.waitForQuestionChange(
            documentNode,
            previousId,
            typeof parser.extractQuestionIdentity === "function"
              ? function () { return parser.extractQuestionIdentity(documentNode); }
              : function () {
                var current = parser.parseQuestionFromDocument(documentNode);
                return current ? current.id : "";
              },
            {
              timeoutMs: waitTimeoutMs,
              isCancelled: function () { return !running || token !== runToken; }
            }
          );
          if (!changed && running && token === runToken) {
            status("A próxima questão não carregou no tempo esperado.");
            break;
          }
        }
        if (endReached) {
          await applyOfficialGabarito(status);
        }
      } finally {
        running = false;
      }
      return { stopped: !running, count: readQuestions().length, addedThisRun: addedThisRun };
    }

    function stop() {
      running = false;
      runToken += 1;
    }

    function getQuestions() {
      return readQuestions();
    }

    function clear() {
      questionsCache = [];
      storage.remove(storageKey);
    }

    function exportText(documentForDownload) {
      var questions = readQuestions();
      format.downloadText(
        documentForDownload,
        format.createFilename("txt"),
        format.formatQuestionsAsText(questions)
      );
      return questions.length;
    }

    function exportJson(documentForDownload) {
      var questions = readQuestions();
      format.downloadJson(documentForDownload, format.createFilename("json"), questions);
      return questions.length;
    }

    function buildLibraryEntry(questions, options) {
      var list = Array.isArray(questions) ? questions : [];
      var config = options || {};
      var entryLibrary = config.library || libraryModule;
      var parseHeader = entryLibrary && typeof entryLibrary.parseHeader === "function" ? entryLibrary.parseHeader : null;
      var cadernoId = config.cadernoId || (
        questionApi && typeof questionApi.getCadernoId === "function" ? questionApi.getCadernoId(documentNode) : ""
      );
      return {
        id: "coletor-" + (cadernoId || String(new Date().getTime())),
        code: cadernoId || "",
        title: cadernoId ? "Caderno #" + cadernoId : "Caderno coletado",
        group: "Coletor de Questões",
        questions: list.map(function (question) {
          var header = parseHeader && question.header ? parseHeader(question.header) : {};
          return Object.assign({}, question, {
            bank: question.bank || header.bank || "",
            year: question.year != null ? question.year : header.year,
            vacancy: question.vacancy || header.vacancy || "",
            organization: question.organization || header.organization || "",
            role: question.role || header.role || "",
            subject: question.subject || "",
            topic: question.topic || "",
            number: Number(question.cadernoIndex) || 0,
            answer: question.answer || question.gabarito || ""
          });
        })
      };
    }

    function exportHtml(documentForDownload, options) {
      var questions = readQuestions();
      if (!questions.length) return 0;
      var entry = buildLibraryEntry(questions, options);
      var entryLibrary = (options && options.library) || libraryModule;
      if (!entryLibrary || typeof entryLibrary.buildInteractiveHtml !== "function" || typeof entryLibrary.downloadBlob !== "function") return 0;
      entryLibrary.downloadBlob(documentForDownload, entryLibrary.outputBaseName(entry) + ".html", new Blob([entryLibrary.buildInteractiveHtml(entry)], { type: "text/html;charset=utf-8" }));
      return questions.length;
    }

    async function exportExcel(documentForDownload, options) {
      var questions = readQuestions();
      if (!questions.length) return 0;
      var entry = buildLibraryEntry(questions, options);
      var entryLibrary = (options && options.library) || libraryModule;
      if (!entryLibrary || typeof entryLibrary.buildXlsxBlob !== "function" || typeof entryLibrary.downloadBlob !== "function") return 0;
      var blob = await entryLibrary.buildXlsxBlob(entry);
      entryLibrary.downloadBlob(documentForDownload, entryLibrary.outputBaseName(entry) + ".xlsx", blob);
      return questions.length;
    }

    return {
      start: start,
      stop: stop,
      isRunning: function () { return running; },
      captureCurrent: captureCurrent,
      getQuestions: getQuestions,
      clear: clear,
      exportText: exportText,
      exportJson: exportJson,
      buildLibraryEntry: buildLibraryEntry,
      exportHtml: exportHtml,
      exportExcel: exportExcel
    };
  }

  return { createCollector: createCollector };
});
