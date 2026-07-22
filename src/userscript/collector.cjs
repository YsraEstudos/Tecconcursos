(function (root, factory) {
  var api = factory(
    typeof module !== "undefined" && module.exports ? {
      selectors: require("./selectors.cjs"),
      parser: require("./parse-question.cjs"),
      api: require("./api.cjs"),
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
    var navigation = config.navigation;
    var format = config.format;
    var timing = config.timing;
    var storageKey = config.storageKey || "tec_questions_data_v2";
    var waitTimeoutMs = Number(config.waitTimeoutMs) > 0 ? Number(config.waitTimeoutMs) : 15000;
    var minClickDelayMs = Number(config.minClickDelayMs) > 0 ? Number(config.minClickDelayMs) : 4000;
    var maxClickDelayMs = Number(config.maxClickDelayMs) > 0 ? Number(config.maxClickDelayMs) : 8000;
    var apiOptions = config.apiOptions || { retryCount: 3, retryDelayMs: 1000 };
    var running = false;
    var runToken = 0;

    function readQuestions() {
      var value = storage.read(storageKey, []);
      return Array.isArray(value) ? value : [];
    }

    function writeQuestions(questions) {
      storage.write(storageKey, questions);
    }

    function mergeAnswer(existing, question) {
      if (!question.gabarito) return existing;
      var merged = Object.assign({}, existing);
      var changed = false;
      ["gabarito", "statusCode", "apiIndex", "apiQuestionId", "answerSource"].forEach(function (key) {
        if (question[key] !== undefined && question[key] !== existing[key]) {
          merged[key] = question[key];
          changed = true;
        }
      });
      return changed ? merged : existing;
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
        var merged = mergeAnswer(questions[existingIndex], enriched);
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

    async function start(settings) {
      if (running) return { stopped: false, reason: "already-running", count: readQuestions().length };
      var runSettings = settings || {};
      var limit = Math.max(0, Math.floor(Number(runSettings.limit) || 0));
      var token = runToken + 1;
      runToken = token;
      running = true;
      var addedThisRun = 0;
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
            status("Questão #" + result.question.id + " salva, mas a API não retornou o gabarito.");
          }
          if (limit > 0 && addedThisRun >= limit) {
            status("Limite de " + limit + " questão(ões) nova(s) atingido.");
            break;
          }

          var nextButton = deps.selectors.findNextButton(documentNode);
          if (!nextButton || nextButton.disabled) {
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
            function () {
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

    return {
      start: start,
      stop: stop,
      isRunning: function () { return running; },
      captureCurrent: captureCurrent,
      getQuestions: getQuestions,
      clear: clear,
      exportText: exportText,
      exportJson: exportJson
    };
  }

  return { createCollector: createCollector };
});
