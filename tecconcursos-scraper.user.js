// ==UserScript==
// @name         TecConcursos - Coletor de Questões Pro
// @namespace    https://github.com/YsraEstudos/Tecconcursos
// @version      2.5.13
// @description  Coleta questões e cria/exporta cadernos para uma biblioteca local com Excel e HTML interativo.
// @author       Codex
// @match        https://www.tecconcursos.com.br/questoes/cadernos/*
// @match        https://tecconcursos.com.br/questoes/cadernos/*
// @match        https://www.tecconcursos.com.br/questoes/filtrar*
// @match        https://tecconcursos.com.br/questoes/filtrar*
// @match        https://www.tecconcursos.com.br/questoes/pastas*
// @match        https://tecconcursos.com.br/questoes/pastas*
// @updateURL    https://raw.githubusercontent.com/YsraEstudos/Tecconcursos/main/tecconcursos-scraper.user.js
// @downloadURL  https://raw.githubusercontent.com/YsraEstudos/Tecconcursos/main/tecconcursos-scraper.user.js
// @run-at       document-start
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        unsafeWindow
// @noframes
// ==/UserScript==

(function () {
// ---- answer.cjs ----
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) {
    root.TecConcursosModules = root.TecConcursosModules || {};
    root.TecConcursosModules.answer = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var LETTERS = ["A", "B", "C", "D", "E"];

  function statusToAnswer(status) {
    var numeric = Number(status);
    return numeric >= 1 && numeric <= LETTERS.length ? LETTERS[numeric - 1] : "";
  }

  function answerToStatus(letter) {
    var normalized = String(letter || "").trim().toUpperCase();
    var index = LETTERS.indexOf(normalized);
    return index >= 0 ? index + 1 : null;
  }

  function valueToAnswer(value) {
    if (value == null || value === "") return "";
    var normalized = String(value).trim().toUpperCase();
    if (/^[A-E]$/.test(normalized)) return normalized;
    return statusToAnswer(normalized);
  }

  function extractCorrectAnswer(raw) {
    var source = raw || {};
    var candidates = [
      ["numeroAlternativaCorreta", source.numeroAlternativaCorreta],
      ["alternativaCorreta", source.alternativaCorreta],
      ["gabaritoDefinitivo", source.gabaritoDefinitivo],
      ["gabaritoPreliminar", source.gabaritoPreliminar],
      ["gabarito", source.gabarito],
      ["resolucao.alternativa", source.resolucao && source.resolucao.alternativa]
    ];

    for (var i = 0; i < candidates.length; i += 1) {
      var answer = valueToAnswer(candidates[i][1]);
      if (answer) return { letter: answer, field: candidates[i][0] };
    }
    return null;
  }

  return {
    letters: LETTERS.slice(),
    statusToAnswer: statusToAnswer,
    answerToStatus: answerToStatus,
    valueToAnswer: valueToAnswer,
    extractCorrectAnswer: extractCorrectAnswer
  };
});

// ---- api.cjs ----
(function (root, factory) {
  var api = factory(
    typeof module !== "undefined" && module.exports
      ? require("../shared/answer.cjs")
      : root.TecConcursosModules.answer
  );
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) {
    root.TecConcursosModules = root.TecConcursosModules || {};
    root.TecConcursosModules.api = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (answer) {
  "use strict";

  function getCadernoId(documentNode) {
    var locationLike = documentNode && documentNode.location;
    var pathname = locationLike && locationLike.pathname ? String(locationLike.pathname) : "";
    var match = pathname.match(/\/questoes\/cadernos\/(\d+)/i);
    return match ? match[1] : "";
  }

  function getQuestionIndex(documentNode, question) {
    if (question && Number(question.cadernoIndex) > 0) {
      return Number(question.cadernoIndex);
    }
    var body = documentNode && documentNode.body;
    var text = body ? String(body.innerText || body.textContent || "") : "";
    var match = text.match(/Quest(?:ão|ao)\s+(\d+)\s+de\b/i);
    return match ? Number(match[1]) : null;
  }

  function getFetch(documentNode, fetchImpl) {
    if (typeof fetchImpl === "function") return fetchImpl;
    var windowLike = documentNode && documentNode.defaultView;
    if (windowLike && typeof windowLike.fetch === "function") return windowLike.fetch.bind(windowLike);
    if (typeof fetch === "function") return fetch;
    throw new Error("Fetch não está disponível nesta página.");
  }

  function wait(ms, waitImpl) {
    if (typeof waitImpl === "function") return waitImpl(ms);
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  async function fetchQuestionAnswer(documentNode, question, options) {
    var config = options || {};
    var cadernoId = getCadernoId(documentNode);
    var index = getQuestionIndex(documentNode, question);
    if (!cadernoId) throw new Error("ID do caderno não encontrado.");
    if (!index) throw new Error("Índice da questão não encontrado.");

    var fetchImpl = getFetch(documentNode, config.fetchImpl);
    var retryCount = Number(config.retryCount) > 0 ? Math.floor(Number(config.retryCount)) : 3;
    var retryDelayMs = Number(config.retryDelayMs) >= 0 ? Number(config.retryDelayMs) : 1000;
    var url = "/api/cadernos/" + encodeURIComponent(cadernoId) +
      "/questoes/" + encodeURIComponent(index) + "?atualizarCronometro=true";
    var lastError = null;

    for (var attempt = 1; attempt <= retryCount; attempt += 1) {
      try {
        var response = await fetchImpl(url, {
          credentials: "include",
          headers: {
            "Accept": "application/json, text/plain, */*",
            "X-Requested-With": "XMLHttpRequest"
          }
        });
        if (!response || !response.ok) {
          throw new Error("HTTP " + (response && response.status ? response.status : "desconhecido"));
        }
        var data = await response.json();
        var raw = data && data.questao;
        if (!raw || raw.idQuestao == null) {
          throw new Error("A API não retornou a questão.");
        }
        var parsedAnswer = answer.extractCorrectAnswer(raw);
        if (!parsedAnswer) {
          throw new Error("A API retornou a questão, mas não expôs numeroAlternativaCorreta.");
        }
        return {
          gabarito: parsedAnswer.letter,
          answerField: parsedAnswer.field,
          statusCode: raw.status == null ? null : Number(raw.status),
          apiIndex: index,
          apiQuestionId: String(raw.idQuestao)
        };
      } catch (error) {
        lastError = error;
        if (attempt < retryCount) await wait(retryDelayMs * attempt, config.waitImpl);
      }
    }
    throw lastError || new Error("Não foi possível consultar o gabarito.");
  }

  async function enrichQuestionFromApi(documentNode, question, options) {
    try {
      var answerData = await fetchQuestionAnswer(documentNode, question, options);
      return {
        question: Object.assign({}, question, answerData, { answerSource: "api" }),
        error: null
      };
    } catch (error) {
      return {
        question: question,
        error: error
      };
    }
  }

  return {
    getCadernoId: getCadernoId,
    getQuestionIndex: getQuestionIndex,
    fetchQuestionAnswer: fetchQuestionAnswer,
    enrichQuestionFromApi: enrichQuestionFromApi
  };
});

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

  function extractQuestionIndex(documentNode) {
    var bodyNode = documentNode && documentNode.body;
    var text = bodyNode ? textOf(bodyNode) : "";
    var match = text.match(/Quest(?:ão|ao)\s+(\d+)\s+de\b/i);
    return match ? Number(match[1]) : null;
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
      cadernoIndex: extractQuestionIndex(documentNode),
      extractedAt: (now || new Date()).toISOString()
    };
  }

  return {
    textOf: textOf,
    normalizeLine: normalizeLine,
    normalizeBlock: normalizeBlock,
    extractQuestionId: extractQuestionId,
    extractAlternatives: extractAlternatives,
    extractQuestionIndex: extractQuestionIndex,
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
      "Gabarito: " + safe(question.gabarito),
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

// ---- plan.cjs ----
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) {
    root.TecConcursosModules = root.TecConcursosModules || {};
    root.TecConcursosModules.plan = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var DEFAULT_BANKS = [
    "FCC", "Fundatec", "Vunesp", "Cesgranrio", "FGV", "Legalle",
    "Fundação La Salle", "Instituto AOCP", "Objetiva"
  ];
  var DEFAULT_YEARS = [2023, 2020, 2022, 2018, 2025, 2021, 2017, 2024, 2019, 2026, 2016];

  function text(value) {
    return String(value == null ? "" : value).replace(/\u00a0/g, " ").trim();
  }

  function unique(values) {
    return (Array.isArray(values) ? values : []).filter(function (value, index, list) {
      return value !== "" && value != null && list.indexOf(value) === index;
    });
  }

  function normalizeMatter(item, group) {
    var source = item || {};
    var subjects = Array.isArray(source.subjects) ? source.subjects : [];
    var ids = unique((source.subjectIds || []).concat(subjects.map(function (subject) {
      return subject && subject.id != null ? String(subject.id) : "";
    })).map(String));
    var paths = unique((source.subjectPaths || []).concat(subjects.map(function (subject) {
      return subject && subject.path ? subject.path : "";
    })).map(text));
    return {
      code: text(source.code),
      title: text(source.title),
      group: text(source.group || group || "Sem grupo"),
      subjectIds: ids,
      subjectPaths: paths
    };
  }

  function normalizePlan(value) {
    var source = value || {};
    var matters = (Array.isArray(source.matters) ? source.matters : []).map(function (matter) {
      return normalizeMatter(matter, matter && matter.group);
    }).filter(function (matter) {
      return matter.code && matter.title;
    });
    return {
      version: 1,
      name: text(source.name || "Plano TecConcursos"),
      banks: unique((source.banks || DEFAULT_BANKS).map(text)),
      years: unique((source.years || DEFAULT_YEARS).map(function (year) { return Number(year); })).filter(function (year) {
        return Number.isFinite(year) && year >= 1900 && year <= 2100;
      }),
      removeCancelled: source.removeCancelled !== false,
      removeOutdated: source.removeOutdated !== false,
      matters: matters
    };
  }

  function parseConsolidatedMarkdown(markdown) {
    var currentGroup = "Sem grupo";
    var currentMatter = null;
    var matters = [];
    String(markdown || "").replace(/\r/g, "").split("\n").forEach(function (line) {
      var clean = text(line);
      var groupMatch = clean.match(/^(?:#{1,6}\s*)?(\d+\.\s+.+|Práticas complementares)$/i);
      if (groupMatch && !/^MAT-|^PRAT-/i.test(clean)) {
        currentGroup = clean.replace(/^#{1,6}\s*/, "");
        return;
      }
      var matterMatch = clean.match(/^(MAT-\d{3}|PRAT-\d{2})\s*[—–-]\s*(.+)$/i);
      if (matterMatch) {
        currentMatter = {
          code: matterMatch[1].toUpperCase(),
          title: text(matterMatch[2]),
          group: currentGroup,
          subjectIds: [],
          subjectPaths: []
        };
        matters.push(currentMatter);
        return;
      }
      var subjectMatch = clean.match(/^TecConcursos:\s*(\d+)\s*[—–-]\s*(.+)$/i);
      if (subjectMatch && currentMatter) {
        currentMatter.subjectIds.push(subjectMatch[1]);
        currentMatter.subjectPaths.push(text(subjectMatch[2]));
      }
    });
    return normalizePlan({ matters: matters });
  }

  function parsePlanText(value) {
    var raw = text(value);
    if (!raw) return normalizePlan({});
    if (/^[\[{]/.test(raw)) {
      try {
        return normalizePlan(JSON.parse(raw));
      } catch (error) {
        throw new Error("O JSON do plano não é válido: " + error.message);
      }
    }
    var plan = parseConsolidatedMarkdown(raw);
    if (!plan.matters.length) {
      throw new Error("Não encontrei códigos MAT-xxx ou PRAT-xx no arquivo do plano.");
    }
    return plan;
  }

  function displayName(matter) {
    var item = normalizeMatter(matter);
    return item.code + " — " + item.title;
  }

  function lastPathSegment(path) {
    var parts = text(path).split(">").map(text).filter(Boolean);
    return parts.length ? parts[parts.length - 1] : "";
  }

  return {
    DEFAULT_BANKS: DEFAULT_BANKS,
    DEFAULT_YEARS: DEFAULT_YEARS,
    normalizePlan: normalizePlan,
    parseConsolidatedMarkdown: parseConsolidatedMarkdown,
    parsePlanText: parsePlanText,
    normalizeMatter: normalizeMatter,
    displayName: displayName,
    lastPathSegment: lastPathSegment
  };
});

// ---- automation-lock.cjs ----
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) {
    root.TecConcursosModules = root.TecConcursosModules || {};
    root.TecConcursosModules.automationLock = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var LOCK_KEY = "tecconcursos_caderno_automation_lock_v1";
  var OWNER_SESSION_KEY = "tecconcursos_caderno_automation_owner_v1";
  var SYNC_CHANNEL_NAME = "tecconcursos_caderno_automation_sync_v1";
  var LOCK_LEASE_MS = 30000;
  var LOCK_HEARTBEAT_MS = 5000;

  function clean(value) {
    return String(value == null ? "" : value).replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  }

  function uniqueId(prefix) {
    var random = Math.random().toString(36).slice(2, 10);
    return String(prefix || "id") + "-" + Date.now().toString(36) + "-" + random;
  }

  function executionOwnerId(rootNode) {
    if (rootNode && rootNode.__tecConcursosAutomationOwnerId) return rootNode.__tecConcursosAutomationOwnerId;
    var session = null;
    try { session = rootNode && rootNode.sessionStorage; } catch (_) {}
    if (session && typeof session.getItem === "function") {
      try {
        var current = session.getItem(OWNER_SESSION_KEY);
        if (current) {
          if (rootNode) rootNode.__tecConcursosAutomationOwnerId = current;
          return current;
        }
        var created = uniqueId("tab");
        session.setItem(OWNER_SESSION_KEY, created);
        if (rootNode) rootNode.__tecConcursosAutomationOwnerId = created;
        return created;
      } catch (_) {}
    }
    var fallback = uniqueId("tab");
    if (rootNode) rootNode.__tecConcursosAutomationOwnerId = fallback;
    return fallback;
  }

  function claimKey(lock) {
    if (!lock || typeof lock !== "object") return "";
    if (lock.claimId) return String(lock.claimId);
    return String(lock.acquiredAt || 0) + "|" + String(lock.ownerId || "") + "|" + String(lock.runId || "");
  }

  function compareClaims(left, right) {
    var leftKey = claimKey(left);
    var rightKey = claimKey(right);
    if (leftKey === rightKey) return 0;
    return leftKey > rightKey ? 1 : -1;
  }

  function sameClaim(left, right) {
    return Boolean(left && right && left.ownerId === right.ownerId && left.runId === right.runId && claimKey(left) === claimKey(right));
  }

  function parseLock(value) {
    if (!value) return null;
    if (typeof value === "object") return value;
    try {
      var parsed = JSON.parse(String(value));
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch (_) {
      return null;
    }
  }

  function createLockManager(options) {
    var config = options || {};
    var rootNode = config.root;
    var storage = config.storage;
    var readState = typeof config.readState === "function" ? config.readState : function () { return null; };
    var ownerId = clean(config.ownerId || executionOwnerId(rootNode));
    var heartbeatTimer = null;
    var channel = null;
    var remoteConflict = null;
    var localClaim = null;

    function broadcast(message) {
      if (!channel || typeof channel.postMessage !== "function") return;
      try {
        channel.postMessage(Object.assign({ version: 1, source: ownerId, sentAt: Date.now() }, message || {}));
      } catch (_) {}
    }

    function readLock() {
      var lock = storage.read(LOCK_KEY, null);
      return lock && typeof lock === "object" ? lock : null;
    }

    function lockIsActive(lock, now) {
      return Boolean(lock && Number(lock.expiresAt) > (Number(now) || Date.now()));
    }

    function claimWasLost(lock) {
      return Boolean(lock && remoteConflict && lockIsActive(remoteConflict) && remoteConflict.ownerId !== ownerId && compareClaims(remoteConflict, lock) > 0);
    }

    function ownsLock(lock, state) {
      return Boolean(lock && state && lock.ownerId === ownerId && lock.runId === state.runId && lockIsActive(lock) && !claimWasLost(lock));
    }

    function effectiveLock(lock) {
      var current = lock || readLock();
      if (remoteConflict && lockIsActive(remoteConflict) && (!current || compareClaims(remoteConflict, current) >= 0 || current.ownerId === ownerId && claimWasLost(current))) return remoteConflict;
      return current;
    }

    function lockStatus(lock) {
      var current = effectiveLock(lock);
      if (!current || !lockIsActive(current)) return "";
      return "Outra aba está executando esta automação (aba " + String(current.ownerId || "desconhecida") + ").";
    }

    function lockError(lock) {
      var error = new Error(lockStatus(lock) || "A automação não possui uma aba proprietária ativa.");
      error.code = "AUTOMATION_LOCKED";
      error.lock = lock || null;
      return error;
    }

    function reconcileRemoteLock(remoteLock) {
      if (!remoteLock || remoteLock.ownerId === ownerId || !lockIsActive(remoteLock)) return;
      var current = readLock();
      var local = current && current.ownerId === ownerId ? current : localClaim;
      if (local && local.ownerId === ownerId && compareClaims(local, remoteLock) > 0) {
        remoteConflict = null;
        if (!sameClaim(current, local)) {
          storage.write(LOCK_KEY, local);
          broadcast({ type: "lock-reassert", lock: local });
        }
        return;
      }
      remoteConflict = remoteLock;
      stopHeartbeat();
    }

    function handleSyncMessage(event) {
      var message = event && event.data ? event.data : event;
      if (!message || message.source === ownerId) return;
      if (message.type === "lock-claim" || message.type === "lock-renew" || message.type === "lock-reassert") {
        reconcileRemoteLock(parseLock(message.lock));
      } else if (message.type === "lock-release" && remoteConflict && sameClaim(remoteConflict, parseLock(message.lock))) {
        remoteConflict = null;
      }
    }

    function handleStorageEvent(event) {
      if (!event || event.key !== LOCK_KEY) return;
      if (!event.newValue) {
        remoteConflict = null;
        return;
      }
      reconcileRemoteLock(parseLock(event.newValue));
    }

    function startSynchronization() {
      if (rootNode && typeof rootNode.addEventListener === "function") {
        try { rootNode.addEventListener("storage", handleStorageEvent); } catch (_) {}
      }
      var BroadcastChannelCtor = rootNode && rootNode.BroadcastChannel;
      if (typeof BroadcastChannelCtor !== "function") return;
      try {
        channel = new BroadcastChannelCtor(SYNC_CHANNEL_NAME);
        if (typeof channel.addEventListener === "function") channel.addEventListener("message", handleSyncMessage);
        else channel.onmessage = handleSyncMessage;
      } catch (_) {
        channel = null;
      }
    }

    function stopSynchronization() {
      if (rootNode && typeof rootNode.removeEventListener === "function") {
        try { rootNode.removeEventListener("storage", handleStorageEvent); } catch (_) {}
      }
      if (channel && typeof channel.close === "function") {
        try { channel.close(); } catch (_) {}
      }
      channel = null;
    }

    function stopHeartbeat() {
      if (heartbeatTimer != null) {
        var clear = rootNode && rootNode.clearInterval || (typeof clearInterval === "function" ? clearInterval : null);
        if (clear) clear(heartbeatTimer);
        heartbeatTimer = null;
      }
    }

    function renewLease(state) {
      if (!state || !state.runId) return true;
      var current = readLock();
      if (!ownsLock(current, state)) return false;
      var now = Date.now();
      var next = Object.assign({}, current, {
        ownerId: ownerId,
        runId: state.runId,
        heartbeatAt: now,
        expiresAt: now + LOCK_LEASE_MS,
        href: String(rootNode && rootNode.location && rootNode.location.href || "")
      });
      storage.write(LOCK_KEY, next);
      localClaim = next;
      broadcast({ type: "lock-renew", lock: next });
      var confirmed = readLock();
      if (!ownsLock(confirmed, state)) return false;
      state.lockOwnerId = ownerId;
      state.leaseExpiresAt = Number(confirmed.expiresAt) || next.expiresAt;
      return true;
    }

    function startHeartbeat(state) {
      if (heartbeatTimer != null) return;
      var set = rootNode && rootNode.setInterval || (typeof setInterval === "function" ? setInterval : null);
      if (!set) return;
      heartbeatTimer = set(function () {
        var current = readState();
        if (!current.running || !current.runId || current.runId !== state.runId || !renewLease(current)) stopHeartbeat();
      }, LOCK_HEARTBEAT_MS);
      if (heartbeatTimer && typeof heartbeatTimer.unref === "function") heartbeatTimer.unref();
    }

    function acquireLease(state, force) {
      if (!state || typeof state !== "object") throw new Error("Não há estado de automação para assumir.");
      if (!state.runId) state.runId = uniqueId("run");
      var current = readLock();
      if (!force && lockIsActive(current) && current.ownerId !== ownerId) return { acquired: false, lock: current };
      if (!force && remoteConflict && lockIsActive(remoteConflict) && remoteConflict.ownerId !== ownerId) return { acquired: false, lock: remoteConflict };
      var now = Date.now();
      var candidate = {
        version: 1,
        claimId: uniqueId("claim"),
        ownerId: ownerId,
        runId: state.runId,
        acquiredAt: current && current.ownerId === ownerId ? Number(current.acquiredAt) || now : now,
        heartbeatAt: now,
        expiresAt: now + LOCK_LEASE_MS,
        href: String(rootNode && rootNode.location && rootNode.location.href || "")
      };
      localClaim = candidate;
      remoteConflict = null;
      storage.write(LOCK_KEY, candidate);
      broadcast({ type: "lock-claim", lock: candidate });
      var confirmed = readLock();
      if (!confirmed || confirmed.ownerId !== ownerId || confirmed.runId !== state.runId || !lockIsActive(confirmed) || claimWasLost(candidate)) {
        return { acquired: false, lock: confirmed || current };
      }
      state.ownerId = ownerId;
      state.lockOwnerId = ownerId;
      state.leaseExpiresAt = Number(confirmed.expiresAt) || candidate.expiresAt;
      startHeartbeat(state);
      return { acquired: true, lock: confirmed };
    }

    function ensureLease(state) {
      if (!state || !state.runId) return true;
      if (renewLease(state)) return true;
      var acquired = acquireLease(state, false);
      if (acquired.acquired) return true;
      throw lockError(acquired.lock);
    }

    function releaseLease(state) {
      stopHeartbeat();
      var current = readLock();
      if (!state || !ownsLock(current, state)) return false;
      if (typeof storage.remove === "function") storage.remove(LOCK_KEY);
      else storage.write(LOCK_KEY, Object.assign({}, current, { expiresAt: 0, releasedAt: Date.now() }));
      broadcast({ type: "lock-release", lock: current });
      localClaim = null;
      remoteConflict = null;
      return true;
    }

    function lockInfo(state) {
      var lock = effectiveLock(readLock());
      return {
        key: LOCK_KEY,
        ownerId: ownerId,
        ownsLock: ownsLock(lock, state),
        active: lockIsActive(lock),
        lockedByOtherTab: Boolean(lockIsActive(lock) && lock.ownerId !== ownerId),
        runId: lock && lock.runId || null,
        lockOwnerId: lock && lock.ownerId || null,
        acquiredAt: lock && lock.acquiredAt || null,
        heartbeatAt: lock && lock.heartbeatAt || null,
        expiresAt: lock && lock.expiresAt || null,
        href: lock && lock.href || null
      };
    }

    startSynchronization();

    return {
      ownerId: ownerId,
      createRunId: function () { return uniqueId("run"); },
      readLock: readLock,
      ownsLock: ownsLock,
      lockStatus: lockStatus,
      lockError: lockError,
      acquireLease: acquireLease,
      ensureLease: ensureLease,
      releaseLease: releaseLease,
      lockInfo: lockInfo,
      stopHeartbeat: stopHeartbeat,
      destroy: function () { stopHeartbeat(); stopSynchronization(); }
    };
  }

  return {
    LOCK_KEY: LOCK_KEY,
    OWNER_SESSION_KEY: OWNER_SESSION_KEY,
    SYNC_CHANNEL_NAME: SYNC_CHANNEL_NAME,
    LOCK_LEASE_MS: LOCK_LEASE_MS,
    LOCK_HEARTBEAT_MS: LOCK_HEARTBEAT_MS,
    executionOwnerId: executionOwnerId,
    createLockManager: createLockManager
  };
});

// ---- automation-dom.cjs ----
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
        setTimeout(tick, 120);
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

// ---- library.cjs ----
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) {
    root.TecConcursosModules = root.TecConcursosModules || {};
    root.TecConcursosModules.library = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var LIBRARY_KEY = "tecconcursos_export_library_v1";

  function clean(value) {
    return String(value == null ? "" : value).replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  }

  function safeFilename(value) {
    return clean(value).replace(/[<>:"/\\|?*\x00-\x1F]/g, "-").replace(/\.+$/g, "").slice(0, 100) || "arquivo";
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (character) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character];
    });
  }

  function sanitizeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, "")
      .replace(/<\/?(?:iframe|object|embed)\b[^>]*>/gi, "")
      .replace(/\son\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
      .replace(/\s(?:href|src)\s*=\s*(["'])\s*javascript:[\s\S]*?\1/gi, "");
  }

  function parseHeader(value) {
    var header = clean(value);
    var pieces = header.split("/").map(clean).filter(Boolean);
    var first = pieces.shift() || "";
    var firstSplit = first.split(/\s+-\s+/);
    var bank = clean(firstSplit.shift());
    var vacancy = clean(firstSplit.join(" - "));
    var year = null;
    var firstYearMatch = vacancy.match(/\b(19|20)\d{2}\b/);
    if (firstYearMatch) {
      year = Number(firstYearMatch[0]);
      vacancy = clean(vacancy.replace(firstYearMatch[0], "").replace(/^\s*-\s*|\s*-\s*$/g, ""));
    }
    var last = pieces.length ? pieces[pieces.length - 1] : "";
    var yearMatch = last.match(/\b(19|20)\d{2}\b/);
    if (yearMatch && year == null) year = Number(yearMatch[0]);
    if (yearMatch) pieces[pieces.length - 1] = clean(last.replace(yearMatch[0], "").replace(/^\s*-\s*|\s*-\s*$/g, ""));
    pieces = pieces.filter(Boolean);
    return {
      raw: header,
      bank: bank,
      vacancy: vacancy,
      organization: pieces.shift() || "",
      role: pieces.join(" / "),
      year: year
    };
  }

  function optionData(node) {
    var raw = clean(node && (node.innerText || node.textContent));
    var match = raw.match(/^([a-e])\)\s*/i);
    return {
      letter: match ? match[1].toUpperCase() : "",
      text: raw.replace(/^([a-e])\)\s*/i, ""),
      html: sanitizeHtml(node && node.innerHTML)
    };
  }

  function parsePrintedQuestion(node, index) {
    var source = node || {};
    var link = source.querySelector ? source.querySelector("a[href*='/questoes/']") : null;
    var url = link ? String(link.href || link.getAttribute("href") || "") : "";
    var idMatch = url.match(/\/questoes\/(\d+)/);
    var info = source.querySelector ? source.querySelector(".cabecalho .informacoes") : null;
    var blocks = info ? Array.from(info.children || []) : [];
    var headerBlock = blocks.filter(function (block) {
      return !/(linkQuestao|classificacao)/.test(String(block.className || ""));
    })[0];
    var classification = source.querySelector ? source.querySelector(".classificacao") : null;
    var classificationText = clean(classification && (classification.innerText || classification.textContent));
    var classificationParts = classificationText.split(/\s+-\s+/);
    var answerNode = source.querySelector ? source.querySelector(".gabarito, .resposta-correta") : null;
    var metadata = parseHeader(headerBlock && (headerBlock.innerText || headerBlock.textContent));
    var statement = source.querySelector ? source.querySelector(".enunciado") : null;
    var numberNode = source.querySelector ? source.querySelector(".enunciado strong") : null;
    var numberMatch = clean(numberNode && (numberNode.innerText || numberNode.textContent)).match(/^(\d+)\)/);
    var alternatives = source.querySelectorAll ? Array.from(source.querySelectorAll(".alternativa")).map(optionData) : [];
    return {
      id: idMatch ? idMatch[1] : "print-" + String(index + 1),
      number: numberMatch ? Number(numberMatch[1]) : index + 1,
      url: url,
      header: metadata.raw,
      bank: metadata.bank,
      year: metadata.year,
      vacancy: metadata.vacancy,
      organization: metadata.organization,
      role: metadata.role,
      subject: clean(classificationParts.shift()),
      topic: clean(classificationParts.join(" - ")),
      statement: clean(statement && (statement.innerText || statement.textContent)),
      statementHtml: sanitizeHtml(statement && statement.innerHTML),
      options: alternatives,
      answer: clean(answerNode && (answerNode.innerText || answerNode.textContent))
    };
  }

  function extractPrintedQuestions(documentNode) {
    if (!documentNode || typeof documentNode.querySelectorAll !== "function") return [];
    return Array.from(documentNode.querySelectorAll(".questao")).map(parsePrintedQuestion);
  }

  function cadernoIdFromLocation(locationLike) {
    var source = typeof locationLike === "string" ? locationLike : locationLike && locationLike.href;
    var match = String(source || "").match(/\/cadernos\/(\d+)/i);
    return match ? match[1] : "";
  }

  function emptyLibrary() {
    return { version: 1, entries: {} };
  }

  function normalizeLibrary(value) {
    var library = value && typeof value === "object" && !Array.isArray(value) ? value : emptyLibrary();
    if (!library.entries || typeof library.entries !== "object") library.entries = {};
    return library;
  }

  function questionKey(question) {
    return String(question && (question.id || question.url || question.number) || "");
  }

  function createLibrary(storage) {
    function read() {
      return normalizeLibrary(storage.read(LIBRARY_KEY, emptyLibrary()));
    }
    function write(library) {
      storage.write(LIBRARY_KEY, library);
    }
    function list() {
      return Object.keys(read().entries).map(function (key) {
        var entry = read().entries[key];
        return Object.assign({}, entry, { questions: undefined });
      }).sort(function (left, right) {
        return String(left.group || "").localeCompare(String(right.group || ""), "pt-BR") || String(left.title || "").localeCompare(String(right.title || ""), "pt-BR");
      });
    }
    function get(id) {
      return read().entries[String(id)] || null;
    }
    function appendPart(info, questions) {
      var library = read();
      var key = String(info.libraryId || info.cadernoId || info.code || "");
      if (!key) throw new Error("Não foi possível identificar o caderno para a biblioteca.");
      var old = library.entries[key] || { id: key, questions: [], parts: [] };
      var existing = {};
      (old.questions || []).forEach(function (question) { existing[questionKey(question)] = true; });
      var added = (Array.isArray(questions) ? questions : []).filter(function (question) {
        var qKey = questionKey(question);
        if (!qKey || existing[qKey]) return false;
        existing[qKey] = true;
        return true;
      });
      var previousPart = (old.parts || []).find(function (part) { return part.start === info.start; });
      var parts = (old.parts || []).filter(function (part) { return part.start !== info.start; });
      parts.push({
        start: Number(info.start) || 1,
        count: added.length || Number(previousPart && previousPart.count) || 0,
        savedAt: new Date().toISOString()
      });
      library.entries[key] = Object.assign({}, old, info, {
        id: key,
        questions: (old.questions || []).concat(added),
        parts: parts.sort(function (left, right) { return left.start - right.start; }),
        updatedAt: new Date().toISOString()
      });
      write(library);
      return library.entries[key];
    }
    function remove(id) {
      var library = read();
      delete library.entries[String(id)];
      write(library);
    }
    function clear() { write(emptyLibrary()); }
    return { list: list, get: get, appendPart: appendPart, remove: remove, clear: clear };
  }

  function csvValue(value) {
    return '"' + String(value == null ? "" : value).replace(/"/g, '""') + '"';
  }

  function buildCsv(entry) {
    var columns = ["Número", "Caderno", "Código", "Banca", "Ano", "Vaga", "Órgão", "Cargo", "Matéria", "Assunto", "Questão ID", "URL", "Enunciado", "Alternativa A", "Alternativa B", "Alternativa C", "Alternativa D", "Alternativa E", "Gabarito"];
    var lines = [columns.map(csvValue).join(";")];
    (entry.questions || []).forEach(function (question, index) {
      var alternatives = {};
      (question.options || []).forEach(function (option) { alternatives[option.letter] = option.text; });
      lines.push([
        question.number || index + 1, entry.title, entry.code, question.bank, question.year,
        question.vacancy, question.organization, question.role, question.subject, question.topic,
        question.id, question.url, question.statement, alternatives.A, alternatives.B,
        alternatives.C, alternatives.D, alternatives.E, question.answer
      ].map(csvValue).join(";"));
    });
    return "\uFEFF" + lines.join("\r\n");
  }

  function xmlEscape(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (character) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[character];
    });
  }

  function columnName(index) {
    var value = index + 1;
    var output = "";
    while (value > 0) {
      var remainder = (value - 1) % 26;
      output = String.fromCharCode(65 + remainder) + output;
      value = Math.floor((value - 1) / 26);
    }
    return output;
  }

  function excelRows(entry) {
    var headers = ["Número", "Caderno", "Código", "Banca", "Ano", "Vaga", "Órgão", "Cargo", "Matéria", "Assunto", "Questão ID", "URL", "Enunciado", "Alternativa A", "Alternativa B", "Alternativa C", "Alternativa D", "Alternativa E", "Gabarito"];
    var rows = [headers];
    (entry.questions || []).forEach(function (question, index) {
      var alternatives = {};
      (question.options || []).forEach(function (option) { alternatives[option.letter] = option.text; });
      rows.push([question.number || index + 1, entry.title, entry.code, question.bank, question.year, question.vacancy, question.organization, question.role, question.subject, question.topic, question.id, question.url, question.statement, alternatives.A, alternatives.B, alternatives.C, alternatives.D, alternatives.E, question.answer]);
    });
    return rows;
  }

  function crc32(bytes) {
    var table = crc32.table || (crc32.table = Array.from({ length: 256 }, function (_, index) {
      var value = index;
      for (var bit = 0; bit < 8; bit += 1) value = (value & 1) ? (0xEDB88320 ^ (value >>> 1)) : (value >>> 1);
      return value >>> 0;
    }));
    var crc = 0 ^ -1;
    for (var i = 0; i < bytes.length; i += 1) crc = (crc >>> 8) ^ table[(crc ^ bytes[i]) & 0xFF];
    return (crc ^ -1) >>> 0;
  }

  function u16(value) { return [value & 255, (value >>> 8) & 255]; }
  function u32(value) { return [value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255]; }

  function zipStore(files) {
    var encoder = new TextEncoder();
    var chunks = [];
    var directory = [];
    var offset = 0;
    files.forEach(function (file) {
      var name = encoder.encode(file.name);
      var content = encoder.encode(file.content);
      var crc = crc32(content);
      var local = [0x50, 0x4B, 0x03, 0x04].concat(u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(content.length), u32(content.length), u16(name.length), u16(0), Array.from(name), Array.from(content));
      chunks.push(local);
      directory.push([0x50, 0x4B, 0x01, 0x02].concat(u16(20), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(content.length), u32(content.length), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), Array.from(name)));
      offset += local.length;
    });
    var directorySize = directory.reduce(function (total, entry) { return total + entry.length; }, 0);
    var output = chunks.concat(directory);
    output.push([0x50, 0x4B, 0x05, 0x06].concat(u16(0), u16(0), u16(files.length), u16(files.length), u32(directorySize), u32(offset), u16(0)));
    return new Uint8Array(output.flat());
  }

  function buildXlsxBlob(entry) {
    var rows = excelRows(entry);
    var worksheet = rows.map(function (row, rowIndex) {
      var cells = row.map(function (value, columnIndex) {
        var reference = columnName(columnIndex) + String(rowIndex + 1);
        return '<c r="' + reference + '" t="inlineStr"><is><t xml:space="preserve">' + xmlEscape(value) + "</t></is></c>";
      }).join("");
      return '<row r="' + String(rowIndex + 1) + '">' + cells + "</row>";
    }).join("");
    var lastCell = columnName(rows[0].length - 1) + String(rows.length);
    var files = [
      { name: "[Content_Types].xml", content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>' },
      { name: "_rels/.rels", content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
      { name: "xl/workbook.xml", content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Questões" sheetId="1" r:id="rId1"/></sheets></workbook>' },
      { name: "xl/_rels/workbook.xml.rels", content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>' },
      { name: "xl/worksheets/sheet1.xml", content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetData>' + worksheet + '</sheetData><autoFilter ref="A1:' + lastCell + '"/></worksheet>' }
    ];
    return new Blob([zipStore(files)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  }

  function outputBaseName(entry) {
    return safeFilename((entry.group || "Sem grupo") + " - " + (entry.title || entry.code || "Caderno"));
  }

  function downloadBlob(documentNode, filename, blob) {
    var url = URL.createObjectURL(blob);
    var anchor = documentNode.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    documentNode.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
  }

  function jsJson(value) {
    return JSON.stringify(value).replace(/<\/script/gi, "<\\/script");
  }

  function buildInteractiveHtml(entry) {
    var data = Object.assign({}, entry, { questions: entry.questions || [] });
    var initial = { attempts: [{ id: "tentativa-1", createdAt: new Date().toISOString(), answers: {}, eliminated: {} }], activeAttempt: 0 };
    var fileName = safeFilename((entry.title || entry.code || "caderno") + "-interativo.html");
    var runtime = String.raw`(function () {
  "use strict";
  var data = JSON.parse(document.getElementById("tec-caderno-data").textContent);
  var fallback = JSON.parse(document.getElementById("tec-caderno-state").textContent);
  var key = "tecconcursos-html-v1:" + data.id;
  var state = fallback;
  var index = 0;
  var downloadName = ${jsJson(fileName)};
  function read() { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch (_) { return fallback; } }
  function write() {
    document.getElementById("tec-caderno-state").textContent = JSON.stringify(state);
    try { localStorage.setItem(key, JSON.stringify(state)); document.getElementById("status").textContent = "Histórico salvo localmente"; }
    catch (_) { document.getElementById("status").textContent = "Histórico apenas nesta sessão; baixe o HTML para preservar"; }
  }
  function currentAttempt() { return state.attempts[state.activeAttempt] || state.attempts[0]; }
  function escapeValue(value) { return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]; }); }
  function visibleQuestions() {
    return data.questions.filter(function (question) {
      return (!document.getElementById("bank").value || question.bank === document.getElementById("bank").value) && (!document.getElementById("year").value || String(question.year || "") === document.getElementById("year").value) && (!document.getElementById("vacancy").value || question.vacancy === document.getElementById("vacancy").value);
    });
  }
  function render() {
    var visible = visibleQuestions();
    var question = visible[index];
    document.getElementById("title").textContent = data.title || data.code || "Caderno";
    document.getElementById("summary").textContent = (data.group || "Sem grupo") + " · " + visible.length + " questão(ões) filtrada(s) de " + data.questions.length;
    if (!question) { document.getElementById("question").innerHTML = '<div class="empty">Nenhuma questão para esse filtro.</div>'; return; }
    var attempt = currentAttempt();
    var meta = [question.bank, question.year, question.organization, question.role, question.vacancy, question.subject, question.topic].filter(Boolean).map(function (value) { return '<span class="tag">' + escapeValue(value) + "</span>"; }).join("");
    var body = question.statementHtml || ("<p>" + escapeValue(question.statement) + "</p>");
    var alternatives = (question.options || []).map(function (option) {
      var selected = attempt.answers[question.id] === option.letter;
      var eliminated = !!(attempt.eliminated[question.id] || {})[option.letter];
      return '<button class="option ' + (selected ? "selected " : "") + (eliminated ? "eliminated " : "") + '" data-letter="' + escapeValue(option.letter) + '">' + (option.html || ("<strong>" + escapeValue(option.letter) + ")</strong> " + escapeValue(option.text))) + "</button>";
    }).join("");
    document.getElementById("question").innerHTML = '<div class="meta">' + meta + '</div><div class="statement">' + body + "</div><div>" + alternatives + '</div><div class="hint">Clique para marcar uma resposta. Dê duplo clique para eliminar ou restaurar uma alternativa.</div>';
    document.getElementById("status").textContent = "Questão " + (index + 1) + " de " + visible.length;
    Array.from(document.querySelectorAll(".option")).forEach(function (button) {
      var clickTimer = null;
      button.addEventListener("click", function () {
        if (clickTimer) clearTimeout(clickTimer);
        clickTimer = setTimeout(function () { attempt.answers[question.id] = button.dataset.letter; write(); render(); }, 220);
      });
      button.addEventListener("dblclick", function (event) { event.preventDefault(); if (clickTimer) clearTimeout(clickTimer); attempt.eliminated[question.id] = attempt.eliminated[question.id] || {}; if (attempt.eliminated[question.id][button.dataset.letter]) delete attempt.eliminated[question.id][button.dataset.letter]; else attempt.eliminated[question.id][button.dataset.letter] = true; write(); render(); });
    });
  }
  function resetIndex() { index = 0; render(); }
  function fillFilters() {
    Array.from(new Set(data.questions.map(function (question) { return question.bank; }).filter(Boolean))).sort().forEach(function (value) { document.getElementById("bank").insertAdjacentHTML("beforeend", "<option>" + escapeValue(value) + "</option>"); });
    Array.from(new Set(data.questions.map(function (question) { return question.year; }).filter(Boolean))).sort(function (left, right) { return right - left; }).forEach(function (value) { document.getElementById("year").insertAdjacentHTML("beforeend", "<option>" + escapeValue(value) + "</option>"); });
    Array.from(new Set(data.questions.map(function (question) { return question.vacancy; }).filter(Boolean))).sort().forEach(function (value) { document.getElementById("vacancy").insertAdjacentHTML("beforeend", "<option>" + escapeValue(value) + "</option>"); });
  }
  function ensureVacancyControl() {
    var existing = document.getElementById("vacancy");
    if (existing) return existing;
    var year = document.getElementById("year");
    var controls = year && year.parentElement && year.parentElement.parentElement;
    if (!controls) return null;
    var label = document.createElement("label");
    label.textContent = "Vaga ";
    var select = document.createElement("select");
    select.id = "vacancy";
    select.innerHTML = '<option value="">Todas</option>';
    label.appendChild(select);
    controls.appendChild(label);
    return select;
  }
  state = read();
  ensureVacancyControl();
  document.getElementById("prev").onclick = function () { index = Math.max(0, index - 1); render(); };
  document.getElementById("next").onclick = function () { index = Math.min(visibleQuestions().length - 1, index + 1); render(); };
  document.getElementById("go").onclick = function () { var number = Number(document.getElementById("jump").value); if (number > 0) { index = Math.min(visibleQuestions().length - 1, number - 1); render(); } };
  document.getElementById("bank").onchange = resetIndex;
  document.getElementById("year").onchange = resetIndex;
  document.getElementById("vacancy").onchange = resetIndex;
  document.getElementById("newAttempt").onclick = function () { state.attempts.push({ id: "tentativa-" + (state.attempts.length + 1), createdAt: new Date().toISOString(), answers: {}, eliminated: {} }); state.activeAttempt = state.attempts.length - 1; write(); render(); };
  document.getElementById("saveHtml").onclick = function () { write(); var blob = new Blob([document.documentElement.outerHTML], { type: "text/html;charset=utf-8" }); var url = URL.createObjectURL(blob); var anchor = document.createElement("a"); anchor.href = url; anchor.download = downloadName; anchor.click(); setTimeout(function () { URL.revokeObjectURL(url); }, 60000); };
  fillFilters();
  render();
})();`;
    return [
      "<!doctype html><html lang=\"pt-BR\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>", escapeHtml(entry.title || "Caderno"),
      "</title><style>body{margin:0;background:#f3f4f6;color:#182230;font:16px system-ui,-apple-system,Segoe UI,sans-serif}.top{position:sticky;top:0;z-index:2;background:#102a43;color:#fff;padding:14px 20px;box-shadow:0 2px 8px #0003}.top h1{font-size:18px;margin:0 0 7px}.controls{display:flex;flex-wrap:wrap;gap:8px;align-items:center}.controls button,.controls input,.controls select{border:1px solid #aab8c8;border-radius:7px;padding:7px 9px;font:inherit}.controls button{background:#fff;color:#102a43;cursor:pointer;font-weight:700}.summary{font-size:13px;opacity:.9}.main{max-width:900px;margin:24px auto;padding:0 16px}.card{background:#fff;border-radius:12px;box-shadow:0 3px 14px #0b1f3317;padding:22px}.meta{display:flex;gap:6px;flex-wrap:wrap;color:#52606d;font-size:14px;margin-bottom:14px}.tag{background:#e6f6ff;color:#075985;padding:4px 7px;border-radius:999px}.statement{line-height:1.6}.option{display:block;width:100%;text-align:left;margin:10px 0;padding:12px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;cursor:pointer;font:inherit}.option:hover{border-color:#2563eb}.option.selected{border:2px solid #2563eb;background:#eff6ff}.option.eliminated{text-decoration:line-through;opacity:.45;background:#f8fafc}.hint{margin-top:12px;color:#64748b;font-size:13px}.status{margin-left:auto;font-size:13px}.empty{padding:30px;text-align:center;color:#64748b}</style></head><body><header class=\"top\"><h1 id=\"title\"></h1><div class=\"controls\"><button id=\"prev\">← Anterior</button><button id=\"next\">Próxima →</button><label>Ir para <input id=\"jump\" type=\"number\" min=\"1\" style=\"width:78px\"></label><button id=\"go\">Ir</button><label>Banca <select id=\"bank\"><option value=\"\">Todas</option></select></label><label>Ano <select id=\"year\"><option value=\"\">Todos</option></select></label><button id=\"newAttempt\">Nova tentativa</button><button id=\"saveHtml\">Baixar HTML com histórico</button><span class=\"status\" id=\"status\"></span></div><div class=\"summary\" id=\"summary\"></div></header><main class=\"main\"><article class=\"card\" id=\"question\"></article></main><script id=\"tec-caderno-data\" type=\"application/json\">", jsJson(data), "</script><script id=\"tec-caderno-state\" type=\"application/json\">", jsJson(initial), "</script><script>", runtime, "</script></body></html>"
    ].join("");
  }

  return {
    LIBRARY_KEY: LIBRARY_KEY,
    safeFilename: safeFilename,
    parseHeader: parseHeader,
    parsePrintedQuestion: parsePrintedQuestion,
    extractPrintedQuestions: extractPrintedQuestions,
    cadernoIdFromLocation: cadernoIdFromLocation,
    createLibrary: createLibrary,
    buildCsv: buildCsv,
    buildXlsxBlob: buildXlsxBlob,
    buildInteractiveHtml: buildInteractiveHtml,
    outputBaseName: outputBaseName,
    downloadBlob: downloadBlob
  };
});

// ---- automation-state.cjs ----
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) {
    root.TecConcursosModules = root.TecConcursosModules || {};
    root.TecConcursosModules.automationState = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var STATE_KEY = "tecconcursos_caderno_automation_v1";
  var PLAN_KEY = "tecconcursos_caderno_plan_v1";
  var FOLDER_KEY = "tecconcursos_default_folder_id_v1";
  var MAX_PER_PRINT = 200;
  var STALE_AFTER_MS = 90000;
  var OUTPUT_WAIT_TIMEOUT_MS = 60000;

  function defaultState() {
    return { version: 1, running: false, creation: null, export: null };
  }

  function normalizeState(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : defaultState();
  }

  function markProgress(state, patch) {
    var previous = state.progress && typeof state.progress === "object" ? state.progress : {};
    var next = Object.assign({}, previous, patch || {});
    next.updatedAt = new Date().toISOString();
    var history = Array.isArray(previous.history) ? previous.history.slice(-19) : [];
    history.push({ at: next.updatedAt, phase: String(next.phase || ""), message: String(next.message || "") });
    next.history = history;
    state.progress = next;
    return next;
  }

  function appendEvent(state, eventName, details, url, compact) {
    var progress = state.progress && typeof state.progress === "object" ? state.progress : {};
    var events = Array.isArray(progress.events) ? progress.events.slice(-299) : [];
    events.push({
      at: new Date().toISOString(),
      event: String(eventName || "event"),
      phase: String(progress.phase || ""),
      url: String(url || ""),
      details: typeof compact === "function" ? compact(details) : details
    });
    progress.events = events;
    state.progress = progress;
    return state;
  }

  return {
    STATE_KEY: STATE_KEY,
    PLAN_KEY: PLAN_KEY,
    FOLDER_KEY: FOLDER_KEY,
    MAX_PER_PRINT: MAX_PER_PRINT,
    STALE_AFTER_MS: STALE_AFTER_MS,
    OUTPUT_WAIT_TIMEOUT_MS: OUTPUT_WAIT_TIMEOUT_MS,
    defaultState: defaultState,
    normalizeState: normalizeState,
    markProgress: markProgress,
    appendEvent: appendEvent
  };
});

// ---- automation-filters.cjs ----
(function (root, factory) {
  var api = factory(
    typeof module !== "undefined" && module.exports ? {
      dom: require("./automation-dom.cjs"),
      plan: require("./plan.cjs")
    } : (function (modules) {
      return { dom: modules.automationDom, plan: modules.plan };
    })(root.TecConcursosModules)
  );
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) {
    root.TecConcursosModules = root.TecConcursosModules || {};
    root.TecConcursosModules.automationFilters = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (deps) {
  "use strict";

  var clean = deps.dom.clean;
  var isVisible = deps.dom.isVisible;
  var waitFor = deps.dom.waitFor;
  var setInputValue = deps.dom.setInputValue;
  var clickElement = deps.dom.clickElement;
  var clickText = deps.dom.clickText;
  var invokeAngularTreeItem = deps.dom.invokeAngularTreeItem;

  function currentPath(rootNode) {
    return String(rootNode.location && rootNode.location.pathname || "");
  }

  function isFilterPage(rootNode) { return /\/questoes\/filtrar/i.test(currentPath(rootNode)); }
  function isPrintPage(rootNode) { return /\/questoes\/cadernos\/\d+\/imprimir/i.test(currentPath(rootNode)); }
  function isCadernoPage(rootNode) { return /\/questoes\/cadernos\/\d+/i.test(currentPath(rootNode)) && !isPrintPage(rootNode); }

  function folderIdFromLocation(rootNode) {
    try { return new URL(rootNode.location.href).searchParams.get("idPasta") || ""; } catch (_) { return ""; }
  }

  function filterUrl(rootNode, folderId) {
    var origin = rootNode.location && rootNode.location.origin || "https://www.tecconcursos.com.br";
    return origin + "/questoes/filtrar?idPasta=" + encodeURIComponent(folderId || folderIdFromLocation(rootNode));
  }

  function cadernoUrl(rootNode, id) {
    var origin = rootNode.location && rootNode.location.origin || "https://www.tecconcursos.com.br";
    return origin + "/questoes/cadernos/" + encodeURIComponent(id);
  }

  function filterHeadingLabel(heading) {
    return {
      "Matéria e assunto": "Matérias e assuntos",
      "Banca": "Bancas",
      "Órgão e cargo": "Órgãos e cargos",
      "Ano": "Anos"
    }[heading] || heading;
  }

  function searchBoxMatchesHeading(box, heading) {
    var expectedHeading = filterHeadingLabel(heading);
    var declaredTitle = clean(box && box.getAttribute && box.getAttribute("titulo"));
    if (declaredTitle === expectedHeading) return true;
    var visibleTitle = clean((box && (box.querySelector(".gerador-buscador-cabecalho") || box).innerText) || "");
    return visibleTitle.indexOf(expectedHeading) === 0;
  }

  function treeItemMatches(node, expected) {
    var normalizedExpected = clean(expected).toLocaleLowerCase("pt-BR");
    var title = clean(node && node.getAttribute && node.getAttribute("title"));
    var text = clean(node && (node.innerText || node.textContent));
    return [title, text].some(function (candidate) {
      return candidate.toLocaleLowerCase("pt-BR") === normalizedExpected;
    });
  }

  function hasSelectedTreeItem(box, expected) {
    return Array.from(box.querySelectorAll(".arvore-item")).filter(isVisible).some(function (node) {
      return node.classList.contains("arvore-item-selecionado") && treeItemMatches(node, expected);
    });
  }

  function treeItemClickTarget(item) {
    // O texto da árvore é apenas um rótulo. No TecConcursos, o ng-click fica
    // no contêiner pai; clicar diretamente no span pode não disparar a seleção.
    return item.querySelector(".arvore-item-conteudo") || item.querySelector(".arvore-item-nome") || item;
  }

  function activeFilterCount(documentNode) {
    var panel = Array.from(documentNode.querySelectorAll(".gerador-filtrador")).filter(isVisible).find(function (node) {
      return /Filtros ativos:/i.test(node.innerText || node.textContent || "");
    });
    var text = clean(panel && (panel.innerText || panel.textContent));
    var match = text.match(/Filtros ativos:\s*(\d+)/i);
    return match ? Number(match[1]) : 0;
  }

  async function clearActiveFilters(documentNode) {
    if (!activeFilterCount(documentNode)) return;
    var clear = Array.from(documentNode.querySelectorAll(".gerador-filtrador-cabecalho-limpar")).filter(isVisible).find(function (node) {
      return /Limpar/i.test(node.innerText || node.textContent || "");
    });
    if (!clear) throw new Error("Há filtros ativos, mas não encontrei o controle para limpá-los.");
    clickElement(documentNode, clear);
    await waitFor(documentNode, function () { return activeFilterCount(documentNode) === 0; }, 5000, "O TecConcursos não confirmou a limpeza dos filtros.");
  }

  function visibleSearchBox(documentNode, heading) {
    return Array.from(documentNode.querySelectorAll(".gerador-buscador")).filter(isVisible).find(function (box) {
      return searchBoxMatchesHeading(box, heading);
    }) || null;
  }

  function searchCandidates(heading, value) {
    if (heading !== "Banca") return [value];
    var aliases = {
      "FCC": ["FCC", "Fundação Carlos Chagas"],
      "Fundação La Salle": ["Fundação La Salle", "La Salle"],
      "Instituto AOCP": ["Instituto AOCP", "AOCP"],
      "Fundatec": ["Fundatec", "FUNDATEC"],
      "Vunesp": ["Vunesp", "VUNESP"],
      "Cesgranrio": ["Cesgranrio", "CESGRANRIO"],
      "FGV": ["FGV", "Fundação Getulio Vargas"],
      "Legalle": ["Legalle", "Legalle Concursos"],
      "Objetiva": ["Objetiva", "OBJETIVA CONCURSOS", "Objetiva Concursos"]
    };
    return aliases[value] || [value];
  }

  async function selectTreeValue(documentNode, heading, value) {
    if (!clickText(documentNode, ".menu-alternador-opcao", heading)) {
      throw new Error("Não encontrei a aba de filtro '" + heading + "'.");
    }
    var box = await waitFor(documentNode, function () { return visibleSearchBox(documentNode, heading); }, 10000, "A aba '" + heading + "' não abriu o painel de busca.");

    if (heading === "Ano") {
      var yearExpected = clean(value).toLocaleLowerCase("pt-BR");
      var yearItem = await waitFor(documentNode, function () {
        var currentBox = visibleSearchBox(documentNode, heading) || box;
        return Array.from(currentBox.querySelectorAll(".arvore-item")).filter(isVisible).find(function (node) {
          return treeItemMatches(node, yearExpected);
        }) || null;
      }, 10000, "O ano '" + value + "' não apareceu na lista de anos.");
      var yearTarget = treeItemClickTarget(yearItem);
      if (!clickElement(documentNode, yearTarget)) throw new Error("Encontrei o ano '" + value + ", mas não consegui acionar o item.");
      await waitFor(documentNode, function () {
        var currentBox = visibleSearchBox(documentNode, heading);
        return currentBox && hasSelectedTreeItem(currentBox, yearExpected);
      }, 5000, "O TecConcursos não confirmou a seleção do ano '" + value + "'.");
      return;
    }

    var searchLink = Array.from(box.querySelectorAll("a")).find(function (node) {
      return clean(node.innerText || node.textContent) === "Pesquisar por nome";
    });
    if (searchLink) clickElement(documentNode, searchLink);
    var search = await waitFor(documentNode, function () {
      return box.querySelector("input[ng-model='vm.textoBusca']") || box.querySelector("input[placeholder*='três caracteres']");
    }, 5000, "O campo de busca da aba '" + heading + "' não apareceu.");
    var candidates = searchCandidates(heading, value);
    var item = null;
    for (var index = 0; index < candidates.length && !item; index += 1) {
      setInputValue(search, candidates[index]);
      var expected = clean(candidates[index]).toLocaleLowerCase("pt-BR");
      try {
        item = await waitFor(documentNode, function () {
          var currentBox = visibleSearchBox(documentNode, heading) || box;
          return Array.from(currentBox.querySelectorAll(".arvore-item")).filter(isVisible).find(function (node) {
            return treeItemMatches(node, expected);
          }) || null;
        }, 5000, "O resultado '" + value + "' não apareceu na aba '" + heading + "' após a busca.");
      } catch (_) {
        item = null;
      }
    }
    if (!item) throw new Error("Não encontrei '" + value + "' no filtro " + heading + ".");
    var clickable = treeItemClickTarget(item);
    if (!clickElement(documentNode, clickable)) throw new Error("Encontrei '" + value + ", mas não consegui acionar o contêiner de seleção.");
    try {
      await waitFor(documentNode, function () {
        var currentBox = visibleSearchBox(documentNode, heading);
        return currentBox && hasSelectedTreeItem(currentBox, expected);
      }, 1500, "O TecConcursos não confirmou a seleção de '" + value + "'.");
      return;
    } catch (_) {
      if (!invokeAngularTreeItem(documentNode, item)) {
        throw new Error("O resultado '" + value + "' foi encontrado, mas o TecConcursos ignorou o clique de seleção.");
      }
    }
    await waitFor(documentNode, function () {
      var currentBox = visibleSearchBox(documentNode, heading);
      return currentBox && hasSelectedTreeItem(currentBox, expected);
    }, 5000, "O TecConcursos ignorou a seleção de '" + value + "'.");
  }

  async function applyMatterFilters(documentNode, plan, matter, onProgress) {
    var paths = deps.plan.normalizeMatter(matter).subjectPaths;
    if (!paths.length) throw new Error(matter.code + " não possui caminho de matéria/assunto para selecionar.");
    for (var index = 0; index < paths.length; index += 1) {
      var leaf = deps.plan.lastPathSegment(paths[index]);
      if (!leaf) continue;
      if (onProgress) onProgress("Selecionando assunto: " + leaf);
      await selectTreeValue(documentNode, "Matéria e assunto", leaf);
    }
    for (var bankIndex = 0; bankIndex < plan.banks.length; bankIndex += 1) {
      if (onProgress) onProgress("Selecionando banca: " + plan.banks[bankIndex]);
      await selectTreeValue(documentNode, "Banca", plan.banks[bankIndex]);
    }
    for (var yearIndex = 0; yearIndex < plan.years.length; yearIndex += 1) {
      if (onProgress) onProgress("Selecionando ano: " + String(plan.years[yearIndex]));
      await selectTreeValue(documentNode, "Ano", String(plan.years[yearIndex]));
    }
    if (onProgress) onProgress("Aplicando remoção de questões anuladas e desatualizadas.");
    if (plan.removeCancelled) clickText(documentNode, "[role='button'].link-atalho", "Remover anuladas");
    if (plan.removeOutdated) clickText(documentNode, "[role='button'].link-atalho", "Remover desatualizadas");
  }

  return {
    currentPath: currentPath,
    isFilterPage: isFilterPage,
    isPrintPage: isPrintPage,
    isCadernoPage: isCadernoPage,
    folderIdFromLocation: folderIdFromLocation,
    filterUrl: filterUrl,
    cadernoUrl: cadernoUrl,
    filterHeadingLabel: filterHeadingLabel,
    searchBoxMatchesHeading: searchBoxMatchesHeading,
    treeItemMatches: treeItemMatches,
    hasSelectedTreeItem: hasSelectedTreeItem,
    treeItemClickTarget: treeItemClickTarget,
    activeFilterCount: activeFilterCount,
    clearActiveFilters: clearActiveFilters,
    searchCandidates: searchCandidates,
    selectTreeValue: selectTreeValue,
    applyMatterFilters: applyMatterFilters
  };
});

// ---- automation-print.cjs ----
(function (root, factory) {
  var api = factory(
    typeof module !== "undefined" && module.exports ? { dom: require("./automation-dom.cjs") } : { dom: root.TecConcursosModules.automationDom }
  );
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) {
    root.TecConcursosModules = root.TecConcursosModules || {};
    root.TecConcursosModules.automationPrint = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (deps) {
  "use strict";

  var clean = deps.dom.clean;
  var sameText = deps.dom.sameText;
  var isVisible = deps.dom.isVisible;
  var waitFor = deps.dom.waitFor;
  var setInputValue = deps.dom.setInputValue;
  var clickElement = deps.dom.clickElement;

  function splitRanges(total, maxPerPrint) {
    var count = Math.max(0, Math.floor(Number(total) || 0));
    var size = Math.max(1, Math.floor(Number(maxPerPrint) || 200));
    var ranges = [];
    for (var start = 1; start <= count; start += size) {
      ranges.push({ start: start, count: Math.min(size, count - start + 1) });
    }
    return ranges;
  }

  function clickPrintTab(documentNode) {
    var target = Array.from(documentNode.querySelectorAll("div[role='button']")).filter(isVisible).find(function (node) {
      return sameText(node.innerText || node.textContent, "Imprimir") && /onSelecionarAba|mostrarAlertaExclusivoParaAssinantes/.test(node.getAttribute("ng-click") || "");
    });
    if (target) clickElement(documentNode, target);
    return Boolean(target);
  }

  function preparePrintForm(documentNode) {
    if (!documentNode || typeof documentNode.querySelector !== "function") return false;
    var form = documentNode.querySelector("#configurar-impressao form, form[action*='/questoes/cadernos/'][action*='/imprimir']");
    if (!form) return false;
    // O fluxo usa a aba atual para que o próximo estado seja retomado sem popup.
    form.setAttribute("target", "_self");
    return true;
  }

  function createPrintWorkflow(context) {
    var rootNode = context.root;
    var documentNode = context.document;
    var maxPerPrint = context.maxPerPrint || 200;

    async function submitCurrentRange(state) {
      var job = state.export.job;
      if (!clickPrintTab(documentNode)) throw new Error("Não encontrei a aba Imprimir do caderno.");
      var initialInput = await waitFor(documentNode, function () { return documentNode.querySelector("#questaoInicialInput"); }, 10000, "A tela de impressão não exibiu o campo de questão inicial.");
      var total = Number(initialInput.getAttribute("max") || initialInput.max || 0);
      if (!job.ranges.length) {
        if (!total) throw new Error("O TecConcursos não informou a quantidade total de questões para imprimir.");
        job.ranges = splitRanges(total, maxPerPrint);
        job.rangeIndex = 0;
      }
      if (!job.printTotalQuestions) job.printTotalQuestions = total;
      var current = job.ranges[job.rangeIndex];
      if (!current) throw new Error("Não existe uma parte pendente para imprimir.");
      context.persistProgress(state, {
        phase: "preparing-print",
        message: "Preparando parte " + String(job.rangeIndex + 1) + " de " + String(job.ranges.length) + ": questões " + current.start + " a " + String(current.start + current.count - 1) + ".",
        matterCode: job.code,
        matterTitle: job.title,
        rangeIndex: job.rangeIndex,
        rangesTotal: job.ranges.length,
        printTotalQuestions: job.printTotalQuestions
      });
      var sequential = documentNode.querySelector("#questoesSequenciais");
      if (sequential && !sequential.checked && !clickElement(documentNode, sequential)) throw new Error("Não consegui selecionar 'A partir da questão'.");
      setInputValue(initialInput, current.start);
      var quantityInput = documentNode.querySelector("#numeroQuestoesInput, #numeroQuestoes");
      if (quantityInput) setInputValue(quantityInput, current.count);
      if (String(initialInput.value) !== String(current.start)) throw new Error("O início da impressão não foi atualizado para a questão " + current.start + ".");
      if (quantityInput && String(quantityInput.value) !== String(current.count)) throw new Error("A quantidade da parte não foi atualizada para " + current.count + " questões.");
      var confirm = documentNode.querySelector("#confirmar-button");
      if (!confirm || confirm.disabled) throw new Error("O botão 'Imprimir Caderno' não ficou disponível.");
      if (!preparePrintForm(documentNode)) throw new Error("Não encontrei o formulário de impressão do caderno.");
      context.persistProgress(state, {
        phase: "opening-output",
        message: "Enviando a parte " + String(job.rangeIndex + 1) + " de " + String(job.ranges.length) + " para a saída de impressão.",
        matterCode: job.code,
        matterTitle: job.title,
        rangeIndex: job.rangeIndex,
        rangesTotal: job.ranges.length,
        printTotalQuestions: job.printTotalQuestions
      });
      if (!clickElement(documentNode, confirm)) throw new Error("Encontrei 'Imprimir Caderno', mas não consegui acionar o botão.");
      await waitFor(documentNode, function () { return context.isPrintPage(rootNode); }, 8000, "O clique em 'Imprimir Caderno' não abriu a página HTML de saída.");
      return "Abrindo a parte iniciada na questão " + current.start + ".";
    }

    return { submitCurrentRange: submitCurrentRange };
  }

  return {
    splitRanges: splitRanges,
    clickPrintTab: clickPrintTab,
    preparePrintForm: preparePrintForm,
    createPrintWorkflow: createPrintWorkflow
  };
});

// ---- automation-output.cjs ----
(function (root, factory) {
  var api = factory(
    typeof module !== "undefined" && module.exports ? { library: require("./library.cjs") } : { library: root.TecConcursosModules.library }
  );
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) {
    root.TecConcursosModules = root.TecConcursosModules || {};
    root.TecConcursosModules.automationOutput = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (deps) {
  "use strict";

  function createOutputWorkflow(context) {
    var rootNode = context.root;
    var documentNode = context.document;
    var outputWaitTimeoutMs = context.outputWaitTimeoutMs || 60000;
    var library = context.library;
    var extractPrintedQuestions = context.extractPrintedQuestions || deps.library.extractPrintedQuestions;

    async function waitForPrintedQuestions(state) {
      var job = state.export.job;
      var current = job.ranges[job.rangeIndex];
      var expected = current ? Number(current.count) || 0 : 0;
      var lastCount = -1;
      var observedCount = 0;
      var lastHeartbeat = 0;
      context.persistProgress(state, {
        phase: "waiting-output",
        message: "Aguardando a página HTML montar as questões da parte " + String(job.rangeIndex + 1) + " de " + String(job.ranges.length) + ".",
        matterCode: job.code,
        matterTitle: job.title,
        rangeIndex: job.rangeIndex,
        rangesTotal: job.ranges.length,
        expectedQuestionNodes: expected
      });
      try {
        await context.waitFor(documentNode, function () {
          var count = documentNode && typeof documentNode.querySelectorAll === "function" ? documentNode.querySelectorAll(".questao").length : 0;
          observedCount = count;
          if (count !== lastCount) {
            lastCount = count;
            context.recordEvent(state, "output-question-count", { count: count, expected: expected, page: context.pageDiagnosticSnapshot(rootNode, documentNode) });
            context.writeState(state);
          } else if (Date.now() - lastHeartbeat >= 1000) {
            lastHeartbeat = Date.now();
            context.persistProgress(state, {
              phase: "waiting-output",
              message: "Aguardando questões: " + count + (expected ? "/" + expected : "") + ".",
              questionNodeCount: count,
              expectedQuestionNodes: expected,
              rangeIndex: job.rangeIndex,
              rangesTotal: job.ranges.length
            });
          }
          return count > 0 && (!expected || count >= expected);
        }, outputWaitTimeoutMs, "A página HTML de impressão não montou a quantidade esperada de questões em " + Math.floor(outputWaitTimeoutMs / 1000) + " segundos.");
      } catch (error) {
        context.recordEvent(state, "output-timeout", { expected: expected, observed: observedCount, page: context.pageDiagnosticSnapshot(rootNode, documentNode) });
        context.writeState(state);
        throw new Error("A página de impressão não trouxe a quantidade esperada de questões (" + observedCount + "/" + expected + "). " + error.message);
      }
      context.recordEvent(state, "output-ready", context.pageDiagnosticSnapshot(rootNode, documentNode));
      context.writeState(state);
    }

    async function finishExportPart(state) {
      var job = state.export.job;
      var current = job.ranges[job.rangeIndex];
      context.persistProgress(state, {
        phase: "reading-output",
        message: "Lendo a parte " + String(job.rangeIndex + 1) + " de " + String(job.ranges.length) + " da saída de impressão.",
        matterCode: job.code,
        matterTitle: job.title,
        rangeIndex: job.rangeIndex,
        rangesTotal: job.ranges.length,
        printTotalQuestions: job.printTotalQuestions
      });
      await waitForPrintedQuestions(state);
      var questions = extractPrintedQuestions(documentNode);
      if (!questions.length) {
        context.recordEvent(state, "extraction-empty", { page: context.pageDiagnosticSnapshot(rootNode, documentNode), expected: current && current.count });
        context.writeState(state);
        throw new Error("A página de impressão montou o DOM, mas nenhuma questão pôde ser extraída.");
      }
      context.recordEvent(state, "questions-extracted", { extracted: questions.length, expected: current && current.count, page: context.pageDiagnosticSnapshot(rootNode, documentNode) });
      context.writeState(state);
      var titleNode = documentNode.querySelector("h1");
      var entry = library.appendPart(Object.assign({}, job, {
        title: job.title || context.clean(titleNode && (titleNode.innerText || titleNode.textContent)),
        start: current.start,
        totalQuestions: job.ranges.reduce(function (total, range) { return total + range.count; }, 0),
        sourceQuestionCount: Number(job.sourceQuestionCount) || 0,
        printTotalQuestions: Number(job.printTotalQuestions) || 0
      }), questions);
      job.rangeIndex += 1;
      if (job.rangeIndex < job.ranges.length) {
        context.persistProgress(state, {
          phase: "part-saved",
          message: "Parte salva (" + questions.length + " questões). Retomando a parte " + String(job.rangeIndex + 1) + " de " + String(job.ranges.length) + ".",
          matterCode: job.code,
          matterTitle: job.title,
          rangeIndex: job.rangeIndex,
          rangesTotal: job.ranges.length,
          printTotalQuestions: job.printTotalQuestions
        });
        rootNode.location.href = context.cadernoUrl(rootNode, job.cadernoId);
        return "Parte salva: " + questions.length + " questões. Indo para a próxima parte.";
      }
      state.export = null;
      if (state.creation) {
        state.creation.outcomes.push({ code: state.creation.current.code, cadernoId: job.cadernoId, entryId: entry.id, savedAt: new Date().toISOString() });
        state.creation.index += 1;
        state.creation.phase = "prepare";
        state.creation.current = null;
        context.persistProgress(state, {
          phase: "next-matter",
          message: "Caderno " + entry.title + " consolidado. Preparando o próximo caderno.",
          matterIndex: state.creation.index,
          mattersTotal: state.creation.plan.matters.length,
          lastSavedEntryId: entry.id,
          lastSavedQuestions: questions.length
        });
        rootNode.location.href = state.creation.filterUrl;
        return "Caderno " + entry.title + " consolidado na biblioteca. Preparando o próximo.";
      }
      state.running = false;
      context.persistProgress(state, {
        phase: "completed",
        message: "Caderno " + entry.title + " consolidado na biblioteca.",
        matterIndex: 1,
        mattersTotal: 1,
        lastSavedEntryId: entry.id,
        lastSavedQuestions: questions.length
      });
      context.lockManager.releaseLease(state);
      return "Caderno " + entry.title + " consolidado na biblioteca.";
    }

    return {
      waitForPrintedQuestions: waitForPrintedQuestions,
      finishExportPart: finishExportPart
    };
  }

  return { createOutputWorkflow: createOutputWorkflow };
});

// ---- automation-caderno.cjs ----
(function (root, factory) {
  var api = factory(
    typeof module !== "undefined" && module.exports ? {
      plan: require("./plan.cjs"),
      filters: require("./automation-filters.cjs")
    } : {
      plan: root.TecConcursosModules.plan,
      filters: root.TecConcursosModules.automationFilters
    }
  );
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) {
    root.TecConcursosModules = root.TecConcursosModules || {};
    root.TecConcursosModules.automationCaderno = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (deps) {
  "use strict";

  function createCadernoWorkflow(context) {
    var documentNode = context.document;
    var filters = deps.filters;
    var plan = deps.plan;

    async function createNextCaderno(state) {
      var creation = state.creation;
      var matter = creation.plan.matters[creation.index];
      if (!matter) {
        state.running = false;
        state.creation = null;
        context.persistProgress(state, { phase: "completed", message: "Todos os cadernos do plano foram processados.", matterIndex: creation.index, mattersTotal: creation.plan.matters.length });
        context.lockManager.releaseLease(state);
        return "Todos os cadernos do plano foram processados.";
      }
      context.persistProgress(state, {
        phase: "filtering",
        message: "Aplicando filtros para " + matter.title + ".",
        matterCode: matter.code,
        matterTitle: matter.title,
        matterIndex: creation.index,
        mattersTotal: creation.plan.matters.length
      });
      await filters.clearActiveFilters(documentNode);
      await filters.applyMatterFilters(documentNode, creation.plan, matter, function (message) {
        context.persistProgress(state, {
          phase: "filtering",
          message: message,
          matterCode: matter.code,
          matterTitle: matter.title,
          matterIndex: creation.index,
          mattersTotal: creation.plan.matters.length
        });
      });
      var sourceQuestionCount = context.foundQuestionCount(documentNode);
      if (!sourceQuestionCount) throw new Error("Os filtros foram aplicados, mas não consegui ler a quantidade de questões encontradas.");
      context.persistProgress(state, {
        phase: "naming-caderno",
        message: "Filtros concluídos: " + sourceQuestionCount + " questões. Preenchendo o nome do caderno.",
        sourceQuestionCount: sourceQuestionCount,
        matterCode: matter.code,
        matterTitle: matter.title,
        matterIndex: creation.index,
        mattersTotal: creation.plan.matters.length
      });
      var nameInput = documentNode.querySelector("#nomeCadernoId");
      var folderSelect = documentNode.querySelector("#pastaCadernosId");
      var generateButton = Array.from(documentNode.querySelectorAll("button")).filter(context.isVisible).find(function (button) {
        return context.sameText(button.innerText || button.textContent, "Gerar Caderno");
      });
      if (!nameInput || !folderSelect || !generateButton) throw new Error("Não encontrei os controles de geração do caderno.");
      if (!context.fillCadernoName(documentNode, nameInput, matter.title)) {
        throw new Error("Não consegui preencher o nome do caderno com o título do plano: " + matter.title + ".");
      }
      var option = Array.from(folderSelect.options || []).find(function (item) { return String(item.value) === String(creation.folderId); });
      if (!option) throw new Error("A pasta " + creation.folderId + " não está disponível no seletor do TecConcursos.");
      folderSelect.value = option.value;
      folderSelect.dispatchEvent(new Event("change", { bubbles: true }));
      await context.waitFor(documentNode, function () { return !generateButton.disabled; }, 12000, "O botão 'Gerar Caderno' permaneceu desabilitado após aplicar os filtros.");
      creation.phase = "awaiting-caderno";
      creation.current = Object.assign({}, matter, { sourceQuestionCount: sourceQuestionCount });
      context.persistProgress(state, {
        phase: "creating-caderno",
        message: "Gerando o caderno " + matter.title + " com " + sourceQuestionCount + " questões.",
        sourceQuestionCount: sourceQuestionCount,
        matterCode: matter.code,
        matterTitle: matter.title,
        matterIndex: creation.index,
        mattersTotal: creation.plan.matters.length
      });
      if (!context.clickElement(documentNode, generateButton)) throw new Error("Encontrei 'Gerar Caderno', mas não consegui acionar o botão.");
      context.persistProgress(state, {
        phase: "waiting-caderno",
        message: "Caderno solicitado. Aguardando a página do novo caderno.",
        sourceQuestionCount: sourceQuestionCount,
        matterCode: matter.code,
        matterTitle: matter.title,
        matterIndex: creation.index,
        mattersTotal: creation.plan.matters.length
      });
      return "Solicitação de criação enviada para " + matter.title + " (" + sourceQuestionCount + " questões encontradas).";
    }

    return { createNextCaderno: createNextCaderno };
  }

  return { createCadernoWorkflow: createCadernoWorkflow };
});

// ---- automation-diagnostics.cjs ----
(function (root, factory) {
  var api = factory(
    typeof module !== "undefined" && module.exports ? {
      state: require("./automation-state.cjs"),
      dom: require("./automation-dom.cjs")
    } : {
      state: root.TecConcursosModules.automationState,
      dom: root.TecConcursosModules.automationDom
    }
  );
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) {
    root.TecConcursosModules = root.TecConcursosModules || {};
    root.TecConcursosModules.automationDiagnostics = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (deps) {
  "use strict";

  function createDiagnostics(context) {
    function markProgress(state, patch) {
      return deps.state.markProgress(state, patch);
    }

    function recordEvent(state, eventName, details) {
      return deps.state.appendEvent(
        state,
        eventName,
        details,
        context.root && context.root.location && context.root.location.href,
        deps.dom.compactDiagnosticValue
      );
    }

    function persistProgress(state, patch) {
      markProgress(state, patch);
      recordEvent(state, "progress", patch);
      return context.writeState(state);
    }

    function getProgress() {
      var state = context.readState();
      var progress = state.progress && typeof state.progress === "object" ? state.progress : {};
      var updatedAtMs = progress.updatedAt ? Date.parse(progress.updatedAt) : NaN;
      var ageMs = Number.isFinite(updatedAtMs) ? Math.max(0, Date.now() - updatedAtMs) : null;
      var job = state.export && state.export.job;
      var creation = state.creation;
      var lock = context.lockManager.lockInfo(state);
      return Object.assign({}, progress, {
        running: Boolean(state.running),
        stale: Boolean(state.running && ageMs != null && ageMs >= context.staleAfterMs),
        ageMs: ageMs,
        matterIndex: creation ? Number(creation.index) || 0 : progress.matterIndex,
        mattersTotal: creation && creation.plan ? creation.plan.matters.length : progress.mattersTotal,
        rangeIndex: job ? Number(job.rangeIndex) || 0 : progress.rangeIndex,
        rangesTotal: job && job.ranges ? job.ranges.length : progress.rangesTotal,
        ownerId: lock.ownerId,
        ownsLock: lock.ownsLock,
        lockActive: lock.active,
        lockedByOtherTab: lock.lockedByOtherTab,
        lockOwnerId: lock.lockOwnerId,
        lockExpiresAt: lock.expiresAt
      });
    }

    function getDiagnostics() {
      var state = context.readState();
      var progress = getProgress();
      return {
        generatedAt: new Date().toISOString(),
        status: context.status(),
        page: context.pageDiagnosticSnapshot(context.root, context.document),
        state: {
          running: Boolean(state.running),
          runId: state.runId || null,
          ownerId: state.ownerId || context.ownerId,
          creationIndex: state.creation ? Number(state.creation.index) || 0 : null,
          creationPhase: state.creation ? String(state.creation.phase || "") : null,
          exportRangeIndex: state.export && state.export.job ? Number(state.export.job.rangeIndex) || 0 : null,
          exportRangesTotal: state.export && state.export.job && state.export.job.ranges ? state.export.job.ranges.length : null
        },
        lock: context.lockManager.lockInfo(state),
        progress: {
          phase: progress.phase || "",
          message: progress.message || "",
          updatedAt: progress.updatedAt || null,
          stale: Boolean(progress.stale),
          history: Array.isArray(progress.history) ? progress.history : [],
          events: Array.isArray(progress.events) ? progress.events : []
        }
      };
    }

    return {
      markProgress: markProgress,
      recordEvent: recordEvent,
      persistProgress: persistProgress,
      getProgress: getProgress,
      getDiagnostics: getDiagnostics
    };
  }

  return { createDiagnostics: createDiagnostics };
});

// ---- automation-orchestrator.cjs ----
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) {
    root.TecConcursosModules = root.TecConcursosModules || {};
    root.TecConcursosModules.automationOrchestrator = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function createOrchestrator(context) {
    function openFilterForPendingCreation(state) {
      var creation = state && state.creation;
      var filterUrl = creation && String(creation.filterUrl || "");
      if (!filterUrl) throw new Error("A execução pendente não possui a URL de filtros da pasta.");
      context.persistProgress(state, {
        phase: "opening-filter",
        message: "Abrindo a página de filtros para retomar a criação do próximo caderno.",
        matterIndex: creation.index,
        mattersTotal: creation.plan && creation.plan.matters ? creation.plan.matters.length : 0
      });
      if (context.root && context.root.location) context.root.location.href = filterUrl;
      return "Abrindo a página de filtros para retomar a criação do caderno.";
    }

    async function resume() {
      var state = context.readState();
      if (!state.running) return context.status();
      var acquired = context.lockManager.acquireLease(state, false);
      if (!acquired.acquired) return context.lockManager.lockStatus(acquired.lock);
      context.recordEvent(state, "resume-enter", { page: context.pageDiagnosticSnapshot(context.root, context.document), running: Boolean(state.running) });
      context.writeState(state);
      if (context.isPrintPage(context.root) && state.export && state.export.job) return context.output.finishExportPart(state);
      if (context.isCadernoPage(context.root) && state.creation && state.creation.phase === "awaiting-caderno" && !state.export) {
        var createdId = context.cadernoIdFromLocation(context.root.location);
        if (!createdId) throw new Error("O TecConcursos abriu um caderno sem identificador.");
        var currentMatter = state.creation.current;
        state.export = { job: {
          libraryId: createdId,
          cadernoId: createdId,
          title: currentMatter.title,
          code: currentMatter.code,
          group: currentMatter.group,
          sourceQuestionCount: Number(currentMatter.sourceQuestionCount) || 0,
          ranges: [],
          rangeIndex: 0
        } };
        state.creation.phase = "exporting";
        context.persistProgress(state, {
          phase: "preparing-print",
          message: "Novo caderno aberto. Preparando a primeira parte da impressão.",
          matterCode: currentMatter.code,
          matterTitle: currentMatter.title,
          matterIndex: state.creation.index,
          mattersTotal: state.creation.plan.matters.length
        });
      }
      if (context.isCadernoPage(context.root) && state.export && state.export.job) return context.print.submitCurrentRange(state);
      if (state.creation && state.creation.phase === "prepare" && state.creation.filterUrl && !context.isFilterPage(context.root)) {
        return openFilterForPendingCreation(state);
      }
      if (context.isFilterPage(context.root) && state.creation && state.creation.phase === "prepare") return context.caderno.createNextCaderno(state);
      return context.status();
    }

    return { resume: resume };
  }

  return { createOrchestrator: createOrchestrator };
});

// ---- automation.cjs ----
(function (root, factory) {
  var api = factory(
    typeof module !== "undefined" && module.exports ? {
      plan: require("./plan.cjs"),
      library: require("./library.cjs"),
      dom: require("./automation-dom.cjs"),
      lock: require("./automation-lock.cjs"),
      state: require("./automation-state.cjs"),
      filters: require("./automation-filters.cjs"),
      print: require("./automation-print.cjs"),
      output: require("./automation-output.cjs"),
      caderno: require("./automation-caderno.cjs"),
      diagnostics: require("./automation-diagnostics.cjs"),
      orchestrator: require("./automation-orchestrator.cjs")
    } : (function (modules) {
      return Object.assign({}, modules, {
        dom: modules.automationDom,
        lock: modules.automationLock,
        state: modules.automationState,
        filters: modules.automationFilters,
        print: modules.automationPrint,
        output: modules.automationOutput,
        caderno: modules.automationCaderno,
        diagnostics: modules.automationDiagnostics,
        orchestrator: modules.automationOrchestrator
      });
    })(root.TecConcursosModules)
  );
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) {
    root.TecConcursosModules = root.TecConcursosModules || {};
    root.TecConcursosModules.automation = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (deps) {
  "use strict";

  var stateModule = deps.state;
  var STATE_KEY = stateModule.STATE_KEY;
  var PLAN_KEY = stateModule.PLAN_KEY;
  var FOLDER_KEY = stateModule.FOLDER_KEY;
  var MAX_PER_PRINT = stateModule.MAX_PER_PRINT;
  var STALE_AFTER_MS = stateModule.STALE_AFTER_MS;
  var OUTPUT_WAIT_TIMEOUT_MS = stateModule.OUTPUT_WAIT_TIMEOUT_MS;
  var clean = deps.dom.clean;
  var sameText = deps.dom.sameText;
  var isVisible = deps.dom.isVisible;
  var waitFor = deps.dom.waitFor;
  var clickElement = deps.dom.clickElement;
  var commitInputValue = deps.dom.commitInputValue;
  var fillCadernoName = deps.dom.fillCadernoName;
  var foundQuestionCount = deps.dom.foundQuestionCount;
  var pageDiagnosticSnapshot = deps.dom.pageDiagnosticSnapshot;
  var cadernoIdFromLocation = deps.library.cadernoIdFromLocation;

  function createAutomation(options) {
    var config = options || {};
    var rootNode = config.root;
    var documentNode = config.document;
    var storage = config.storage;
    var library = config.library;

    function readState() {
      return stateModule.normalizeState(storage.read(STATE_KEY, stateModule.defaultState()));
    }

    var lockManager = deps.lock.createLockManager({ root: rootNode, storage: storage, readState: readState, ownerId: config.ownerId });
    var ownerId = lockManager.ownerId;

    function writeState(state, options) {
      if (!(options && options.skipLease)) lockManager.ensureLease(state);
      storage.write(STATE_KEY, state);
      return state;
    }

    var getProgress;
    function status() {
      var state = readState();
      var progress = getProgress();
      if (progress.phase === "error") return progress.message || "A automação falhou.";
      if (progress.phase === "paused") return progress.message || "Automação pausada.";
      if (state.running && progress.lockedByOtherTab) return lockManager.lockStatus(lockManager.readLock());
      if (!state.running) {
        if (progress.phase === "completed") return progress.message || "Automação concluída.";
        return "Pronto.";
      }
      if (progress.stale) return "Sem atividade há " + Math.max(1, Math.floor((progress.ageMs || 0) / 1000)) + "s. Verifique a aba de saída ou retome a execução.";
      if (state.export && state.export.job) {
        var job = state.export.job;
        return "Exportando " + job.title + ": parte " + String((job.rangeIndex || 0) + 1) + " de " + String((job.ranges || []).length || "?") + ".";
      }
      if (state.creation) return "Criando caderno " + String(state.creation.index + 1) + " de " + String(state.creation.plan.matters.length) + ".";
      return "Processo em andamento.";
    }

    var diagnostics = deps.diagnostics.createDiagnostics({
      root: rootNode,
      document: documentNode,
      ownerId: ownerId,
      staleAfterMs: STALE_AFTER_MS,
      readState: readState,
      writeState: writeState,
      lockManager: lockManager,
      status: function () { return status(); },
      pageDiagnosticSnapshot: pageDiagnosticSnapshot
    });
    getProgress = diagnostics.getProgress;

    var cadernoWorkflow = deps.caderno.createCadernoWorkflow({
      document: documentNode,
      lockManager: lockManager,
      persistProgress: diagnostics.persistProgress,
      foundQuestionCount: foundQuestionCount,
      isVisible: isVisible,
      sameText: sameText,
      fillCadernoName: fillCadernoName,
      waitFor: waitFor,
      clickElement: clickElement
    });
    var printWorkflow = deps.print.createPrintWorkflow({
      root: rootNode,
      document: documentNode,
      maxPerPrint: MAX_PER_PRINT,
      persistProgress: diagnostics.persistProgress,
      isPrintPage: deps.filters.isPrintPage
    });
    var outputWorkflow = deps.output.createOutputWorkflow({
      root: rootNode,
      document: documentNode,
      library: library,
      lockManager: lockManager,
      outputWaitTimeoutMs: OUTPUT_WAIT_TIMEOUT_MS,
      persistProgress: diagnostics.persistProgress,
      recordEvent: diagnostics.recordEvent,
      writeState: writeState,
      waitFor: waitFor,
      clean: clean,
      pageDiagnosticSnapshot: pageDiagnosticSnapshot,
      cadernoUrl: deps.filters.cadernoUrl
    });
    var orchestrator = deps.orchestrator.createOrchestrator({
      root: rootNode,
      document: documentNode,
      lockManager: lockManager,
      readState: readState,
      writeState: writeState,
      status: status,
      recordEvent: diagnostics.recordEvent,
      persistProgress: diagnostics.persistProgress,
      pageDiagnosticSnapshot: pageDiagnosticSnapshot,
      cadernoIdFromLocation: cadernoIdFromLocation,
      isFilterPage: deps.filters.isFilterPage,
      isPrintPage: deps.filters.isPrintPage,
      isCadernoPage: deps.filters.isCadernoPage,
      caderno: cadernoWorkflow,
      print: printWorkflow,
      output: outputWorkflow
    });
    var resume = orchestrator.resume;

    function errorMessage(error) {
      return String(error && error.message || error || "Erro desconhecido").replace(/\s+/g, " ").trim();
    }

    function readPlan() { return deps.plan.normalizePlan(storage.read(PLAN_KEY, {})); }
    function savePlan(plan) { var normalized = deps.plan.normalizePlan(plan); storage.write(PLAN_KEY, normalized); return normalized; }
    function readFolderId() {
      var fromLocation = deps.filters.folderIdFromLocation(rootNode);
      if (fromLocation) {
        storage.write(FOLDER_KEY, fromLocation);
        return fromLocation;
      }
      return clean(storage.read(FOLDER_KEY, ""));
    }
    function saveFolderId(value) {
      var id = clean(value);
      storage.write(FOLDER_KEY, id);
      return id;
    }
    function pause() {
      var state = readState();
      if (state.runId && !lockManager.ownsLock(lockManager.readLock(), state)) return status();
      state.running = false;
      diagnostics.persistProgress(state, { phase: "paused", message: "Automação pausada. A execução pode ser retomada." });
      lockManager.releaseLease(state);
      return status();
    }
    function fail(error) {
      var state = readState();
      if (!state.running && !state.creation && !state.export) return status();
      if (state.runId && !lockManager.ownsLock(lockManager.readLock(), state)) return status();
      diagnostics.recordEvent(state, "error-detected", { error: errorMessage(error), page: pageDiagnosticSnapshot(rootNode, documentNode) });
      state.running = false;
      diagnostics.persistProgress(state, { phase: "error", message: "Falha na automação: " + errorMessage(error), error: errorMessage(error), failedAt: new Date().toISOString() });
      lockManager.releaseLease(state);
      return status();
    }
    function resumePaused() {
      var state = readState();
      if (!state.creation && !state.export) throw new Error("Não há uma automação pausada ou pendente para retomar.");
      var acquired = lockManager.acquireLease(state, false);
      if (!acquired.acquired) return lockManager.lockStatus(acquired.lock);
      state.running = true;
      diagnostics.persistProgress(state, { phase: "resuming", message: "Retomando a automação na etapa salva..." });
      return resume();
    }
    function startCreation(folderId) {
      var plan = readPlan();
      if (!plan.matters.length) throw new Error("Importe o plano consolidado antes de criar os cadernos.");
      var id = clean(folderId || readFolderId());
      if (!id) throw new Error("Informe a pasta de destino do TecConcursos.");
      var existing = readState();
      if (existing.running || existing.creation || existing.export) {
        throw new Error(status() || "Já existe uma automação em andamento.");
      }
      saveFolderId(id);
      var state = {
        version: 1,
        runId: lockManager.createRunId(),
        ownerId: ownerId,
        running: true,
        creation: { plan: plan, folderId: id, filterUrl: deps.filters.filterUrl(rootNode, id), index: 0, phase: "prepare", outcomes: [] },
        export: null,
        progress: { phase: "starting", message: "Plano iniciado.", matterIndex: 0, mattersTotal: plan.matters.length, startedAt: new Date().toISOString() }
      };
      var acquired = lockManager.acquireLease(state, false);
      if (!acquired.acquired) throw lockManager.lockError(acquired.lock);
      writeState(state);
      if (!deps.filters.isFilterPage(rootNode)) {
        rootNode.location.href = state.creation.filterUrl;
        return "Abrindo a página de filtros para iniciar a criação.";
      }
      return resume();
    }
    function startCurrentCaderno() {
      var id = cadernoIdFromLocation(rootNode.location);
      if (!id || !deps.filters.isCadernoPage(rootNode)) throw new Error("Abra um caderno antes de iniciar a exportação.");
      var titleNode = documentNode.querySelector("h1, .titulo-caderno");
      var state = readState();
      if (state.running || state.creation || state.export) throw new Error(status() || "Já existe uma automação em andamento.");
      state.runId = lockManager.createRunId();
      state.ownerId = ownerId;
      state.running = true;
      state.export = { job: {
        libraryId: id,
        cadernoId: id,
        title: clean(titleNode && (titleNode.innerText || titleNode.textContent)) || "Caderno " + id,
        code: "MANUAL-" + id,
        group: "Exportações manuais",
        ranges: [],
        rangeIndex: 0
      } };
      var acquired = lockManager.acquireLease(state, false);
      if (!acquired.acquired) throw lockManager.lockError(acquired.lock);
      diagnostics.persistProgress(state, { phase: "starting-export", message: "Preparando a exportação do caderno atual.", matterIndex: 0, mattersTotal: 1 });
      return resume();
    }
    function takeover() {
      var state = readState();
      if (!state.creation && !state.export) throw new Error("Não há uma automação pendente para assumir.");
      if (!state.runId) state.runId = lockManager.createRunId();
      state.ownerId = ownerId;
      state.running = true;
      var acquired = lockManager.acquireLease(state, true);
      if (!acquired.acquired) throw lockManager.lockError(acquired.lock);
      diagnostics.persistProgress(state, {
        phase: "taking-over",
        message: "Execução assumida por esta aba. Retomando na etapa salva.",
        takeoverAt: new Date().toISOString()
      });
      return resume();
    }

    return {
      readPlan: readPlan,
      savePlan: savePlan,
      getState: readState,
      status: status,
      pause: pause,
      takeover: takeover,
      startCreation: startCreation,
      startCurrentCaderno: startCurrentCaderno,
      resume: resume,
      resumePaused: resumePaused,
      fail: fail,
      getProgress: diagnostics.getProgress,
      getDiagnostics: diagnostics.getDiagnostics,
      readFolderId: readFolderId,
      saveFolderId: saveFolderId,
      defaultFolderId: readFolderId
    };
  }

  return {
    STATE_KEY: STATE_KEY,
    PLAN_KEY: PLAN_KEY,
    FOLDER_KEY: FOLDER_KEY,
    LOCK_KEY: deps.lock.LOCK_KEY,
    OWNER_SESSION_KEY: deps.lock.OWNER_SESSION_KEY,
    MAX_PER_PRINT: MAX_PER_PRINT,
    STALE_AFTER_MS: STALE_AFTER_MS,
    LOCK_LEASE_MS: deps.lock.LOCK_LEASE_MS,
    LOCK_HEARTBEAT_MS: deps.lock.LOCK_HEARTBEAT_MS,
    filterHeadingLabel: deps.filters.filterHeadingLabel,
    sameText: sameText,
    commitInputValue: commitInputValue,
    fillCadernoName: fillCadernoName,
    foundQuestionCount: foundQuestionCount,
    preparePrintForm: deps.print.preparePrintForm,
    pageDiagnosticSnapshot: pageDiagnosticSnapshot,
    searchCandidates: deps.filters.searchCandidates,
    searchBoxMatchesHeading: deps.filters.searchBoxMatchesHeading,
    treeItemMatches: deps.filters.treeItemMatches,
    hasSelectedTreeItem: deps.filters.hasSelectedTreeItem,
    treeItemClickTarget: deps.filters.treeItemClickTarget,
    invokeAngularTreeItem: deps.dom.invokeAngularTreeItem,
    activeFilterCount: deps.filters.activeFilterCount,
    splitRanges: deps.print.splitRanges,
    createAutomation: createAutomation
  };
});

// ---- ai-context.cjs ----
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) {
    root.TecConcursosModules = root.TecConcursosModules || {};
    root.TecConcursosModules.aiContext = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var embeddedContent = "# Universal Agent Guidelines (The AI Bible)\n\nThis document defines the core behavioral, security, design, and coding constraints. These rules are universally applicable to ensure high-quality, maintainable, and correct code output.\n\n## Rule Precedence\n\nApply instructions in this order:\n1. The user’s explicit task requirements.\n2. Repository-level rule files and project documentation.\n3. More specific rule files or documentation in the affected directory.\n4. Explicit constraints marked `CAVEAT`, `IMPORTANT`, `DO NOT CHANGE`, or equivalent, when they are relevant and not contradicted by a higher-priority rule.\n5. Existing local code conventions.\n\nTreat nearby code comments as context, not absolute authority, unless they clearly define a current technical or business constraint.\n\nWhen a rule applies only to a specific language, subsystem, framework, or workflow, place it in a path- or context-scoped rule file rather than the universal core.\n\n## Agent Behavior & Workflow\n\n* **Verification over assumption:** Treat the first implementation as a draft. Before presenting the result, run the repository's applicable verification checks. If no relevant checks exist or they cannot be run, say so explicitly.\n* **Surgical edits:** Make only the modifications necessary for the requested change. Do not rewrite, reformat, or restate unrelated files, functions, or code.\n* **Fail gracefully:** If a command or test fails, inspect its output and address the root cause. Do not repeatedly guess at fixes. If blocked by missing information, permissions, or an external dependency, state the blocker and the assumption made.\n* **Enforcement over instruction:** When a behavior must happen deterministically, prefer hooks, CI, generators, linters, type-checkers, tests, or scanners over prompt-only instructions. Rely on the repository's active tooling for styling and type-checking rather than debating stylistic prompts.\n\n## Security and Configuration\n\n* Never commit, print, log, or embed real secrets, credentials, tokens, or sensitive internal URLs.\n* Read secrets and environment-dependent values through the repository’s approved configuration mechanism.\n* When adding required configuration, update the relevant example/config schema and documentation.\n* Use existing secret-scanning, validation, and CI checks; instructions are not a substitute for enforcement.\n\n## External Integrations & Canonical References\n\n* Before changing an external API, SDK, CLI, or domain integration, consult the repository’s canonical integration documentation and, when necessary, the official documentation for the version in use.\n* Do not invent endpoints, methods, parameters, versions, or capabilities.\n* Prefer the existing client, generated types, schemas, and integration tests. If documentation is missing or ambiguous, state the assumption rather than guessing.\n\n## Shared-State Changes\n\n* For changes that write shared or persistent state, follow the repository’s existing transaction, locking, idempotency, validation, and retry conventions.\n* Add or update tests for relevant failure, rollback, and concurrency cases when applicable.\n\n## Code Style\n\n* Follow the repository’s existing formatter, linter, naming, directory, and framework conventions. Do not introduce style-only rewrites in a functional change.\n* Prefer small, cohesive functions and modules. Treat 4–20 lines per function and 500 lines per handwritten production module as review targets, not hard limits.\n* Split code when responsibilities, dependencies, or reasons to change are independent. Do not split cohesive workflows merely to satisfy a line-count rule.\n* Prefer guard clauses and early returns when they reduce nesting. Avoid more than two logical control-flow levels in new business logic unless deeper nesting makes resource lifetime, transactions, or error handling clearer.\n* Keep module paths predictable. Follow the repository’s structure first; use framework conventions when the repository has no established alternative.\n\n## Data Transformations and Performance\n\n* For repeated membership checks, grouping, or joins over in-memory collections, prefer an appropriate Set, Map, dictionary, index, or database query over repeated linear scans.\n* Avoid avoidable repeated scans inside loops when an index can preserve correctness and substantially improve complexity.\n* Nested loops are acceptable for inherently pairwise, matrix, cross-product, bounded-small-data, or clearer algorithms. Do not optimize solely to remove nesting.\n* Preserve required ordering, memory limits, and semantics. Profile or benchmark performance-sensitive paths before introducing non-obvious optimization.\n\n## Naming\n\n* Use names that describe the domain role, action, or invariant and are distinctive within their module and search context.\n* Avoid vague catch-all modules or identifiers such as `utils`, `helpers`, `data`, or generic `manager` unless they are established framework conventions or include a precise domain qualifier.\n* Name boolean predicates clearly using the convention appropriate to the language and meaning, such as `is`, `has`, `can`, `should`, `was`, or `needs`.\n\n## Types\n\n* Make types explicit at public APIs and system boundaries: HTTP, CLI, database, queue, filesystem, external APIs, serialization, and complex domain operations.\n* Allow local type inference when the inferred type is clear and preserves type safety.\n* In TypeScript, do not introduce implicit `any`. Avoid explicit `any`; use `unknown` with runtime validation when input is uncertain.\n* In Python, type public functions and structured data. Prefer domain models, `TypedDict`, `dataclass`, or typed mappings over untyped dictionaries when shape matters.\n* Introduce domain-specific types for values whose accidental interchange would cause meaningful bugs, such as money, units, identifiers, or validated state.\n\n## Duplication and Abstraction\n\n* Do not duplicate business rules, validation rules, security policy, or protocol behavior that must remain consistent across call sites.\n* Extract a shared abstraction when three similar call sites reveal a stable shared contract, or earlier when one policy must change atomically everywhere.\n* Do not abstract code merely because it looks syntactically similar. Preserve separate implementations when their future changes are likely to diverge.\n\n## Errors\n\n* For validation and internal diagnostic errors, include the operation or field, the expected contract, and a safe summary of the received value.\n* Redact, hash, omit, or truncate secrets, credentials, session identifiers, personal data, and large payloads.\n* Keep user-facing errors safe and actionable; keep implementation detail in protected logs or structured diagnostics.\n\n## Comments and Documentation\n\n* **Preserve intent:** Preserve useful comments and docstrings during refactoring. Update or relocate them when surrounding code changes; remove them only when obsolete, inaccurate, redundant with clear code, or replaced by a more durable source of truth.\n* **Explain why, not what:** Write comments to document the \"why\" and explain non-obvious logic, invariants, or external limitations. Never write comments that merely restate self-documenting code (e.g., `# Increment counter`).\n* **Workarounds and Provenance:** When introducing code to fix a production incident, upstream bug, or version conflict, include a comment stating:\n  * The reason for the workaround.\n  * A stable issue, ticket, or commit reference.\n  * The affected dependency/version and the removal condition (e.g., target upgrade version).\n  * *A comment explains the exception; a regression test prevents its accidental removal.*\n* **Do not leak data:** Never include real credentials, private URLs, customer data, or sensitive incident details in comments.\n\n## Public APIs and Interfaces\n\n* **Document boundaries:** Document stable consumer-facing contracts according to the language and repository convention. Describe behavior, constraints, side effects, and compatibility expectations when they are not evident from types or usage.\n* **Document the contract:** State the intent, key parameters, expected return values, exceptions raised, and side effects. Do not add boilerplate docstrings that only repeat obvious signatures.\n* **Conditional examples:** Include code usage examples only when the invocation, state requirements, or return semantics are complex or non-obvious. Prefer verified automated tests over documentation examples.\n\n## Verification and Test Automation\n\n* **Verification command:** Provide one documented, non-interactive command (e.g., `npm run verify` or `make verify`) that executes all fast deterministic checks (formatting, linting, type-checking, and unit tests) before presenting a change.\n* **Readiness guarantee:** Do not claim a change is verified if the required checks could not run. The CI must execute the full required test matrix.\n\n## Test Coverage and Regressions\n\n* **Tested behavior:** Add or update tests for every behavior change that can fail (business rules, validation, serialization, errors, security). Test observable behavior through stable public interfaces; do not test trivial private helpers just for coverage.\n* **Regression testing:** Every bug fix must include a regression test that fails before the fix is applied. If a deterministic test is not feasible, state why and add the nearest reliable automated coverage.\n\n## External I/O and Test Doubles\n\n* **Isolation boundary:** Unit tests must not call production services or depend on uncontrolled network access, shared databases, system time, randomness, or machine-specific environments.\n* **Pragmatic doubles:** Prefer a reusable named fake for complex dependencies. Use focused stubs, mocks, spies, or patches only for one-off scenarios (e.g., timeouts, retries, or verifying side effects).\n* **No scattered patching:** Do not scatter patches of third-party libraries. Wrap external services in thin project-owned adapters and test the adapter with focused integration tests.\n\n## Test Qualities and Determinism\n\n* **F.I.R.S.T. unit tests:** Keep unit tests Fast, Independent (no shared mutable state), Repeatable (order-independent), Self-validating, and Timely (written alongside code).\n* **Deterministic environment:** Freeze or inject time, randomness, locale, timezone, and API responses to eliminate flakiness.\n* **Cleanup and isolation:** New tests must not introduce shared mutable state, order dependence, or environment leakage, and must respect the repository's supported execution model.\n* **Readable naming:** Name tests as readable behavior statements including the condition and expected outcome (e.g., `test_order_total_includes_tax_when_region_is_eu`), preferring one behavior per test.\n\n## Dependencies and Composition\n\n* **Explicit injection:** Prefer constructor injection for long-lived dependencies and function parameters for transient operation values. Avoid hidden dependencies via mutable global state or static service locators.\n* **Composition root:** In application code with meaningful infrastructure boundaries, keep vendor-specific construction and wiring at the composition root or framework bootstrap layer.\n* **Framework lifecycle:** Use singleton lifecycles only when the dependency is thread-safe and intentionally shared. Allow immutable constants and pure functions.\n\n## Third-Party Libraries & Adaptability\n\n* **Project-owned boundaries:** Wrap external integrations (databases, payment providers, third-party APIs) in project-owned adapters. Domain logic must depend on these local contracts, not vendor SDK types or vendor-specific exceptions.\n* **Capability-focused design:** Shape adapter contracts around the specific capability the application needs, not the vendor's entire API. Do not create one-to-one mirror interfaces.\n* **Pragmatic direct usage:** Allow direct third-party imports only for small, stable utility libraries with no external lifecycle or I/O.\n* **YAGNI abstraction:** Do not add abstractions solely for \"future vendor replacement.\" Introduce adapters to create clean testing seams, isolate I/O, or centralize cross-cutting concerns (retries, timeouts, error mapping).\n\n## Dependency Hygiene and Security\n\n* **Lockfile maintenance:** For deployable applications and services, commit and maintain the ecosystem-appropriate lockfile when repository policy requires it. Never edit lockfiles manually; update them only using the repository's package manager in the same commit as the manifest change.\n* **Scope enforcement:** Do not add, remove, or upgrade dependencies unless explicitly requested by the task or required to resolve a verified security vulnerability.\n* **Upgrade diligence:** When modifying dependencies, review the lockfile diff, transitive changes, release notes, and licenses.\n\n## Formatting\n\n* **Enforce existing rules:** Follow the repository’s configured formatter, linter, editor settings, and file-specific rules. Do not debate styling choices already enforced.\n* **No unsolicited styling:** Do not make unrelated, style-only changes outside files affected by the task. Do not introduce new formatters, configurations, or mass-formatting diffs during unrelated tasks.\n* **Execution:** Run the applicable formatter on changed files. If formatting would create a broad unrelated diff, prefer check mode or isolate formatting in a separate intentional change. Treat unsafe autocorrect modes as code changes—review their diffs and run verification.\n\n## Logging and Observability\n\n* **No ad-hoc logs:** Use the repository’s logging abstraction. Never use print statements, `console.log`, or raw string concatenation for production observability.\n* **Structured data:** Production service logs must be structured and machine-queryable (JSON preferred when no standard exists). Let the framework supply metadata like timestamps and environment context.\n* **Correlation:** Include correlation IDs (`trace_id`, `request_id`, `operation_id`) when available, but do not force irrelevant identifiers into every event.\n* **CLI output:** Keep CLI output human-readable, sending diagnostics and errors to stderr.\n\n## Log Levels and Safety\n\n* **Logging levels:** Log at `DEBUG` for high-volume troubleshooting, `INFO` for operation/business lifecycles, `WARN` for unexpected but recoverable conditions, and `ERROR` for operation failures.\n* **Contextual safety:** Include error types, operations, and stack traces when logging failures. Never log secrets, credentials, auth headers, session tokens, payment data, raw request/responses, or unredacted personal data.\n* **No substitute:** Do not use logs as a substitute for metrics, traces, audit records, or automated tests.\n\n## Git Hygiene\n\n* **Atomic commits:** Make each commit atomic and reviewable (include code, tests, migrations, config, and docs together for one change). Do not combine unrelated refactors or formatting changes with functional fixes.\n* **Verify before commit:** Run the repository's build, formatting, linting, type-checking, and tests before committing. If the baseline fails or checks cannot run, document it in the commit or PR.\n* **Commit conventions:** Follow the repository’s commit-message convention. Use Conventional Commits (`<type>(<scope>): <summary>`) only if already adopted or explicitly requested.\n* **Descriptions & History:** PR descriptions must explain *why* the change is needed, summarize verification, and state limitations. Never amend published commits, force-push shared branches, or alter history unless requested.\n\n---\n\n# TecConcursos — Contexto operacional observado\n\nEste contexto reúne apenas contratos observados no código deste projeto, no HTML fornecido pelo usuário, nas páginas abertas durante a depuração e no log detalhado de 23/07/2026. Ele orienta futuras alterações, mas não substitui uma nova inspeção quando o site mudar.\n\n## Escopo do userscript\n\n- Domínio observado: `https://www.tecconcursos.com.br`.\n- Rotas atendidas pelo bundle: `/questoes/pastas*`, `/questoes/filtrar*`, `/questoes/cadernos/*` e a página de impressão do caderno.\n- A sessão, login, assinatura e permissões pertencem ao navegador e ao TecConcursos. O script não deve armazenar ou registrar credenciais, cookies, tokens ou cabeçalhos.\n- A automação usa a UI real do site, especialmente Angular e seus eventos, em vez de presumir que um `click()` em texto decorativo seja suficiente.\n\n## Identificação de pasta\n\n- Uma pasta foi observada em `/questoes/pastas/{id}`; o exemplo usado foi `6423024`.\n- A página de filtros usa `https://www.tecconcursos.com.br/questoes/filtrar?idPasta={id}`.\n- O ID pode desaparecer ao navegar. Por isso ele deve ser salvo no estado da execução e usado para reconstruir a URL de filtros.\n- O ID da pasta não deve ser inferido de texto visual se já estiver disponível na URL, no estado persistido ou em um atributo de link.\n\n## Filtros de matéria e assunto\n\n- O painel observado mostra a área “Matéria e assunto”. Depois de uma busca, o cabeçalho pode aparecer como “Nome”; o reconhecimento deve considerar os dois estados.\n- A árvore usa itens com `.arvore-item-conteudo.arvore-borda` e `ng-click=\"vm.notificarClick()\"`. O `span.arvore-item-nome` é texto visual; o clique confiável deve ocorrer no contêiner Angular ou usar o fallback Angular validado pelos testes.\n- O assunto de exemplo foi `Coerência. Coesão (Anáfora, Catáfora, Uso dos Conectores - Pronomes Relativos, Conjunções, etc)`.\n- O nome do caderno deve ser o título do plano, por exemplo `Coesão textual - Conectivos básicos`, e não o título da taxonomia do TecConcursos.\n- A seleção de banca é feita clicando no item real da árvore. O nome observado para a banca foi `OBJETIVA CONCURSOS`; outros nomes devem ser resolvidos pelo texto real exibido pelo site.\n- Os anos devem ser selecionados clicando nos itens da árvore. Não se deve apenas escrever o ano em um campo, porque a seleção precisa atualizar o estado Angular do filtro.\n- Critérios solicitados pelo plano: anos `2016` a `2026` conforme a lista configurada, remover questões desatualizadas e remover questões anuladas.\n- O contador de resultados aparece em um `strong.ng-binding`; ele deve ser lido depois que os filtros terminarem de carregar, nunca imediatamente após o clique.\n\n## Criação do caderno\n\n- O campo do nome observado foi `#nomeCadernoId`, com `ng-model=\"vm.nomeCaderno\"` e `ng-model-options=\"{ updateOn: 'blur' }\"`.\n- O procedimento confiável é clicar, preencher, disparar `input`/`change` quando necessário e disparar `blur` para sincronizar o `ng-model`.\n- O botão observado foi `button[ng-click=\"vm.gerarCaderno()\"]`; ele fica desabilitado quando não há nome, filtros ou questões.\n- O estado deve registrar o índice e o título do MAT antes de navegar para o caderno criado.\n\n## Impressão e divisão em partes\n\n- A aba de impressão observada usa `div[role=\"button\"].aba-navegacao` com ícone `glyphicon-print` e texto `Imprimir`.\n- O botão final observado foi `button#confirmar-button` com texto `Imprimir Caderno`.\n- O site limita cada saída a no máximo 200 questões.\n- A primeira parte começa em `1`; as seguintes usam `201`, `401`, `601` e assim por diante, conforme a quantidade encontrada.\n- O campo observado foi `#questaoInicialInput`, cujo `max` é dinâmico.\n- A automação deve persistir o intervalo antes de clicar, salvar somente depois de extrair questões válidas e avançar de forma idempotente.\n- A página pode carregar o HTML das questões gradualmente via AJAX. “Nenhuma questão no primeiro instante” é estado de espera; ausência definitiva depois do timeout é erro diagnosticável.\n- O site também pode chamar `window.print()`. O userscript bloqueia a janela nativa de impressão na página de saída para evitar que o diálogo Ctrl+P interrompa o fluxo.\n\n## Extração e biblioteca local\n\n- O HTML da página de impressão é a fonte observada para enunciado, alternativas e metadados como banca, ano, órgão, cargo e vaga.\n- As partes são consolidadas por identificador/número original; repetir uma parte não pode duplicar questões.\n- A Biblioteca TC organiza os resultados por grupo do plano e permite baixar Excel e HTML.\n- O Excel é XLSX real, com cabeçalhos, linhas de questões, metadados e autofiltro.\n- O HTML interativo mantém respostas, alternativas anuladas por duplo clique, salto para questão, filtros e histórico no `localStorage` do próprio documento. A reabertura deve hidratar o estado; reiniciar é uma ação explícita.\n- Exportações e logs devem omitir segredos e não devem enviar dados para serviço externo.\n\n## Estado, retomada e concorrência\n\nEstados operacionais usados pelo projeto: `idle`, `creating-caderno`, `opening-print`, `loading-output`, `waiting-questions`, `extracting`, `saving`, `paused`, `error` e `completed`.\n\nEventos importantes registram horário, `runId`, aba, fase, caderno, parte, intervalo, quantidade esperada/encontrada, URL, ação, erro e snapshot resumido.\n\n- A execução possui `runId` e `ownerId` por aba.\n- O lock usa lease, heartbeat, renovação, liberação e takeover explícito quando obsoleto.\n- Uma aba sem o lease não deve pausar, retomar ou imprimir a execução de outra aba.\n- O estado persistido deve preservar partes concluídas, próximo intervalo, índice do MAT, URL de filtros e diagnóstico do erro.\n- Em 23/07/2026, o log mostrou que os botões Pausar/Retomar eram executados, mas Retomar não tinha uma transição quando a página estava em `/questoes/pastas/{id}`. A correção passou a registrar `opening-filter` e reabrir a `filterUrl` salva antes de continuar.\n\n## Diagnóstico de falhas\n\nMensagens e logs devem distinguir:\n\n1. seletor ausente ou página errada;\n2. elemento presente, mas evento Angular não aplicado;\n3. contador ainda carregando;\n4. impressão nativa interceptada ou popup/dialog bloqueador;\n5. página de saída sem questões depois do timeout;\n6. lock de outra aba;\n7. estado corrompido ou sem URL de retomada.\n\nUm log detalhado deve permitir saber exatamente em qual URL, MAT, parte, intervalo e fase a execução parou. Eventos antigos podem permanecer no histórico; a UI deve destacar a atividade mais recente.\n\n## Regras para futuras alterações\n\n- Antes de alterar seletores, capturar novamente o HTML e confirmar o comportamento Angular.\n- Não substituir cliques de itens da árvore por preenchimento textual sem validar que o modelo Angular foi atualizado.\n- Não remover a persistência de `folderId`, `filterUrl`, partes concluídas, lease ou histórico.\n- Toda correção de fluxo deve incluir um teste de regressão e, quando possível, um teste E2E local com carregamento lento.\n- O teste local simula o TecConcursos; ele não prova que o site real não mudou. Uma execução supervisionada real continua necessária antes de uma bateria longa.\n- Não publicar mudanças no userscript sem regenerar o bundle, executar `npm run check` e conferir a versão/URL de atualização.\n\n## Verificação do projeto\n\nComando principal não interativo:\n\n```powershell\nnpm run check\n```\n\nTestes de fluxo real:\n\n```powershell\nnpm run test:e2e\n```\n\nO bundle publicado usa a URL raw:\n\n`https://raw.githubusercontent.com/YsraEstudos/Tecconcursos/main/tecconcursos-scraper.user.js`\n";
  var content = embeddedContent;
  if (embeddedContent === "__TEC_AI_CONTEXT__" && typeof module !== "undefined" && module.exports) {
    try {
      content = require("node:fs").readFileSync(require("node:path").join(__dirname, "AI_CONTEXT.md"), "utf8");
    } catch (_) {}
  }

  return {
    getText: function () { return content; }
  };
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
            status("Questão #" + result.question.id + " salva, mas a API não retornou o gabarito: " + result.answerError.message);
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

// ---- library-ui.cjs ----
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) {
    root.TecConcursosModules = root.TecConcursosModules || {};
    root.TecConcursosModules.libraryUi = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function button(documentNode, label, className) {
    var item = documentNode.createElement("button");
    item.type = "button";
    item.textContent = label;
    item.className = className || "";
    return item;
  }

  function createPanel(documentNode, handlers) {
    if (documentNode.getElementById("tec-library-panel")) return null;
    var config = handlers || {};
    var style = documentNode.createElement("style");
    style.textContent = "#tec-library-launcher{position:fixed;left:18px;bottom:18px;z-index:2147483646;border:0;border-radius:999px;background:#1d4ed8;color:#fff;padding:12px 16px;font:700 14px system-ui;box-shadow:0 8px 22px #1e3a8a66;cursor:pointer}#tec-library-panel{position:fixed;left:18px;bottom:18px;z-index:2147483647;width:min(460px,calc(100vw - 36px));max-height:min(720px,calc(100vh - 36px));display:none;flex-direction:column;overflow:hidden;border-radius:16px;background:#f8fafc;color:#172554;box-shadow:0 18px 55px #0f172a55;font:14px system-ui}#tec-library-panel.open{display:flex}#tec-library-panel .head{display:flex;align-items:center;gap:10px;padding:15px 16px;background:linear-gradient(135deg,#1d4ed8,#0f766e);color:#fff}#tec-library-panel .head strong{font-size:16px}#tec-library-panel .head button{margin-left:auto;border:0;background:#ffffff22;color:#fff;border-radius:8px;padding:6px 9px;cursor:pointer}#tec-library-panel .tabs{display:flex;gap:5px;padding:10px 12px;border-bottom:1px solid #dbeafe;background:#fff;overflow-x:auto}#tec-library-panel .tabs button{border:0;border-radius:7px;background:#eff6ff;color:#1e3a8a;padding:7px 10px;cursor:pointer;font-weight:700;white-space:nowrap}#tec-library-panel .tabs button.active{background:#1d4ed8;color:#fff}#tec-library-panel .body{overflow:auto;padding:14px 16px}#tec-library-panel label{display:block;margin:8px 0 4px;font-weight:700}#tec-library-panel textarea,#tec-library-panel input{width:100%;box-sizing:border-box;border:1px solid #bfdbfe;border-radius:8px;padding:8px;font:13px ui-monospace,Consolas,monospace}#tec-library-panel textarea{min-height:106px;resize:vertical}#tec-library-panel .actions{display:flex;gap:7px;flex-wrap:wrap;margin:12px 0}#tec-library-panel .actions button,#tec-library-panel .entry-actions button{border:0;border-radius:8px;background:#1d4ed8;color:#fff;padding:8px 10px;font-weight:700;cursor:pointer}#tec-library-panel .actions button.secondary,#tec-library-panel .entry-actions button.secondary{background:#475569}#tec-library-panel .actions button.danger,#tec-library-panel .entry-actions button.danger{background:#b91c1c}#tec-library-panel .status{min-height:36px;color:#0f766e;font-size:13px;line-height:1.35}#tec-library-panel .hint{padding:10px;border-radius:9px;background:#eff6ff;color:#1e3a8a;font-size:13px;line-height:1.4}#tec-library-panel details{margin:8px 0;border:1px solid #dbeafe;border-radius:9px;background:#fff}#tec-library-panel summary{cursor:pointer;padding:9px 10px;font-weight:700}#tec-library-panel .entry{padding:8px 10px;border-top:1px solid #eff6ff}#tec-library-panel .entry button.entry-open{border:0;background:transparent;color:#1d4ed8;padding:0;text-align:left;font:700 13px system-ui;cursor:pointer}#tec-library-panel .entry small{display:block;margin-top:3px;color:#64748b}#tec-library-panel .entry-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}#tec-library-panel .entry-actions button{font-size:12px;padding:6px 8px}#tec-library-panel .ai-context{margin:0;max-height:500px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;border:1px solid #dbeafe;border-radius:9px;background:#fff;color:#0f172a;padding:12px;font:12px/1.5 ui-monospace,Consolas,monospace}#tec-library-panel .ai-context-actions{display:flex;gap:7px;align-items:center;flex-wrap:wrap;margin:10px 0}";
    documentNode.head.appendChild(style);

    var launcher = button(documentNode, "", "");
    launcher.id = "tec-library-launcher";
    var launcherLabel = documentNode.createElement("span");
    launcherLabel.textContent = "Biblioteca TC";
    var launcherStatus = documentNode.createElement("small");
    launcherStatus.style.marginLeft = "8px";
    launcherStatus.style.fontWeight = "700";
    launcherStatus.style.opacity = "0.92";
    launcher.appendChild(launcherLabel);
    launcher.appendChild(launcherStatus);
    var panel = documentNode.createElement("section");
    panel.id = "tec-library-panel";
    panel.dataset.tecScraperVersion = "2.5.13";
    launcher.dataset.tecScraperVersion = "2.5.13";
    panel.innerHTML = "<div class=\"head\"><strong>Biblioteca de Cadernos <small>v2.5.13</small></strong><button type=\"button\" data-action=\"close\">Fechar</button></div><div class=\"tabs\"><button type=\"button\" class=\"active\" data-tab=\"automation\">Automação</button><button type=\"button\" data-tab=\"library\">Pastas e arquivos</button><button type=\"button\" data-tab=\"ai-context\">AI Context</button></div><div class=\"body\"></div>";
    documentNode.body.appendChild(launcher);
    documentNode.body.appendChild(panel);
    var body = panel.querySelector(".body");
    var activeTab = "automation";

    function progressSnapshot() {
      return typeof config.getProgress === "function" ? (config.getProgress() || {}) : {};
    }

    function progressLabel(progress) {
      if (progress.lockedByOtherTab) return "⏸ outra aba";
      if (progress.running) return progress.stale ? "⚠ sem atividade" : "● trabalhando";
      if (progress.phase === "error") return "✖ erro";
      if (progress.phase === "paused") return "Ⅱ pausado";
      if (progress.phase === "completed") return "✓ concluído";
      return "";
    }

    function progressDetails(progress) {
      var message = String(progress.message || (typeof config.getStatus === "function" ? config.getStatus() : "Pronto.") || "");
      var details = [];
      if (progress.running && progress.mattersTotal) details.push("caderno " + String((Number(progress.matterIndex) || 0) + 1) + "/" + progress.mattersTotal);
      if (progress.running && progress.rangesTotal) details.push("parte " + String((Number(progress.rangeIndex) || 0) + 1) + "/" + progress.rangesTotal);
      if (progress.updatedAt) {
        var time = new Date(progress.updatedAt);
        if (!Number.isNaN(time.getTime())) details.push("última atividade " + time.toLocaleTimeString("pt-BR"));
      }
      if (progress.events && progress.events.length) details.push(String(progress.events.length) + " eventos registrados");
      if (progress.stale) details.unshift("ATENÇÃO: sem atividade há " + Math.max(1, Math.floor((progress.ageMs || 0) / 1000)) + "s");
      if (progress.lockedByOtherTab) details.unshift("execução pertence a outra aba");
      return details.length ? message + " · " + details.join(" · ") : message;
    }

    function refreshProgress() {
      var progress = progressSnapshot();
      var label = progressLabel(progress);
      launcherStatus.textContent = label;
      launcher.title = progressDetails(progress);
      var progressNode = body.querySelector("#tec-progress");
      if (progressNode) {
        progressNode.textContent = progressDetails(progress);
        progressNode.style.color = progress.phase === "error" || progress.stale ? "#b91c1c" : progress.phase === "paused" ? "#92400e" : "#1e3a8a";
      }
    }

    function handleAutomationError(error) {
      if (config.onError) {
        try { config.onError(error); } catch (_) {}
      }
      setStatus(error && error.message || error, true);
      refreshProgress();
    }

    function setStatus(message, isError) {
      var node = body.querySelector(".status");
      if (!node) return;
      node.textContent = String(message || "");
      node.style.color = isError ? "#b91c1c" : "#0f766e";
      refreshProgress();
    }

    function automationView() {
      var plan = typeof config.getPlan === "function" ? config.getPlan() : { matters: [] };
      body.innerHTML = "<div class=\"hint\">Cole ou selecione o seu <code>Tecconcursos_Materias_Consolidado.md</code> (ou JSON). O plano fica salvo no script e cada MAT vira um caderno no TecConcursos.</div><label for=\"tec-plan-file\">Arquivo do plano</label><input id=\"tec-plan-file\" type=\"file\" accept=\".md,.txt,.json,text/plain,text/markdown,application/json\"><label for=\"tec-plan-input\">Plano de matérias</label><textarea id=\"tec-plan-input\" placeholder=\"MAT-001 — Coesão textual&#10;TecConcursos: 12507 — Língua Portuguesa ...\"></textarea><div class=\"actions\"><button type=\"button\" data-action=\"import\">Salvar plano</button></div><div class=\"hint\" id=\"tec-plan-summary\">Plano atual: " + String(plan.matters && plan.matters.length || 0) + " matéria(s), " + String(plan.banks && plan.banks.length || 0) + " banca(s) e " + String(plan.years && plan.years.length || 0) + " ano(s).</div><label for=\"tec-folder-id\">ID da pasta de destino no TecConcursos</label><input id=\"tec-folder-id\" value=\"" + String(typeof config.defaultFolderId === "function" ? config.defaultFolderId() : "") + "\" inputmode=\"numeric\"><div class=\"actions\"><button type=\"button\" data-action=\"create\">Criar e exportar plano</button><button type=\"button\" data-action=\"current\" class=\"secondary\">Exportar caderno atual</button><button type=\"button\" data-action=\"pause\" class=\"danger\">Pausar</button><button type=\"button\" data-action=\"resume\" class=\"secondary\">Retomar execução</button><button type=\"button\" data-action=\"takeover\" class=\"secondary\">Assumir execução</button><button type=\"button\" data-action=\"diagnostics\" class=\"secondary\">Baixar log detalhado</button></div><div class=\"hint\" id=\"tec-progress\"></div><div class=\"status\"></div>";
      var folderInput = body.querySelector("#tec-folder-id");
      folderInput.addEventListener("input", function () {
        if (config.onFolderIdChange) config.onFolderIdChange(folderInput.value);
      });
      setStatus(typeof config.getStatus === "function" ? config.getStatus() : "Pronto.", false);
      refreshProgress();
      body.querySelector("[data-action='import']").addEventListener("click", function () {
        try {
          var result = config.onImport && config.onImport(body.querySelector("#tec-plan-input").value);
          automationView();
          setStatus(result || "Plano salvo.", false);
        } catch (error) { setStatus(error.message || error, true); }
      });
      body.querySelector("#tec-plan-file").addEventListener("change", function (event) {
        var file = event.target.files && event.target.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function () { body.querySelector("#tec-plan-input").value = String(reader.result || ""); setStatus("Arquivo carregado. Clique em 'Salvar plano'.", false); };
        reader.onerror = function () { setStatus("Não foi possível ler o arquivo selecionado.", true); };
        reader.readAsText(file, "UTF-8");
      });
      body.querySelector("[data-action='create']").addEventListener("click", function () {
        try { Promise.resolve(config.onCreate && config.onCreate(body.querySelector("#tec-folder-id").value)).then(function (message) { setStatus(message || "Automação iniciada.", false); refreshProgress(); }).catch(handleAutomationError); } catch (error) { handleAutomationError(error); }
      });
      body.querySelector("[data-action='current']").addEventListener("click", function () {
        try { Promise.resolve(config.onCurrent && config.onCurrent()).then(function (message) { setStatus(message || "Exportação iniciada.", false); refreshProgress(); }).catch(handleAutomationError); } catch (error) { handleAutomationError(error); }
      });
      body.querySelector("[data-action='pause']").addEventListener("click", function () {
        try {
          Promise.resolve(config.onPause && config.onPause()).then(function (message) {
            setStatus(message || "Automação pausada. Você poderá retomar pela mesma tela.", false);
            refreshProgress();
          }).catch(handleAutomationError);
        } catch (error) { handleAutomationError(error); }
      });
      body.querySelector("[data-action='resume']").addEventListener("click", function () {
        try { Promise.resolve(config.onResume && config.onResume()).then(function (message) { setStatus(message || "Retomada solicitada.", false); refreshProgress(); }).catch(handleAutomationError); } catch (error) { handleAutomationError(error); }
      });
      body.querySelector("[data-action='takeover']").addEventListener("click", function () {
        try { Promise.resolve(config.onTakeover && config.onTakeover()).then(function (message) { setStatus(message || "Execução assumida.", false); refreshProgress(); }).catch(handleAutomationError); } catch (error) { handleAutomationError(error); }
      });
      body.querySelector("[data-action='diagnostics']").addEventListener("click", function () {
        try {
          var count = config.onDownloadDiagnostics ? config.onDownloadDiagnostics() : 0;
          setStatus("Log detalhado baixado com " + String(count || 0) + " eventos.", false);
        } catch (error) { setStatus(error.message || error, true); }
      });
    }

    function libraryView() {
      var entries = typeof config.listLibrary === "function" ? config.listLibrary() : [];
      var groups = entries.reduce(function (result, entry) {
        var group = entry.group || "Sem grupo";
        (result[group] = result[group] || []).push(entry);
        return result;
      }, {});
      body.innerHTML = "<div class=\"hint\">Os arquivos permanecem nesta biblioteca até você removê-los. Baixe Excel ou HTML interativo por caderno.</div><div class=\"hint\" id=\"tec-progress\"></div><div id=\"tec-library-tree\"></div><div class=\"status\"></div>";
      var tree = body.querySelector("#tec-library-tree");
      Object.keys(groups).sort(function (left, right) { return left.localeCompare(right, "pt-BR"); }).forEach(function (group) {
        var details = documentNode.createElement("details");
        details.open = true;
        var summary = documentNode.createElement("summary");
        summary.textContent = group + " (" + groups[group].length + ")";
        details.appendChild(summary);
        groups[group].forEach(function (entry) {
          var item = documentNode.createElement("div");
          item.className = "entry";
          var open = button(documentNode, entry.title || entry.code, "entry-open");
          open.addEventListener("click", function () { if (config.onSelect) config.onSelect(entry.id); });
          item.appendChild(open);
          var info = documentNode.createElement("small");
          info.textContent = String(entry.questions ? entry.questions.length : entry.totalQuestions || 0) + " questões · " + String(entry.parts ? entry.parts.length : 0) + " parte(s)";
          item.appendChild(info);
          var actions = documentNode.createElement("div");
          actions.className = "entry-actions";
          var xlsx = button(documentNode, "Excel", "");
          var html = button(documentNode, "HTML", "secondary");
          var remove = button(documentNode, "Remover", "danger");
          xlsx.addEventListener("click", function () { if (config.onDownloadXlsx) config.onDownloadXlsx(entry.id); });
          html.addEventListener("click", function () { if (config.onDownloadHtml) config.onDownloadHtml(entry.id); });
          remove.addEventListener("click", function () { if (config.onRemove) config.onRemove(entry.id); libraryView(); });
          [xlsx, html, remove].forEach(function (node) { actions.appendChild(node); });
          item.appendChild(actions);
          details.appendChild(item);
        });
        tree.appendChild(details);
      });
      if (!entries.length) tree.innerHTML = "<div class=\"empty\">Ainda não há cadernos exportados.</div>";
    }

    function aiContextView() {
      var contextText = String(config.aiContextText || "AI Context indisponível neste bundle.");
      body.innerHTML = "<div class=\"hint\">Contexto operacional e regras que orientam futuras alterações do userscript. O conteúdo é somente leitura e pode ser copiado.</div><div class=\"ai-context-actions\"><button type=\"button\" data-action=\"copy-ai-context\" class=\"secondary\">Copiar AI Context</button><span class=\"status\"></span></div><pre class=\"ai-context\" id=\"tec-ai-context-content\"></pre>";
      body.querySelector("#tec-ai-context-content").textContent = contextText;
      body.querySelector("[data-action='copy-ai-context']").addEventListener("click", function () {
        var statusMessage = body.querySelector(".status");
        var finish = function (message, isError) { statusMessage.textContent = message; statusMessage.style.color = isError ? "#b91c1c" : "#0f766e"; };
        if (documentNode.defaultView && documentNode.defaultView.navigator && documentNode.defaultView.navigator.clipboard && documentNode.defaultView.navigator.clipboard.writeText) {
          documentNode.defaultView.navigator.clipboard.writeText(contextText).then(function () { finish("AI Context copiado.", false); }).catch(function () { finish("Não foi possível acessar a área de transferência.", true); });
          return;
        }
        finish("Selecione e copie o texto manualmente.", false);
      });
    }

    function render() {
      Array.from(panel.querySelectorAll("[data-tab]")).forEach(function (tab) {
        tab.classList.toggle("active", tab.getAttribute("data-tab") === activeTab);
      });
      if (activeTab === "library") libraryView(); else if (activeTab === "ai-context") aiContextView(); else automationView();
      refreshProgress();
    }
    launcher.addEventListener("click", function () { panel.classList.add("open"); launcher.style.display = "none"; render(); });
    panel.querySelector("[data-action='close']").addEventListener("click", function () { panel.classList.remove("open"); launcher.style.display = "block"; });
    Array.from(panel.querySelectorAll("[data-tab]")).forEach(function (tab) {
      tab.addEventListener("click", function () { activeTab = tab.getAttribute("data-tab"); render(); });
    });
    if (typeof setInterval === "function") setInterval(refreshProgress, 1000);
    refreshProgress();
    return { panel: panel, open: function () { panel.classList.add("open"); launcher.style.display = "none"; render(); }, refresh: render, setStatus: setStatus };
  }

  return { createPanel: createPanel };
});

// ---- entry.cjs ----
(function (root) {
  "use strict";

  function suppressNativePrintOnOutputPage(rootNode) {
    var path = String(rootNode.location && rootNode.location.pathname || "");
    if (!/\/questoes\/cadernos\/\d+\/imprimir/i.test(path)) return false;
    var pageWindow = typeof unsafeWindow !== "undefined" ? unsafeWindow : rootNode;
    var blockedPrint = function () { return undefined; };
    try { pageWindow.print = blockedPrint; } catch (_) {}

    // Tampermonkey pode executar o userscript em um mundo isolado. Este
    // pequeno script instala o mesmo bloqueio no mundo da página antes que
    // js/common/imprimir.js possa chamar window.print().
    var documentNode = rootNode.document;
    if (documentNode && documentNode.createElement && documentNode.documentElement) {
      try {
        var bridge = documentNode.createElement("script");
        bridge.textContent = "(function(){var blocked=function(){return undefined;};try{Object.defineProperty(window,'print',{configurable:true,writable:true,value:blocked});}catch(_){window.print=blocked;}})();";
        documentNode.documentElement.appendChild(bridge);
        bridge.remove();
      } catch (_) {}
    }
    return true;
  }

  function start() {
    var modules = root.TecConcursosModules;
    var documentNode = root.document;
    if (!modules || !documentNode || !documentNode.body) return;
    if (!modules.selectors.isSupportedPage(root.location)) return;

    var storage = modules.storage.createStorage(root);
    var pageKind = modules.selectors.getPageKind(root.location);
    if ((pageKind === "caderno" || pageKind === "filtro") && !documentNode.getElementById("tec-scraper-panel")) {
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

    if (!modules.library || !modules.automation || !modules.libraryUi || documentNode.getElementById("tec-library-panel")) return;
    var library = modules.library.createLibrary(storage);
    var automation = modules.automation.createAutomation({ root: root, document: documentNode, storage: storage, library: library });
    var libraryUi = modules.libraryUi.createPanel(documentNode, {
      aiContextText: modules.aiContext && modules.aiContext.getText ? modules.aiContext.getText() : "",
      getPlan: automation.readPlan,
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
      onCreate: function (folderId) {
        if (root.confirm && !root.confirm("Criar cadernos e iniciar a exportação do plano? O processo poderá ser pausado e retomado.")) return "Operação cancelada.";
        return automation.startCreation(folderId);
      },
      onCurrent: function () {
        if (root.confirm && !root.confirm("Exportar este caderno para a biblioteca local?")) return "Operação cancelada.";
        return automation.startCurrentCaderno();
      },
      onPause: automation.pause,
      onResume: automation.resumePaused,
      onTakeover: automation.takeover,
      onError: automation.fail,
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
        modules.library.downloadBlob(documentNode, modules.library.outputBaseName(entry) + ".xlsx", modules.library.buildXlsxBlob(entry));
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
    root.setTimeout(function () {
      Promise.resolve(automation.resume()).then(function (message) {
        if (libraryUi) libraryUi.setStatus(message || automation.status(), false);
      }).catch(function (error) {
        automation.fail(error);
        if (libraryUi) libraryUi.setStatus("Falha na automação: " + String(error && error.message || error), true);
      });
    }, 300);
  }

  suppressNativePrintOnOutputPage(root);
  if (root.document && root.document.readyState === "loading") {
    root.document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    root.setTimeout(start, 0);
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
})();
