// ==UserScript==
// @name         TecConcursos - Coletor de Questões Pro
// @namespace    https://github.com/YsraEstudos/Tecconcursos
// @version      2.1.0
// @description  Coleta questões de cadernos, exporta TXT/JSON e aguarda 4-8 segundos aleatórios entre cliques.
// @author       Codex
// @match        https://www.tecconcursos.com.br/questoes/cadernos/*
// @match        https://tecconcursos.com.br/questoes/cadernos/*
// @match        https://www.tecconcursos.com.br/questoes/filtrar*
// @match        https://tecconcursos.com.br/questoes/filtrar*
// @updateURL    https://raw.githubusercontent.com/YsraEstudos/Tecconcursos/main/tecconcursos-scraper.user.js
// @downloadURL  https://raw.githubusercontent.com/YsraEstudos/Tecconcursos/main/tecconcursos-scraper.user.js
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @noframes
// ==/UserScript==

(function () {
// ---- selectors.cjs ----
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
    filtro: /\/questoes\/filtrar(?:\/|$)/i
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
    return "unknown";
  }

  function isSupportedPage(locationLike) {
    return getPageKind(locationLike) !== "unknown";
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
    isSupportedPage: isSupportedPage,
    isVisible: isVisible,
    findQuestionRoot: findQuestionRoot,
    findNextButton: findNextButton,
    findPreviousButton: findPreviousButton
  };
});

// ---- parse-question.cjs ----
(function (root, factory) {
  var api = factory(
    typeof module !== "undefined" && module.exports ? require("./selectors.cjs") : root.TecConcursosModules.selectors
  );
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) {
    root.TecConcursosModules = root.TecConcursosModules || {};
    root.TecConcursosModules.parseQuestion = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (selectors) {
  "use strict";

  function textOf(node) {
    if (!node) return "";
    return String(node.innerText || node.textContent || "").trim();
  }

  function normalizeLine(value) {
    return String(value == null ? "" : value)
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+/g, " ")
      .trim();
  }

  function normalizeBlock(value) {
    return String(value == null ? "" : value)
      .replace(/\u00a0/g, " ")
      .replace(/\r/g, "")
      .split("\n")
      .map(normalizeLine)
      .filter(Boolean)
      .join("\n")
      .trim();
  }

  function first(rootNode, selectorsList) {
    for (var i = 0; i < selectorsList.length; i += 1) {
      var node = rootNode && typeof rootNode.querySelector === "function"
        ? rootNode.querySelector(selectorsList[i])
        : null;
      if (node) return node;
    }
    return null;
  }

  function all(rootNode, selectorsList) {
    var output = [];
    for (var i = 0; i < selectorsList.length; i += 1) {
      if (!rootNode || typeof rootNode.querySelectorAll !== "function") continue;
      var nodes = Array.from(rootNode.querySelectorAll(selectorsList[i]));
      for (var j = 0; j < nodes.length; j += 1) {
        if (output.indexOf(nodes[j]) < 0) output.push(nodes[j]);
      }
      if (output.length) return output;
    }
    return output;
  }

  function extractId(value) {
    var match = String(value || "").match(/#?(\d{5,10})/);
    return match ? match[1] : "";
  }

  function extractQuestionId(rootNode, documentNode) {
    var idNode = first(rootNode, [".id-questao", "[data-testid='question-id']", "a[href*='/questoes/']"]);
    var fromNode = extractId(textOf(idNode));
    if (fromNode) return fromNode;

    if (idNode && typeof idNode.getAttribute === "function") {
      var fromHref = extractId(idNode.getAttribute("href"));
      if (fromHref) return fromHref;
    }

    var bodyNode = documentNode && documentNode.body;
    return extractId(textOf(bodyNode));
  }

  function extractAlternatives(rootNode) {
    var items = all(rootNode, [
      ".questao-enunciado-alternativas > li",
      ".questao-enunciado-alternativas li",
      ".q-options li",
      ".q-opcao",
      "[role='radio']",
      "[data-testid='option']"
    ]);
    return items.map(function (item, index) {
      var labelNode = first(item, [".questao-enunciado-alternativa-opcao", "[data-testid='option-label']"]);
      var valueNode = first(item, [".questao-enunciado-alternativa-texto", "[data-testid='option-text']"]);
      var rawLabel = normalizeLine(textOf(labelNode));
      var rawText = normalizeBlock(textOf(valueNode || item));
      var letterMatch = rawLabel.match(/[A-E]/i) || rawText.match(/^([A-E])\s*[:.)-]/i);
      var letter = letterMatch ? String(letterMatch[1] || letterMatch[0]).toUpperCase() : String.fromCharCode(65 + index);
      if (rawText && new RegExp("^" + letter + "\\s*[:.)-]\\s*", "i").test(rawText)) {
        rawText = rawText.replace(new RegExp("^" + letter + "\\s*[:.)-]\\s*", "i"), "").trim();
      }
      return { letter: letter, text: rawText };
    }).filter(function (item) {
      return Boolean(item.text);
    });
  }

  function parseQuestionFromDocument(documentNode, now) {
    var rootNode = selectors.findQuestionRoot(documentNode);
    if (!rootNode) return null;

    var id = extractQuestionId(rootNode, documentNode);
    if (!id) return null;

    var headerNode = first(rootNode, [".questao-enunciado-concurso", ".q-question-header", "[data-testid='question-header']"]);
    var subjectNode = first(rootNode, [
      ".questao-cabecalho-informacoes-materia",
      "[data-testid='question-subject']",
      ".q-question-subject"
    ]);
    var topicNode = first(rootNode, [
      ".questao-cabecalho-informacoes-assunto",
      "[data-testid='question-topic']",
      ".q-question-topic"
    ]);
    var organizationNode = first(rootNode, [
      ".questao-cabecalho-logotipo a",
      "[data-testid='question-organization']",
      ".q-question-organization"
    ]);
    var statementNode = first(rootNode, [
      ".questao-enunciado-texto",
      ".q-question-enunciado",
      ".q-enunciado",
      "[data-testid='question-text']"
    ]);

    var locationLike = documentNode && documentNode.location ? documentNode.location : null;
    return {
      id: id,
      questionId: "#" + id,
      header: normalizeBlock(textOf(headerNode)),
      subject: normalizeLine(textOf(subjectNode)),
      topic: normalizeLine(textOf(topicNode)),
      organization: normalizeLine(textOf(organizationNode)),
      statement: normalizeBlock(textOf(statementNode)),
      options: extractAlternatives(rootNode),
      url: locationLike && locationLike.href ? String(locationLike.href) : "",
      pageKind: selectors.getPageKind(locationLike),
      extractedAt: (now || new Date()).toISOString()
    };
  }

  return {
    textOf: textOf,
    normalizeLine: normalizeLine,
    normalizeBlock: normalizeBlock,
    extractQuestionId: extractQuestionId,
    extractAlternatives: extractAlternatives,
    parseQuestionFromDocument: parseQuestionFromDocument
  };
});

// ---- format.cjs ----
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) {
    root.TecConcursosModules = root.TecConcursosModules || {};
    root.TecConcursosModules.format = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function safe(value) {
    var text = String(value == null ? "" : value).replace(/\r/g, "").trim();
    return text || "-";
  }

  function formatQuestion(question, index) {
    var lines = [
      "QUESTAO " + (index + 1) + " (#" + safe(question.id) + ")",
      "URL: " + safe(question.url),
      "Cabecalho: " + safe(question.header),
      "Materia: " + safe(question.subject),
      "Assunto: " + safe(question.topic),
      "Orgao: " + safe(question.organization),
      "",
      "ENUNCIADO:",
      safe(question.statement),
      "",
      "ALTERNATIVAS:"
    ];
    var options = Array.isArray(question.options) ? question.options : [];
    if (!options.length) lines.push("-");
    options.forEach(function (option) {
      lines.push("  " + safe(option.letter) + ") " + safe(option.text));
    });
    return lines.join("\r\n");
  }

  function formatQuestionsAsText(questions) {
    var list = Array.isArray(questions) ? questions : [];
    var lines = [
      "TEC CONCURSOS - EXPORTACAO DE QUESTOES",
      "Gerado em: " + new Date().toLocaleString("pt-BR"),
      "Total: " + list.length,
      ""
    ];
    list.forEach(function (question, index) {
      lines.push(formatQuestion(question, index));
      lines.push("");
      lines.push("------------------------------------------------------------");
      lines.push("");
    });
    return lines.join("\r\n");
  }

  function createFilename(extension, now) {
    var date = now || new Date();
    var stamp = [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0"),
      "-",
      String(date.getHours()).padStart(2, "0"),
      String(date.getMinutes()).padStart(2, "0"),
      String(date.getSeconds()).padStart(2, "0")
    ].join("");
    return "tecconcursos-questoes-" + stamp + "." + extension.replace(/^\./, "");
  }

  function downloadText(documentNode, filename, content) {
    var blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var anchor = documentNode.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    documentNode.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 60000);
  }

  function downloadJson(documentNode, filename, questions) {
    var content = JSON.stringify(questions, null, 2);
    var blob = new Blob([content], { type: "application/json;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var anchor = documentNode.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    documentNode.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 60000);
  }

  return {
    formatQuestion: formatQuestion,
    formatQuestionsAsText: formatQuestionsAsText,
    createFilename: createFilename,
    downloadText: downloadText,
    downloadJson: downloadJson
  };
});

// ---- storage.cjs ----
(function (root, factory) {
  var api = factory(root);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) {
    root.TecConcursosModules = root.TecConcursosModules || {};
    root.TecConcursosModules.storage = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  function createStorage(host) {
    var runtime = host || root;
    var hasGet = typeof runtime.GM_getValue === "function";
    var hasSet = typeof runtime.GM_setValue === "function";
    var hasDelete = typeof runtime.GM_deleteValue === "function";
    var local = runtime.localStorage;

    function read(key, fallback) {
      if (hasGet) {
        try {
          return runtime.GM_getValue(key, fallback);
        } catch (_) {
          return fallback;
        }
      }
      try {
        var raw = local && local.getItem ? local.getItem(key) : null;
        return raw == null ? fallback : JSON.parse(raw);
      } catch (_) {
        return fallback;
      }
    }

    function write(key, value) {
      if (hasSet) {
        runtime.GM_setValue(key, value);
        return;
      }
      if (local && local.setItem) local.setItem(key, JSON.stringify(value));
    }

    function remove(key) {
      if (hasDelete) {
        runtime.GM_deleteValue(key);
        return;
      }
      if (local && local.removeItem) local.removeItem(key);
    }

    return { read: read, write: write, remove: remove };
  }

  return { createStorage: createStorage };
});

// ---- timing.cjs ----
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) {
    root.TecConcursosModules = root.TecConcursosModules || {};
    root.TecConcursosModules.timing = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function randomInt(min, max, random) {
    var lower = Math.ceil(Number(min) || 0);
    var upper = Math.floor(Number(max) || 0);
    if (upper < lower) {
      var swap = lower;
      lower = upper;
      upper = swap;
    }
    if (upper === lower) return lower;
    var source = typeof random === "function" ? random : Math.random;
    var value = Number(source());
    if (!Number.isFinite(value)) value = 0;
    value = Math.max(0, Math.min(0.999999999, value));
    return Math.floor(value * (upper - lower + 1)) + lower;
  }

  function sleep(ms, isCancelled) {
    var duration = Math.max(0, Math.floor(Number(ms) || 0));
    var cancelled = typeof isCancelled === "function" ? isCancelled : function () { return false; };
    if (!duration || cancelled()) return Promise.resolve(!cancelled());

    return new Promise(function (resolve) {
      var interval = setInterval(function () {
        if (cancelled()) {
          clearInterval(interval);
          resolve(false);
          return;
        }
        if (Date.now() >= deadline) {
          clearInterval(interval);
          resolve(true);
        }
      }, Math.min(100, duration));
      var deadline = Date.now() + duration;
    });
  }

  return { randomInt: randomInt, sleep: sleep };
});

// ---- navigation.cjs ----
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
      if (MutationObserverCtor && documentNode && documentNode.body) {
        observer = new MutationObserverCtor(check);
        observer.observe(documentNode.body, { childList: true, subtree: true, characterData: true });
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

// ---- collector.cjs ----
(function (root, factory) {
  var api = factory(
    typeof module !== "undefined" && module.exports ? {
      selectors: require("./selectors.cjs"),
      parser: require("./parse-question.cjs"),
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
    var navigation = config.navigation;
    var format = config.format;
    var timing = config.timing;
    var storageKey = config.storageKey || "tec_questions_data_v2";
    var waitTimeoutMs = Number(config.waitTimeoutMs) > 0 ? Number(config.waitTimeoutMs) : 15000;
    var minClickDelayMs = Number(config.minClickDelayMs) > 0 ? Number(config.minClickDelayMs) : 4000;
    var maxClickDelayMs = Number(config.maxClickDelayMs) > 0 ? Number(config.maxClickDelayMs) : 8000;
    var running = false;
    var runToken = 0;

    function readQuestions() {
      var value = storage.read(storageKey, []);
      return Array.isArray(value) ? value : [];
    }

    function writeQuestions(questions) {
      storage.write(storageKey, questions);
    }

    function captureCurrent() {
      var question = parser.parseQuestionFromDocument(documentNode);
      if (!question) return { question: null, added: false, questions: readQuestions() };
      var questions = readQuestions();
      var exists = questions.some(function (item) { return String(item.id) === String(question.id); });
      if (!exists) {
        questions.push(question);
        writeQuestions(questions);
      }
      return { question: question, added: !exists, questions: questions };
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
          var result = captureCurrent();
          if (!result.question) {
            status("Nenhuma questão compatível encontrada nesta página.");
            break;
          }
          if (result.added) {
            addedThisRun += 1;
            status("Questão #" + result.question.id + " salva (" + result.questions.length + ").");
          } else {
            status("Questão #" + result.question.id + " já estava salva.");
          }
          if (limit > 0 && addedThisRun >= limit) {
            status("Limite de " + limit + " questão(ões) atingido.");
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

// ---- ui.cjs ----
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) {
    root.TecConcursosModules = root.TecConcursosModules || {};
    root.TecConcursosModules.ui = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function button(documentNode, label, id) {
    var item = documentNode.createElement("button");
    item.type = "button";
    item.id = id;
    item.textContent = label;
    item.style.cssText = "border:0;border-radius:7px;padding:7px 9px;color:#fff;font-weight:700;cursor:pointer;";
    return item;
  }

  function createPanel(documentNode, handlers) {
    if (documentNode.getElementById("tec-scraper-panel")) return null;
    var config = handlers || {};
    var panel = documentNode.createElement("section");
    panel.id = "tec-scraper-panel";
    panel.setAttribute("data-tec-scraper", "true");
    panel.style.cssText = [
      "position:fixed",
      "right:18px",
      "bottom:18px",
      "z-index:2147483646",
      "width:280px",
      "padding:12px",
      "border-radius:12px",
      "background:#111827",
      "color:#f9fafb",
      "box-shadow:0 12px 30px rgba(0,0,0,.35)",
      "font:13px system-ui,sans-serif"
    ].join(";");
    var title = documentNode.createElement("strong");
    title.textContent = "Tec Concursos";
    title.style.display = "block";
    title.style.marginBottom = "7px";
    panel.appendChild(title);

    var count = documentNode.createElement("div");
    count.id = "tec-scraper-count";
    count.style.marginBottom = "7px";
    panel.appendChild(count);

    var limit = documentNode.createElement("input");
    limit.id = "tec-scraper-limit";
    limit.type = "number";
    limit.min = "0";
    limit.value = "0";
    limit.placeholder = "0 = todas";
    limit.title = "Quantidade máxima de questões novas";
    limit.style.cssText = "width:100%;margin-bottom:7px;padding:5px;border-radius:6px;border:1px solid #4b5563;box-sizing:border-box;";
    panel.appendChild(limit);

    var status = documentNode.createElement("div");
    status.id = "tec-scraper-status";
    status.textContent = "Pronto.";
    status.style.cssText = "min-height:34px;margin-bottom:8px;color:#d1fae5;";
    panel.appendChild(status);

    var row = documentNode.createElement("div");
    row.style.cssText = "display:flex;gap:6px;flex-wrap:wrap;";
    var start = button(documentNode, "▶ Iniciar", "tec-scraper-start");
    var stop = button(documentNode, "⏸ Pausar", "tec-scraper-stop");
    var text = button(documentNode, "TXT", "tec-scraper-export-txt");
    var json = button(documentNode, "JSON", "tec-scraper-export-json");
    var clear = button(documentNode, "Limpar", "tec-scraper-clear");
    start.style.background = "#059669";
    stop.style.background = "#dc2626";
    text.style.background = "#2563eb";
    json.style.background = "#4f46e5";
    clear.style.background = "#4b5563";
    [start, stop, text, json, clear].forEach(function (item) { row.appendChild(item); });
    panel.appendChild(row);
    documentNode.body.appendChild(panel);

    function setStatus(message, isError) {
      status.textContent = String(message || "");
      status.style.color = isError ? "#fecaca" : "#d1fae5";
    }

    function setCount(value) {
      count.textContent = "Salvas: " + String(Number(value) || 0);
    }

    function setRunning(value) {
      start.disabled = Boolean(value);
      stop.disabled = !value;
    }

    start.addEventListener("click", function () {
      if (typeof config.onStart === "function") config.onStart(Number(limit.value) || 0);
    });
    stop.addEventListener("click", function () {
      if (typeof config.onStop === "function") config.onStop();
    });
    text.addEventListener("click", function () {
      if (typeof config.onExportText === "function") config.onExportText();
    });
    json.addEventListener("click", function () {
      if (typeof config.onExportJson === "function") config.onExportJson();
    });
    clear.addEventListener("click", function () {
      if (typeof config.onClear === "function") config.onClear();
    });

    setRunning(false);
    setCount(0);
    return {
      panel: panel,
      setStatus: setStatus,
      setCount: setCount,
      setRunning: setRunning
    };
  }

  return { createPanel: createPanel };
});

// ---- entry.cjs ----
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
})();
