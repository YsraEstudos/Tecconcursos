// ==UserScript==
// @name         TecConcursos - Coletor de Questões Pro
// @namespace    https://github.com/YsraEstudos/Tecconcursos
// @version      2.7.3
// @description  Coleta questões e cria/exporta cadernos para uma biblioteca local com Excel e HTML interativo.
// @author       Codex
// @match        https://www.tecconcursos.com.br/*
// @match        https://tecconcursos.com.br/*
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
// @grant        GM_listValues
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @grant        GM_addElement
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

// ---- gabarito.cjs ----
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) {
    root.TecConcursosModules = root.TecConcursosModules || {};
    root.TecConcursosModules.gabarito = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var RESPOSTA_SPAN = /<span[^>]*class=["'][^"']*\bresposta\b[^"']*["'][^>]*>\s*(?:<strong[^>]*>\s*(\d+)\s*[)]\s*<\/strong>\s*)?([^<]+?)\s*<\/span>/gi;
  var GABARITO_DIV = /<div\b[^>]*\bid=["']gabarito["'][^>]*>/gi;

  function getCadernoId(documentNode) {
    var locationLike = documentNode && documentNode.location;
    var pathname = locationLike && locationLike.pathname ? String(locationLike.pathname) : "";
    var match = pathname.match(/\/questoes\/cadernos\/(\d+)/i);
    return match ? match[1] : "";
  }

  function extractGabaritoBlockAt(html, start) {
    var depth = 0;
    var i = start;
    while (i < html.length) {
      var open = html.indexOf("<div", i);
      var close = html.indexOf("</div", i);
      var next = open === -1 ? close : close === -1 ? open : Math.min(open, close);
      if (next < 0) break;
      if (next === open) {
        depth += 1;
        i = open + 4;
      } else {
        depth -= 1;
        i = close + 5;
        if (depth <= 0) return html.slice(start, i);
      }
    }
    return html.slice(start);
  }

  function extractGabaritoBlocks(html) {
    var text = String(html || "");
    var blocks = [];
    var lastEnd = 0;
    var divRe = new RegExp(GABARITO_DIV.source, GABARITO_DIV.flags);
    var match;
    while ((match = divRe.exec(text)) !== null) {
      if (match.index < lastEnd) continue;
      var block = extractGabaritoBlockAt(text, match.index);
      blocks.push(block);
      lastEnd = match.index + block.length;
      divRe.lastIndex = lastEnd;
    }
    return blocks;
  }

  function parseGabaritoHtml(html) {
    var blocks = extractGabaritoBlocks(html);
    var entries = [];
    for (var b = 0; b < blocks.length; b += 1) {
      var re = new RegExp(RESPOSTA_SPAN.source, RESPOSTA_SPAN.flags);
      var match;
      while ((match = re.exec(blocks[b])) !== null) {
        var answer = String(match[2] || "").replace(/&nbsp;/g, " ").trim();
        if (!answer) continue;
        entries.push({
          index: match[1] ? Number(match[1]) : 0,
          answer: answer
        });
      }
    }
    return entries;
  }

  function parseGabaritoDocument(documentNode) {
    if (!documentNode || typeof documentNode.querySelectorAll !== "function") return [];
    var entries = [];
    var nodes = documentNode.querySelectorAll("#gabarito .resposta");
    for (var i = 0; i < nodes.length; i += 1) {
      var node = nodes[i];
      var numberNode = node.querySelector ? node.querySelector("strong") : null;
      var rawNumber = numberNode ? String(numberNode.textContent || "") : "";
      var index = Number(rawNumber.replace(/[^\d]/g, ""));
      var answer = String(node.textContent || "").replace(/^\s*\d+\s*\)\s*/, "").trim();
      if (!index || !answer) continue;
      entries.push({ index: index, answer: answer });
    }
    return entries;
  }

  function applyToQuestions(questions, entries) {
    var list = Array.isArray(questions) ? questions : [];
    var byIndex = {};
    (Array.isArray(entries) ? entries : []).forEach(function (entry) {
      var index = Number(entry && entry.index);
      if (index > 0 && entry.answer) byIndex[index] = String(entry.answer).trim();
    });
    var applied = 0;
    var updated = list.map(function (question) {
      if (!question || question.gabarito) return question;
      var index = Number(question.cadernoIndex);
      var answer = byIndex[index];
      if (!index || !answer) return question;
      applied += 1;
      return Object.assign({}, question, {
        gabarito: answer,
        answerField: "gabarito",
        answerSource: "print-page"
      });
    });
    return { questions: updated, applied: applied };
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

  function printUrl(cadernoId, count) {
    var url = "/questoes/cadernos/" + encodeURIComponent(cadernoId) + "/imprimir";
    if (Number(count) > 0) {
      url += "?questaoInicial=1&numeroQuestoes=" + encodeURIComponent(count);
    }
    return url;
  }

  async function fetchCadernoGabarito(documentNode, options) {
    var config = options || {};
    var cadernoId = config.cadernoId || getCadernoId(documentNode);
    if (!cadernoId) throw new Error("ID do caderno não encontrado.");

    var fetchImpl = getFetch(documentNode, config.fetchImpl);
    var retryCount = Number(config.retryCount) > 0 ? Math.floor(Number(config.retryCount)) : 3;
    var retryDelayMs = Number(config.retryDelayMs) >= 0 ? Number(config.retryDelayMs) : 1000;
    var urls = [printUrl(cadernoId, 0)];
    if (Number(config.count) > 0) urls.push(printUrl(cadernoId, Number(config.count)));
    var lastError = null;

    for (var u = 0; u < urls.length; u += 1) {
      for (var attempt = 1; attempt <= retryCount; attempt += 1) {
        try {
          var response = await fetchImpl(urls[u], {
            credentials: "include",
            headers: {
              "Accept": "text/html, application/xhtml+xml, */*",
              "X-Requested-With": "XMLHttpRequest"
            }
          });
          if (!response || !response.ok) {
            throw new Error("HTTP " + (response && response.status ? response.status : "desconhecido"));
          }
          var payload = await response.text();
          var parsed = parseGabaritoHtml(payload);
          if (!parsed.length && payload && typeof payload.querySelectorAll === "function") {
            parsed = parseGabaritoDocument(payload);
          }
          if (parsed.length) return parsed;
          lastError = new Error("A página de impressão não exibiu o bloco de gabarito.");
          break;
        } catch (error) {
          lastError = error;
          if (attempt < retryCount) await wait(retryDelayMs * attempt, config.waitImpl);
        }
      }
    }
    throw lastError || new Error("Não foi possível consultar o gabarito do caderno.");
  }

  return {
    getCadernoId: getCadernoId,
    parseGabaritoHtml: parseGabaritoHtml,
    parseGabaritoDocument: parseGabaritoDocument,
    applyToQuestions: applyToQuestions,
    fetchCadernoGabarito: fetchCadernoGabarito
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

  function extractQuestionIdentity(documentNode) {
    var rootNode = selectors.findQuestionRoot(documentNode);
    return rootNode ? extractQuestionId(rootNode, null) : "";
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
    extractQuestionIdentity: extractQuestionIdentity,
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
    var usesGM = hasGet || hasSet || hasDelete || typeof runtime.GM_listValues === "function";
    var local = runtime.localStorage;
    var maxWriteChars = 40 * 1024 * 1024;

    function serializedLength(value) {
      try {
        if (value == null) return 0;
        if (typeof value === "string") return value.length;
        if (typeof value === "number" || typeof value === "boolean") return String(value).length;
        return JSON.stringify(value).length;
      } catch (_) {
        return 0;
      }
    }

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
      if (serializedLength(value) > maxWriteChars) return false;
      if (hasSet) {
        try {
          runtime.GM_setValue(key, value);
          return true;
        } catch (_) {
          return false;
        }
      }
      if (local && local.setItem) {
        try {
          local.setItem(key, JSON.stringify(value));
          return true;
        } catch (_) {
          return false;
        }
      }
      return false;
    }

    function remove(key) {
      if (hasDelete) {
        try {
          runtime.GM_deleteValue(key);
          return;
        } catch (_) {
          return;
        }
      }
      if (local && local.removeItem) {
        try {
          local.removeItem(key);
        } catch (_) {}
      }
    }

    function list() {
      if (typeof runtime.GM_listValues === "function") {
        try {
          return runtime.GM_listValues();
        } catch (_) {}
      }
      var keys = [];
      try {
        if (local && local.length) {
          for (var index = 0; index < local.length; index += 1) {
            keys.push(local.key(index));
          }
        }
      } catch (_) {}
      return keys;
    }

    return { read: read, write: write, remove: remove, list: list, usesGM: usesGM };
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

  function serializePlan(plan) {
    var normalized = normalizePlan(plan);
    var lines = [];
    var currentGroup = null;
    normalized.matters.forEach(function (matter) {
      var group = matter.group || "Sem grupo";
      if (group !== currentGroup && group !== "Sem grupo") {
        lines.push(group);
        currentGroup = group;
      }
      lines.push(matter.code + " — " + matter.title);
      (matter.subjectIds || []).forEach(function (id, index) {
        var path = matter.subjectPaths && matter.subjectPaths[index];
        if (path) lines.push("TecConcursos: " + id + " — " + path);
      });
    });
    return lines.join("\n") + "\n";
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
    serializePlan: serializePlan,
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
  var COMMAND_KEY = "tecconcursos_caderno_automation_command_v1";
  var LOCK_LEASE_MS = 30000;
  var LOCK_HEARTBEAT_MS = 10000;

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
    var handledCommandIds = [];
    var onPauseRequest = typeof config.onPauseRequest === "function" ? config.onPauseRequest : null;

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

    function commandId(message) {
      return String(message && (message.requestId || message.sentAt) || "");
    }

    function handlePauseRequest(message) {
      if (!message || message.type !== "pause-request") return;
      if (message.source === ownerId || message.targetOwnerId && message.targetOwnerId !== ownerId) return;
      var id = commandId(message);
      if (id && handledCommandIds.indexOf(id) >= 0) return;
      if (id) {
        handledCommandIds.push(id);
        if (handledCommandIds.length > 20) handledCommandIds.shift();
      }
      if (onPauseRequest) {
        try { onPauseRequest(message); } catch (_) {}
      }
    }

    function handleSyncMessage(event) {
      var message = event && event.data ? event.data : event;
      if (!message || message.source === ownerId) return;
      if (message.type === "lock-claim" || message.type === "lock-renew" || message.type === "lock-reassert") {
        reconcileRemoteLock(parseLock(message.lock));
      } else if (message.type === "pause-request") {
        handlePauseRequest(message);
      } else if (message.type === "lock-release" && remoteConflict && sameClaim(remoteConflict, parseLock(message.lock))) {
        remoteConflict = null;
      }
    }

    function handleStorageEvent(event) {
      if (!event) return;
      if (event.key === COMMAND_KEY) {
        try { handlePauseRequest(parseLock(event.newValue)); } catch (_) {}
        return;
      }
      if (event.key !== LOCK_KEY) return;
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

    function requestPause(state, source) {
      var current = effectiveLock(readLock());
      if (!current || !lockIsActive(current)) return false;
      var request = {
        version: 1,
        type: "pause-request",
        requestId: uniqueId("pause"),
        source: ownerId,
        targetOwnerId: current.ownerId,
        runId: state && state.runId || current.runId || "",
        sourceLabel: String(source || "manual"),
        sentAt: Date.now()
      };
      broadcast(request);
      var local = null;
      try { local = rootNode && rootNode.localStorage; } catch (_) {}
      if (local && typeof local.setItem === "function") {
        try {
          local.setItem(COMMAND_KEY, JSON.stringify(request));
          var clear = rootNode && rootNode.setTimeout || (typeof setTimeout === "function" ? setTimeout : null);
          if (clear) clear(function () { try { local.removeItem(COMMAND_KEY); } catch (_) {} }, 0);
        } catch (_) {}
      }
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
      requestPause: requestPause,
      lockInfo: lockInfo,
      stopHeartbeat: stopHeartbeat,
      destroy: function () { stopHeartbeat(); stopSynchronization(); }
    };
  }

  return {
    LOCK_KEY: LOCK_KEY,
    COMMAND_KEY: COMMAND_KEY,
    OWNER_SESSION_KEY: OWNER_SESSION_KEY,
    SYNC_CHANNEL_NAME: SYNC_CHANNEL_NAME,
    LOCK_LEASE_MS: LOCK_LEASE_MS,
    LOCK_HEARTBEAT_MS: LOCK_HEARTBEAT_MS,
    executionOwnerId: executionOwnerId,
    createLockManager: createLockManager
  };
});

// ---- automation-activity.cjs ----
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) {
    root.TecConcursosModules = root.TecConcursosModules || {};
    root.TecConcursosModules.automationActivity = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function isPageHidden(documentNode) {
    return Boolean(documentNode && (documentNode.hidden === true || documentNode.visibilityState === "hidden"));
  }

  function createInactivityMonitor(options) {
    var config = options || {};
    var rootNode = config.root || {};
    var documentNode = config.document;
    var timeoutMs = Math.max(1000, Math.floor(Number(config.timeoutMs) || 60000));
    var onInactive = typeof config.onInactive === "function" ? config.onInactive : function () {};
    var timer = null;
    var started = false;
    var set = rootNode.setTimeout || (typeof setTimeout === "function" ? setTimeout : null);
    var clear = rootNode.clearTimeout || (typeof clearTimeout === "function" ? clearTimeout : null);

    function cancel() {
      if (timer != null && clear) clear(timer);
      timer = null;
    }

    function schedule() {
      if (!started || timer != null || !set || !isPageHidden(documentNode)) return;
      timer = set(function () {
        timer = null;
        if (started && isPageHidden(documentNode)) onInactive();
      }, timeoutMs);
      if (timer && typeof timer.unref === "function") timer.unref();
    }

    function onVisibilityChange() {
      if (isPageHidden(documentNode)) schedule();
      else cancel();
    }

    function start() {
      if (started) return true;
      started = true;
      if (documentNode && typeof documentNode.addEventListener === "function") documentNode.addEventListener("visibilitychange", onVisibilityChange);
      onVisibilityChange();
      return true;
    }

    function stop() {
      if (!started) return false;
      started = false;
      cancel();
      if (documentNode && typeof documentNode.removeEventListener === "function") documentNode.removeEventListener("visibilitychange", onVisibilityChange);
      return true;
    }

    return { start: start, stop: stop, cancel: cancel, isStarted: function () { return started; } };
  }

  return {
    isPageHidden: isPageHidden,
    createInactivityMonitor: createInactivityMonitor
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
      var timer = setTimeout(function () {
        clearInterval(cancelTimer);
        resolve(true);
      }, duration);
      var cancelTimer = setInterval(function () {
        if (cancelled()) {
          clearInterval(cancelTimer);
          clearTimeout(timer);
          resolve(false);
        }
      }, 500);
    });
  }

  return { randomInt: randomInt, sleep: sleep };
});

// ---- library.cjs ----
(function (root, factory) {
  var api = factory(
    typeof module !== "undefined" && module.exports
      ? { gabarito: require("./gabarito.cjs") }
      : { gabarito: root.TecConcursosModules.gabarito }
  );
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) {
    root.TecConcursosModules = root.TecConcursosModules || {};
    root.TecConcursosModules.library = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (deps) {
  "use strict";

  var gabaritoModule = deps && deps.gabarito;
  var LEGACY_KEY = "tecconcursos_export_library_v1";
  var INDEX_KEY = "tecconcursos_export_library_index_v1";
  var LEGACY_CLEANUP_KEY = "tecconcursos_export_library_legacy_cleanup_v1";
  var LIBRARY_ENTRY_PREFIX = "tecconcursos_export_library_entry_v1:";

  function entryStorageKey(id) {
    return LIBRARY_ENTRY_PREFIX + String(id);
  }

  function entryMetadata(entry) {
    var metadata = Object.assign({}, entry);
    metadata.questionCount = Array.isArray(entry && entry.questions) ? entry.questions.length : Number(metadata.questionCount) || 0;
    delete metadata.questions;
    return metadata;
  }

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

  function resolveUrl(value, baseUrl) {
    var raw = String(value == null ? "" : value).trim();
    if (!raw || /^(?:data|blob|https?|file):/i.test(raw)) return raw;
    try { return new URL(raw, baseUrl || "").href; } catch (_) { return raw; }
  }

  function normalizeImageAttributes(html, baseUrl) {
    return String(html == null ? "" : html).replace(/\b(src|data-src)\s*=\s*(["'])(.*?)\2/gi, function (_, name, quote, value) {
      return name + "=" + quote + resolveUrl(value, baseUrl) + quote;
    });
  }

  function serializeHtmlWithAbsoluteImages(node) {
    if (!node) return "";
    var baseUrl = node.baseURI || (node.ownerDocument && node.ownerDocument.baseURI) || "";
    if (typeof node.cloneNode === "function") {
      var clone = node.cloneNode(true);
      if (clone && typeof clone.querySelectorAll === "function") {
        Array.from(clone.querySelectorAll("img")).forEach(function (image) {
          var source = image.getAttribute("data-tec-original-src") || image.currentSrc || image.getAttribute("src") || image.getAttribute("data-src") || "";
          var resolved = resolveUrl(source, baseUrl);
          if (resolved) image.setAttribute("src", resolved);
          var srcset = image.getAttribute("data-tec-original-srcset") || image.getAttribute("srcset");
          if (srcset) {
            image.setAttribute("srcset", srcset.split(",").map(function (candidate) {
              var pieces = candidate.trim().split(/\s+/);
              pieces[0] = resolveUrl(pieces[0], baseUrl);
              return pieces.join(" ");
            }).join(", "));
          }
        });
      }
      if (typeof clone.innerHTML === "string") return sanitizeHtml(clone.innerHTML);
    }
    return sanitizeHtml(normalizeImageAttributes(node.innerHTML, baseUrl));
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
      html: serializeHtmlWithAbsoluteImages(node)
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
      statementHtml: serializeHtmlWithAbsoluteImages(statement),
      options: alternatives,
      answer: clean(answerNode && (answerNode.innerText || answerNode.textContent))
    };
  }

  function applyGabaritoBlock(questions, documentNode) {
    if (!questions.length || !gabaritoModule || typeof gabaritoModule.parseGabaritoDocument !== "function") return questions;
    var entries = gabaritoModule.parseGabaritoDocument(documentNode);
    if (!entries.length) return questions;
    var byNumber = {};
    entries.forEach(function (entry) {
      if (entry.index > 0 && entry.answer) byNumber[entry.index] = String(entry.answer).trim();
    });
    return questions.map(function (question) {
      var answer = question.answer || byNumber[Number(question.number)];
      if (!answer || answer === question.answer) return question;
      return Object.assign({}, question, {
        answer: answer,
        answerField: "gabarito",
        answerSource: "print-page"
      });
    });
  }

  function extractPrintedQuestions(documentNode) {
    if (!documentNode || typeof documentNode.querySelectorAll !== "function") return [];
    return applyGabaritoBlock(Array.from(documentNode.querySelectorAll(".questao")).map(parsePrintedQuestion), documentNode);
  }

  function yieldToBrowser(documentNode) {
    var view = documentNode && documentNode.defaultView;
    var schedule = view && typeof view.setTimeout === "function"
      ? view.setTimeout.bind(view)
      : typeof setTimeout === "function" ? setTimeout : null;
    if (!schedule) return Promise.resolve();
    return new Promise(function (resolve) { schedule(resolve, 0); });
  }

  async function extractPrintedQuestionsAsync(documentNode, options) {
    if (!documentNode || typeof documentNode.querySelectorAll !== "function") return [];
    var config = options || {};
    var nodes = Array.from(documentNode.querySelectorAll(".questao"));
    var chunkSize = Math.max(1, Number(config.chunkSize) || 5);
    var pauseCheck = typeof config.ensureRunning === "function" ? config.ensureRunning : function () {};
    var yieldControl = typeof config.yieldToBrowser === "function" ? config.yieldToBrowser : function () { return yieldToBrowser(documentNode); };
    var questions = [];
    for (var start = 0; start < nodes.length; start += chunkSize) {
      pauseCheck();
      var end = Math.min(nodes.length, start + chunkSize);
      for (var index = start; index < end; index += 1) questions.push(parsePrintedQuestion(nodes[index], index));
      if (end < nodes.length) {
        await yieldControl();
        pauseCheck();
      }
    }
    return applyGabaritoBlock(questions, documentNode);
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

  var SLIM_CHARS = 32 * 1024 * 1024;

  function stripDataUriImages(html) {
    return String(html == null ? "" : html).replace(/data:image\/[a-zA-Z0-9.+-]+(?:;[a-zA-Z0-9=.\-]+)*;base64,[A-Za-z0-9+/=\s]+/gi, "");
  }

  function slimEntryForStorage(entry) {
    if (!entry || !Array.isArray(entry.questions)) return entry;
    var size = 0;
    try { size = JSON.stringify(entry).length; } catch (_) { return entry; }
    if (size <= SLIM_CHARS) return entry;
    return Object.assign({}, entry, {
      questions: entry.questions.map(function (question) {
        return Object.assign({}, question, {
          statementHtml: stripDataUriImages(question && question.statementHtml),
          options: (question && question.options || []).map(function (option) {
            return Object.assign({}, option, { html: stripDataUriImages(option && option.html) });
          })
        });
      })
    });
  }

  function createLibrary(storage) {
    ensureLegacyCleanup();
    function readIndex() {
      return normalizeLibrary(storage.read(INDEX_KEY, emptyLibrary()));
    }
    function writeIndex(library) {
      storage.write(INDEX_KEY, library);
    }
    function readEntry(id) {
      var value = storage.read(entryStorageKey(id), null);
      return value && typeof value === "object" && !Array.isArray(value) ? value : null;
    }
    function writeEntry(id, entry) {
      return storage.write(entryStorageKey(id), slimEntryForStorage(entry));
    }
    function removeEntry(id) {
      if (typeof storage.remove === "function") storage.remove(entryStorageKey(id));
      else storage.write(entryStorageKey(id), null);
    }
    function migrateLegacy(library) {
      var allMoved = true;
      var meta = {};
      Object.keys(library.entries).forEach(function (key) {
        var entry = library.entries[key];
        if (entry && Array.isArray(entry.questions)) {
          var moved = false;
          try {
            moved = writeEntry(key, entry);
          } catch (_) {}
          meta[key] = moved ? entryMetadata(entry) : entry;
          if (!moved) allMoved = false;
        } else if (entry) {
          meta[key] = entry;
        }
      });
      library.entries = meta;
      return allMoved;
    }
    var legacyCleanupDone = false;
    function ensureLegacyCleanup() {
      if (legacyCleanupDone) return;
      legacyCleanupDone = true;
      if (storage.read(LEGACY_CLEANUP_KEY, false)) return;
      var exists = true;
      try {
        var keys = typeof storage.list === "function" ? storage.list() : null;
        if (keys) exists = keys.indexOf(LEGACY_KEY) !== -1;
      } catch (_) {}
      if (exists) {
        var migrated = false;
        var readable = false;
        var usesGM = storage.usesGM === true;
        if (!usesGM) {
          try {
            var raw = storage.read(LEGACY_KEY, null);
            if (raw && typeof raw === "object" && !Array.isArray(raw)) {
              readable = true;
              var library = normalizeLibrary(raw);
              migrated = migrateLegacy(library);
              writeIndex(library);
            }
          } catch (_) {}
        }
        // Chromium limits extension messages to 64 MiB; never transport the deprecated GM blob.
        if (usesGM || migrated || !readable) {
          try {
            if (typeof storage.remove === "function") storage.remove(LEGACY_KEY);
          } catch (_) {}
        }
      }
      storage.write(LEGACY_CLEANUP_KEY, true);
    }
    function read() {
      return readIndex();
    }
    function list() {
      var entries = read().entries;
      return Object.keys(entries).map(function (key) {
        var entry = entries[key];
        return Object.assign({}, entry, { questions: undefined });
      }).sort(function (left, right) {
        return String(left.group || "").localeCompare(String(right.group || ""), "pt-BR") || String(left.title || "").localeCompare(String(right.title || ""), "pt-BR");
      });
    }
    function get(id) {
      var key = String(id);
      var entry = readEntry(key);
      if (entry) return entry;
      var library = read();
      entry = readEntry(key);
      if (entry) return entry;
      var legacy = library.entries && library.entries[key];
      return legacy && Array.isArray(legacy.questions) ? legacy : null;
    }
    function appendPart(info, questions) {
      var key = String(info.libraryId || info.cadernoId || info.code || "");
      if (!key) throw new Error("Não foi possível identificar o caderno para a biblioteca.");
      var old = readEntry(key) || { id: key, questions: [], parts: [] };
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
      var merged = Object.assign({}, old, info, {
        id: key,
        questions: (old.questions || []).concat(added),
        parts: parts.sort(function (left, right) { return left.start - right.start; }),
        updatedAt: new Date().toISOString()
      });
      writeEntry(key, merged);
      var index = readIndex();
      index.entries[key] = entryMetadata(merged);
      writeIndex(index);
      return merged;
    }
    function remove(id) {
      var key = String(id);
      removeEntry(key);
      var library = readIndex();
      delete library.entries[key];
      writeIndex(library);
    }
    function clear() {
      var library = readIndex();
      Object.keys(library.entries).forEach(removeEntry);
      writeIndex(emptyLibrary());
    }
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
        alternatives.C, alternatives.D, alternatives.E, question.answer || question.gabarito
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

  function imageSourcesFromHtml(value) {
    var sources = [];
    var pattern = /<img\b[^>]*\b(?:src|data-src)\s*=\s*(["'])(.*?)\1/gi;
    var match;
    while ((match = pattern.exec(String(value == null ? "" : value)))) {
      var source = String(match[2] || "").trim();
      if (source && sources.indexOf(source) < 0) sources.push(source);
    }
    return sources;
  }

  function questionImageSources(question) {
    var sources = imageSourcesFromHtml(question && question.statementHtml);
    (question && question.options || []).forEach(function (option) {
      imageSourcesFromHtml(option && option.html).forEach(function (source) {
        if (sources.indexOf(source) < 0) sources.push(source);
      });
    });
    return sources;
  }

  function imageSourcesForEntry(entry) {
    return (entry.questions || []).map(questionImageSources);
  }

  function excelRows(entry, questionImages, imageAssets) {
    var imageCount = (questionImages || []).reduce(function (maximum, sources) { return Math.max(maximum, sources.length); }, 0);
    var headers = ["Número", "Caderno", "Código", "Banca", "Ano", "Vaga", "Órgão", "Cargo", "Matéria", "Assunto", "Questão ID", "URL", "Enunciado", "Alternativa A", "Alternativa B", "Alternativa C", "Alternativa D", "Alternativa E", "Gabarito"];
    for (var imageIndex = 0; imageIndex < imageCount; imageIndex += 1) headers.push("Imagem " + String(imageIndex + 1));
    var rows = [headers];
    (entry.questions || []).forEach(function (question, index) {
      var alternatives = {};
      (question.options || []).forEach(function (option) { alternatives[option.letter] = option.text; });
      var row = [question.number || index + 1, entry.title, entry.code, question.bank, question.year, question.vacancy, question.organization, question.role, question.subject, question.topic, question.id, question.url, question.statement, alternatives.A, alternatives.B, alternatives.C, alternatives.D, alternatives.E, question.answer || question.gabarito];
      (questionImages && questionImages[index] || []).forEach(function (source) {
        row.push(imageAssets && imageAssets.has(source) ? "[imagem incorporada]" : source);
      });
      while (row.length < headers.length) row.push("");
      rows.push(row);
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
      var content = typeof file.content === "string" ? encoder.encode(file.content) : new Uint8Array(file.content);
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

  var MAX_EMBEDDED_IMAGE_BYTES = 8 * 1024 * 1024;

  function decodeBase64(value) {
    if (typeof atob !== "function") return null;
    try {
      var binary = atob(String(value || "").replace(/\s/g, ""));
      var bytes = new Uint8Array(binary.length);
      for (var index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
      return bytes;
    } catch (_) { return null; }
  }

  function imageFormat(bytes, mime) {
    var type = String(mime || "").split(";", 1)[0].toLowerCase();
    if (bytes && bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) return { extension: "png", mime: "image/png" };
    if (bytes && bytes.length >= 3 && bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) return { extension: "jpg", mime: "image/jpeg" };
    if (bytes && bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return { extension: "gif", mime: "image/gif" };
    if (type === "image/jpg") type = "image/jpeg";
    if (type === "image/png") return { extension: "png", mime: type };
    if (type === "image/jpeg") return { extension: "jpg", mime: type };
    if (type === "image/gif") return { extension: "gif", mime: type };
    return null;
  }

  async function readImageAsset(source) {
    var raw = String(source || "").trim();
    if (!raw) return null;
    var bytes = null;
    var mime = "";
    var dataMatch = raw.match(/^data:([^;,]+)(;base64)?,([\s\S]*)$/i);
    if (dataMatch) {
      mime = dataMatch[1];
      if (dataMatch[2]) {
        bytes = decodeBase64(dataMatch[3]);
      } else {
        try { bytes = new TextEncoder().encode(decodeURIComponent(dataMatch[3])); } catch (_) { bytes = null; }
      }
    } else if (/^https?:/i.test(raw) && typeof fetch === "function") {
      try {
        var response = await fetch(raw, { credentials: "include" });
        if (!response || !response.ok) return null;
        mime = response.headers && response.headers.get ? response.headers.get("content-type") || "" : "";
        bytes = new Uint8Array(await response.arrayBuffer());
      } catch (_) { return null; }
    }
    if (!bytes || !bytes.length || bytes.length > MAX_EMBEDDED_IMAGE_BYTES) return null;
    var format = imageFormat(bytes, mime);
    return format ? { source: raw, bytes: bytes, extension: format.extension, mime: format.mime } : null;
  }

  async function loadImageAssets(questionImages) {
    var assets = new Map();
    var embedded = [];
    for (var questionIndex = 0; questionIndex < questionImages.length; questionIndex += 1) {
      for (var imageIndex = 0; imageIndex < questionImages[questionIndex].length; imageIndex += 1) {
        var source = questionImages[questionIndex][imageIndex];
        if (assets.has(source)) continue;
        var asset = await readImageAsset(source);
        if (asset) {
          asset.mediaIndex = embedded.length + 1;
          embedded.push(asset);
          assets.set(source, asset);
        }
      }
    }
    return { assets: assets, embedded: embedded };
  }

  function drawingXml(drawingImages) {
    var xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">';
    drawingImages.forEach(function (image, index) {
      xml += '<xdr:oneCellAnchor><xdr:from><xdr:col>' + String(image.column) + '</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>' + String(image.row) + '</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:ext cx="5000000" cy="2500000"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="' + String(index + 1) + '" name="Imagem ' + String(index + 1) + '"/><xdr:cNvPicPr/></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rId' + String(index + 1) + '"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor>';
    });
    return xml + "</xdr:wsDr>";
  }

  function drawingRelationshipsXml(drawingImages) {
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + drawingImages.map(function (image, index) {
      return '<Relationship Id="rId' + String(index + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image' + String(image.asset.mediaIndex) + '.' + image.asset.extension + '"/>';
    }).join("") + "</Relationships>";
  }

  async function buildXlsxBlob(entry) {
    var questionImages = imageSourcesForEntry(entry);
    var loadedImages = await loadImageAssets(questionImages);
    var rows = excelRows(entry, questionImages, loadedImages.assets);
    var worksheet = rows.map(function (row, rowIndex) {
      var cells = row.map(function (value, columnIndex) {
        var reference = columnName(columnIndex) + String(rowIndex + 1);
        return '<c r="' + reference + '" t="inlineStr"><is><t xml:space="preserve">' + xmlEscape(value) + "</t></is></c>";
      }).join("");
      return '<row r="' + String(rowIndex + 1) + '">' + cells + "</row>";
    }).join("");
    var lastCell = columnName(rows[0].length - 1) + String(rows.length);
    var drawingImages = [];
    questionImages.forEach(function (sources, questionIndex) {
      sources.forEach(function (source, imageIndex) {
        var asset = loadedImages.assets.get(source);
        if (asset) drawingImages.push({ asset: asset, column: 19 + imageIndex * 2, row: questionIndex + 1 });
      });
    });
    var hasImages = drawingImages.length > 0;
    var contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>';
    if (hasImages) {
      var contentTypeByExtension = { png: "image/png", jpg: "image/jpeg", gif: "image/gif" };
      Array.from(new Set(loadedImages.embedded.map(function (image) { return image.extension; }))).forEach(function (extension) {
        contentTypes += '<Default Extension="' + extension + '" ContentType="' + contentTypeByExtension[extension] + '"/>';
      });
      contentTypes += '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>';
    }
    contentTypes += '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>';
    var worksheetXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"' + (hasImages ? ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"' : "") + '><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetData>' + worksheet + '</sheetData><autoFilter ref="A1:' + lastCell + '"/>' + (hasImages ? '<drawing r="rId1"/>' : "") + '</worksheet>';
    var files = [
      { name: "[Content_Types].xml", content: contentTypes },
      { name: "_rels/.rels", content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
      { name: "xl/workbook.xml", content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Questões" sheetId="1" r:id="rId1"/></sheets></workbook>' },
      { name: "xl/_rels/workbook.xml.rels", content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>' },
      { name: "xl/worksheets/sheet1.xml", content: worksheetXml }
    ];
    if (hasImages) {
      files.push({ name: "xl/worksheets/_rels/sheet1.xml.rels", content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>' });
      files.push({ name: "xl/drawings/drawing1.xml", content: drawingXml(drawingImages) });
      files.push({ name: "xl/drawings/_rels/drawing1.xml.rels", content: drawingRelationshipsXml(drawingImages) });
      loadedImages.embedded.forEach(function (image) { files.push({ name: "xl/media/image" + String(image.mediaIndex) + "." + image.extension, content: image.bytes }); });
    }
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
  var darkTheme = document.createElement("style");
  darkTheme.textContent = ":root{color-scheme:dark}body{background:#0b1120;color:#e5e7eb}.card{background:#111827;color:#e5e7eb}.controls button,.controls input,.controls select{background:#1f2937;color:#f9fafb;border-color:#4b5563}.meta{color:#cbd5e1}.tag{background:#172554;color:#bfdbfe}.option{background:#1f2937;color:#f9fafb;border-color:#4b5563;transition:background .2s ease,border-color .2s ease,opacity .3s ease,filter .3s ease}.option:hover{border-color:#60a5fa}.option.selected{background:#172554;border-color:#60a5fa}.option.correct{background:#052e16;border-color:#22c55e}.option.incorrect{background:#450a0a;border-color:#ef4444}.option.eliminated{background:#111827;opacity:.3;filter:grayscale(.8)}.hint,.empty{color:#94a3b8}.feedback{margin:14px 0;padding:12px 14px;border-radius:8px;border:1px solid #475569;background:#1e293b;color:#e2e8f0;font-weight:700}.feedback.correct{border-color:#22c55e;background:#052e16;color:#bbf7d0}.feedback.incorrect{border-color:#ef4444;background:#450a0a;color:#fecaca}.feedback.unavailable{border-color:#f59e0b;background:#451a03;color:#fde68a}.statement img,.option img{display:block;max-width:100%;height:auto;margin:12px auto;border-radius:8px}";
  document.head.appendChild(darkTheme);
  function read() { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch (_) { return fallback; } }
  function write() {
    document.getElementById("tec-caderno-state").textContent = JSON.stringify(state);
    try { localStorage.setItem(key, JSON.stringify(state)); document.getElementById("status").textContent = "Histórico salvo localmente"; }
    catch (_) { document.getElementById("status").textContent = "Histórico apenas nesta sessão; baixe o HTML para preservar"; }
  }
  function currentAttempt() { return state.attempts[state.activeAttempt] || state.attempts[0]; }
  function escapeValue(value) { return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]; }); }
  function answerLetter(value) {
    var raw = String(value == null ? "" : value).trim().toUpperCase();
    if (/^[A-E]$/.test(raw)) return raw;
    var labeled = raw.match(/(?:GABARITO|RESPOSTA|ALTERNATIVA)\s*[:.)-]?\s*([A-E])\b/);
    if (labeled) return labeled[1];
    var prefixed = raw.match(/^([A-E])\s*[:.)-]/);
    return prefixed ? prefixed[1] : "";
  }
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
    var correctAnswer = answerLetter(question.answer || question.gabarito);
    var selectedAnswer = answerLetter(attempt.answers[question.id]);
    var confirmed = !!(attempt.confirmed || {})[question.id];
    var meta = [question.bank, question.year, question.organization, question.role, question.vacancy, question.subject, question.topic].filter(Boolean).map(function (value) { return '<span class="tag">' + escapeValue(value) + "</span>"; }).join("");
    var body = question.statementHtml || ("<p>" + escapeValue(question.statement) + "</p>");
    var alternatives = (question.options || []).map(function (option) {
      var selected = selectedAnswer === option.letter;
      var correct = confirmed && !!correctAnswer && correctAnswer === option.letter;
      var incorrect = confirmed && selected && !!correctAnswer && selectedAnswer !== correctAnswer;
      var eliminated = !!(attempt.eliminated[question.id] || {})[option.letter];
      return '<button class="option ' + (selected ? "selected " : "") + (correct ? "correct " : "") + (incorrect ? "incorrect " : "") + (eliminated ? "eliminated " : "") + '" aria-pressed="' + (selected ? "true" : "false") + '" data-letter="' + escapeValue(option.letter) + '">' + (option.html || ("<strong>" + escapeValue(option.letter) + ")</strong> " + escapeValue(option.text))) + "</button>";
    }).join("");
    var feedbackClass = "feedback";
    var feedbackText = "Selecione uma alternativa e clique em Responder para confirmar.";
    if (selectedAnswer && correctAnswer && confirmed) {
      feedbackClass += selectedAnswer === correctAnswer ? " correct" : " incorrect";
      feedbackText = selectedAnswer === correctAnswer
        ? "✓ Você acertou! A resposta correta é " + correctAnswer + "."
        : "✕ Você errou. Você marcou " + selectedAnswer + "; a resposta correta é " + correctAnswer + ".";
    } else if (selectedAnswer && confirmed) {
      feedbackClass += " unavailable";
      feedbackText = "Resposta marcada, mas o gabarito desta questão não foi extraído.";
    } else if (selectedAnswer) {
      feedbackText = "Alternativa " + selectedAnswer + " selecionada. Clique em Responder para confirmar.";
    }
    document.getElementById("question").innerHTML = '<div class="meta">' + meta + '</div><div class="statement">' + body + "</div><div>" + alternatives + '</div><div class="answer-row"><button id="respond"' + (selectedAnswer && !confirmed ? "" : " disabled") + '>Responder</button><div id="feedback" class="' + feedbackClass + '">' + escapeValue(feedbackText) + '</div></div><div class="hint">Clique para selecionar uma alternativa e depois em Responder para confirmar. Dê duplo clique para esmaecer (descartar) ou restaurar uma alternativa.</div>';
    document.getElementById("status").textContent = "Questão " + (index + 1) + " de " + visible.length;
    Array.from(document.querySelectorAll(".option")).forEach(function (button) {
      var clickTimer = null;
      button.addEventListener("click", function () {
        if (clickTimer) clearTimeout(clickTimer);
        clickTimer = setTimeout(function () {
          attempt.answers[question.id] = button.dataset.letter;
          if (attempt.confirmed && attempt.confirmed[question.id] !== button.dataset.letter) delete attempt.confirmed[question.id];
          write();
          render();
        }, 220);
      });
      button.addEventListener("dblclick", function (event) { event.preventDefault(); if (clickTimer) clearTimeout(clickTimer); attempt.eliminated[question.id] = attempt.eliminated[question.id] || {}; if (attempt.eliminated[question.id][button.dataset.letter]) delete attempt.eliminated[question.id][button.dataset.letter]; else attempt.eliminated[question.id][button.dataset.letter] = true; write(); render(); });
    });
    var respond = document.getElementById("respond");
    if (respond) respond.addEventListener("click", function () {
      attempt.confirmed = attempt.confirmed || {};
      attempt.confirmed[question.id] = true;
      write();
      render();
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
      "</title><style>body{margin:0;background:#f3f4f6;color:#182230;font:16px system-ui,-apple-system,Segoe UI,sans-serif}.top{position:sticky;top:0;z-index:2;background:#102a43;color:#fff;padding:14px 20px;box-shadow:0 2px 8px #0003}.top h1{font-size:18px;margin:0 0 7px}.controls{display:flex;flex-wrap:wrap;gap:8px;align-items:center}.controls button,.controls input,.controls select{border:1px solid #aab8c8;border-radius:7px;padding:7px 9px;font:inherit}.controls button{background:#fff;color:#102a43;cursor:pointer;font-weight:700}.summary{font-size:13px;opacity:.9}.main{max-width:900px;margin:24px auto;padding:0 16px}.card{background:#fff;border-radius:12px;box-shadow:0 3px 14px #0b1f3317;padding:22px}.meta{display:flex;gap:6px;flex-wrap:wrap;color:#52606d;font-size:14px;margin-bottom:14px}.tag{background:#e6f6ff;color:#075985;padding:4px 7px;border-radius:999px}.statement{line-height:1.6}.option{display:block;width:100%;text-align:left;margin:10px 0;padding:12px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;cursor:pointer;font:inherit;transition:background .2s ease,border-color .2s ease,opacity .3s ease,filter .3s ease}.option:hover{border-color:#2563eb}.option.selected{border:2px solid #2563eb;background:#eff6ff}.option.eliminated{opacity:.3;filter:grayscale(.8);background:#f1f5f9}.answer-row{display:flex;align-items:center;gap:12px;margin-top:14px}.answer-row #feedback{margin:0;flex:1}#respond{background:#2563eb;color:#fff;border:0;border-radius:8px;padding:11px 18px;font:700 14px system-ui;cursor:pointer;white-space:nowrap}#respond:hover:not(:disabled){background:#1d4ed8}#respond:disabled{background:#9ca3af;cursor:not-allowed}.hint{margin-top:12px;color:#64748b;font-size:13px}.status{margin-left:auto;font-size:13px}.empty{padding:30px;text-align:center;color:#64748b}</style></head><body><header class=\"top\"><h1 id=\"title\"></h1><div class=\"controls\"><button id=\"prev\">← Anterior</button><button id=\"next\">Próxima →</button><label>Ir para <input id=\"jump\" type=\"number\" min=\"1\" style=\"width:78px\"></label><button id=\"go\">Ir</button><label>Banca <select id=\"bank\"><option value=\"\">Todas</option></select></label><label>Ano <select id=\"year\"><option value=\"\">Todos</option></select></label><button id=\"newAttempt\">Nova tentativa</button><button id=\"saveHtml\">Baixar HTML com histórico</button><span class=\"status\" id=\"status\"></span></div><div class=\"summary\" id=\"summary\"></div></header><main class=\"main\"><article class=\"card\" id=\"question\"></article></main><script id=\"tec-caderno-data\" type=\"application/json\">", jsJson(data), "</script><script id=\"tec-caderno-state\" type=\"application/json\">", jsJson(initial), "</script><script>", runtime, "</script></body></html>"
    ].join("");
  }

  return {
    LEGACY_KEY: LEGACY_KEY,
    INDEX_KEY: INDEX_KEY,
    LEGACY_CLEANUP_KEY: LEGACY_CLEANUP_KEY,
    LIBRARY_ENTRY_PREFIX: LIBRARY_ENTRY_PREFIX,
    stripDataUriImages: stripDataUriImages,
    slimEntryForStorage: slimEntryForStorage,
    safeFilename: safeFilename,
    parseHeader: parseHeader,
    parsePrintedQuestion: parsePrintedQuestion,
    extractPrintedQuestions: extractPrintedQuestions,
    extractPrintedQuestionsAsync: extractPrintedQuestionsAsync,
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
  var INACTIVITY_PAUSE_MS = 60000;

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
    INACTIVITY_PAUSE_MS: INACTIVITY_PAUSE_MS,
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

  function ensureRunning(guard) {
    if (typeof guard === "function") guard();
  }

  function waitBeforeAction(delayBeforeAction) {
    return typeof delayBeforeAction === "function" ? Promise.resolve(delayBeforeAction()) : Promise.resolve();
  }

  function isPausedError(error) {
    return Boolean(error && error.code === "AUTOMATION_PAUSED");
  }

  function waitForGuarded(documentNode, predicate, timeoutMs, message, guard) {
    return waitFor(documentNode, function () {
      ensureRunning(guard);
      return predicate();
    }, timeoutMs, message);
  }

  function currentPath(rootNode) {
    return String(rootNode.location && rootNode.location.pathname || "");
  }

  function isFilterPage(rootNode) { return /\/questoes\/filtrar/i.test(currentPath(rootNode)); }
  function isPrintPage(rootNode) { return /\/questoes\/cadernos\/\d+\/imprimir/i.test(currentPath(rootNode)); }
  function isCadernoPage(rootNode) { return /\/questoes\/cadernos\/\d+/i.test(currentPath(rootNode)) && !isPrintPage(rootNode); }
  function isFolderPage(rootNode) { return /\/questoes\/pastas\/\d+/i.test(currentPath(rootNode)); }

  function folderIdFromLocation(rootNode) {
    try {
      var location = rootNode && rootNode.location;
      var url = new URL(location && location.href || "", "https://www.tecconcursos.com.br");
      var fromQuery = url.searchParams.get("idPasta") || "";
      if (fromQuery) return fromQuery;
      var match = url.pathname.match(/\/questoes\/pastas\/(\d+)/i);
      return match ? match[1] : "";
    } catch (_) { return ""; }
  }

  function filterUrl(rootNode, folderId) {
    var origin = rootNode.location && rootNode.location.origin || "https://www.tecconcursos.com.br";
    return origin + "/questoes/filtrar?idPasta=" + encodeURIComponent(folderId || folderIdFromLocation(rootNode));
  }

  function folderUrl(rootNode, folderId) {
    var origin = rootNode.location && rootNode.location.origin || "https://www.tecconcursos.com.br";
    return origin + "/questoes/pastas/" + encodeURIComponent(folderId || folderIdFromLocation(rootNode));
  }

  function cadernoUrl(rootNode, id) {
    var origin = rootNode.location && rootNode.location.origin || "https://www.tecconcursos.com.br";
    return origin + "/questoes/cadernos/" + encodeURIComponent(id);
  }

  function isFolderPageReady(documentNode) {
    return Boolean(documentNode && typeof documentNode.querySelector === "function" && documentNode.querySelector("input[name='pastaAtualId'], .listagem-corpo"));
  }

  function findCadernoLinkByTitle(documentNode, title) {
    if (!documentNode || typeof documentNode.querySelectorAll !== "function") return null;
    var expected = clean(title).toLocaleLowerCase("pt-BR");
    if (!expected) return null;
    return Array.from(documentNode.querySelectorAll("a[href*='/questoes/cadernos/']")).filter(isVisible).find(function (link) {
      var text = clean(link && (link.innerText || link.textContent));
      return text.toLocaleLowerCase("pt-BR") === expected && !/\/imprimir(?:[/?#]|$)/i.test(String(link && (link.href || "")));
    }) || null;
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

  async function clearActiveFilters(documentNode, guard, delayBeforeAction) {
    ensureRunning(guard);
    if (!activeFilterCount(documentNode)) return;
    var clear = Array.from(documentNode.querySelectorAll(".gerador-filtrador-cabecalho-limpar")).filter(isVisible).find(function (node) {
      return /Limpar/i.test(node.innerText || node.textContent || "");
    });
    if (!clear) throw new Error("Há filtros ativos, mas não encontrei o controle para limpá-los.");
    ensureRunning(guard);
    await waitBeforeAction(delayBeforeAction);
    ensureRunning(guard);
    clickElement(documentNode, clear);
    await waitForGuarded(documentNode, function () { return activeFilterCount(documentNode) === 0; }, 5000, "O TecConcursos não confirmou a limpeza dos filtros.", guard);
    ensureRunning(guard);
  }

  function visibleSearchBox(documentNode, heading) {
    return Array.from(documentNode.querySelectorAll(".gerador-buscador")).filter(isVisible).find(function (box) {
      return searchBoxMatchesHeading(box, heading);
    }) || null;
  }

  function reusableSearchBox(documentNode, heading, fallback) {
    if (fallback && fallback.isConnected !== false && isVisible(fallback)) return fallback;
    return visibleSearchBox(documentNode, heading);
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

  async function selectTreeValue(documentNode, heading, value, guard, delayBeforeAction) {
    ensureRunning(guard);
    var tab = await waitForGuarded(documentNode, function () {
      return Array.from(documentNode.querySelectorAll(".menu-alternador-opcao")).filter(isVisible).find(function (node) {
        return deps.dom.sameText(node.innerText || node.textContent, heading);
      }) || null;
    }, 10000, "Não encontrei a aba de filtro '" + heading + "'.", guard);
    await waitBeforeAction(delayBeforeAction);
    ensureRunning(guard);
    clickElement(documentNode, tab);
    var box = await waitForGuarded(documentNode, function () { return visibleSearchBox(documentNode, heading); }, 10000, "A aba '" + heading + "' não abriu o painel de busca.", guard);

    if (heading === "Ano") {
      var yearExpected = clean(value).toLocaleLowerCase("pt-BR");
      var yearItem = await waitForGuarded(documentNode, function () {
        var currentBox = reusableSearchBox(documentNode, heading, box) || box;
        return Array.from(currentBox.querySelectorAll(".arvore-item")).filter(isVisible).find(function (node) {
          return treeItemMatches(node, yearExpected);
        }) || null;
      }, 10000, "O ano '" + value + "' não apareceu na lista de anos.", guard);
      var yearTarget = treeItemClickTarget(yearItem);
      ensureRunning(guard);
      await waitBeforeAction(delayBeforeAction);
      ensureRunning(guard);
      if (!clickElement(documentNode, yearTarget)) throw new Error("Encontrei o ano '" + value + ", mas não consegui acionar o item.");
      await waitForGuarded(documentNode, function () {
        var currentBox = reusableSearchBox(documentNode, heading, box);
        return currentBox && hasSelectedTreeItem(currentBox, yearExpected);
      }, 5000, "O TecConcursos não confirmou a seleção do ano '" + value + "'.", guard);
      return;
    }

    var searchLink = Array.from(box.querySelectorAll("a")).find(function (node) {
      return clean(node.innerText || node.textContent) === "Pesquisar por nome";
    });
    if (searchLink) {
      ensureRunning(guard);
      await waitBeforeAction(delayBeforeAction);
      ensureRunning(guard);
      clickElement(documentNode, searchLink);
    }
    var search = await waitForGuarded(documentNode, function () {
      return box.querySelector("input[ng-model='vm.textoBusca']") || box.querySelector("input[placeholder*='três caracteres']");
    }, 5000, "O campo de busca da aba '" + heading + "' não apareceu.", guard);
    var candidates = searchCandidates(heading, value);
    var item = null;
    for (var index = 0; index < candidates.length && !item; index += 1) {
      ensureRunning(guard);
      setInputValue(search, candidates[index]);
      var expected = clean(candidates[index]).toLocaleLowerCase("pt-BR");
      try {
        item = await waitForGuarded(documentNode, function () {
          var currentBox = reusableSearchBox(documentNode, heading, box) || box;
          return Array.from(currentBox.querySelectorAll(".arvore-item")).filter(isVisible).find(function (node) {
            return treeItemMatches(node, expected);
          }) || null;
        }, 5000, "O resultado '" + value + "' não apareceu na aba '" + heading + "' após a busca.", guard);
      } catch (error) {
        if (isPausedError(error)) throw error;
        item = null;
      }
    }
    if (!item) throw new Error("Não encontrei '" + value + "' no filtro " + heading + ".");
    var clickable = treeItemClickTarget(item);
    ensureRunning(guard);
    await waitBeforeAction(delayBeforeAction);
    ensureRunning(guard);
    if (!clickElement(documentNode, clickable)) throw new Error("Encontrei '" + value + ", mas não consegui acionar o contêiner de seleção.");
    try {
      await waitForGuarded(documentNode, function () {
        var currentBox = reusableSearchBox(documentNode, heading, box);
        return currentBox && hasSelectedTreeItem(currentBox, expected);
      }, 1500, "O TecConcursos não confirmou a seleção de '" + value + "'.", guard);
      return;
    } catch (error) {
      if (isPausedError(error)) throw error;
      ensureRunning(guard);
      await waitBeforeAction(delayBeforeAction);
      ensureRunning(guard);
      if (!invokeAngularTreeItem(documentNode, item)) {
        throw new Error("O resultado '" + value + "' foi encontrado, mas o TecConcursos ignorou o clique de seleção.");
      }
    }
    await waitForGuarded(documentNode, function () {
      var currentBox = reusableSearchBox(documentNode, heading, box);
      return currentBox && hasSelectedTreeItem(currentBox, expected);
    }, 5000, "O TecConcursos ignorou a seleção de '" + value + "'.", guard);
  }

  async function applyMatterFilters(documentNode, plan, matter, onProgress, guard, delayBeforeAction) {
    ensureRunning(guard);
    var paths = deps.plan.normalizeMatter(matter).subjectPaths;
    if (!paths.length) throw new Error(matter.code + " não possui caminho de matéria/assunto para selecionar.");
    for (var index = 0; index < paths.length; index += 1) {
      var leaf = deps.plan.lastPathSegment(paths[index]);
      if (!leaf) continue;
      ensureRunning(guard);
      if (onProgress) onProgress("Selecionando assunto: " + leaf);
      await selectTreeValue(documentNode, "Matéria e assunto", leaf, guard, delayBeforeAction);
    }
    for (var bankIndex = 0; bankIndex < plan.banks.length; bankIndex += 1) {
      ensureRunning(guard);
      if (onProgress) onProgress("Selecionando banca: " + plan.banks[bankIndex]);
      await selectTreeValue(documentNode, "Banca", plan.banks[bankIndex], guard, delayBeforeAction);
    }
    for (var yearIndex = 0; yearIndex < plan.years.length; yearIndex += 1) {
      ensureRunning(guard);
      if (onProgress) onProgress("Selecionando ano: " + String(plan.years[yearIndex]));
      await selectTreeValue(documentNode, "Ano", String(plan.years[yearIndex]), guard, delayBeforeAction);
    }
    ensureRunning(guard);
    if (onProgress) onProgress("Aplicando remoção de questões anuladas e desatualizadas.");
    if (plan.removeCancelled) {
      ensureRunning(guard);
      await waitBeforeAction(delayBeforeAction);
      ensureRunning(guard);
      clickText(documentNode, "[role='button'].link-atalho", "Remover anuladas");
    }
    if (plan.removeOutdated) {
      ensureRunning(guard);
      await waitBeforeAction(delayBeforeAction);
      ensureRunning(guard);
      clickText(documentNode, "[role='button'].link-atalho", "Remover desatualizadas");
    }
  }

  return {
    currentPath: currentPath,
    isFilterPage: isFilterPage,
    isPrintPage: isPrintPage,
    isCadernoPage: isCadernoPage,
    isFolderPage: isFolderPage,
    folderIdFromLocation: folderIdFromLocation,
    filterUrl: filterUrl,
    folderUrl: folderUrl,
    cadernoUrl: cadernoUrl,
    isFolderPageReady: isFolderPageReady,
    findCadernoLinkByTitle: findCadernoLinkByTitle,
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

  function recommendedMaxPerPrint(metrics, fallback) {
    var limit = Math.max(1, Math.floor(Number(fallback) || 200));
    var imageCount = Math.max(0, Math.floor(Number(metrics && metrics.imageCount) || 0));
    var contentHtmlLength = Math.max(0, Math.floor(Number(metrics && metrics.contentHtmlLength) || 0));
    if (imageCount >= 40 || contentHtmlLength >= 1500000) return Math.min(limit, 50);
    if (imageCount >= 12 || contentHtmlLength >= 600000) return Math.min(limit, 100);
    return limit;
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

    function ensureRunning(state) {
      if (typeof context.ensureRunning === "function") context.ensureRunning(state);
    }

    function waitForRunning(state, predicate, timeoutMs, message) {
      return waitFor(documentNode, function () {
        ensureRunning(state);
        return predicate();
      }, timeoutMs, message);
    }

    async function submitCurrentRange(state) {
      ensureRunning(state);
      var job = state.export.job;
      if (typeof context.delayBeforeAction === "function") await context.delayBeforeAction(state);
      ensureRunning(state);
      if (!clickPrintTab(documentNode)) throw new Error("Não encontrei a aba Imprimir do caderno.");
      var initialInput = await waitForRunning(state, function () { return documentNode.querySelector("#questaoInicialInput"); }, 10000, "A tela de impressão não exibiu o campo de questão inicial.");
      var total = Number(initialInput.getAttribute("max") || initialInput.max || 0);
      if (!job.ranges.length) {
        if (!total) throw new Error("O TecConcursos não informou a quantidade total de questões para imprimir.");
        job.maxPerPrint = Math.max(1, Math.floor(Number(job.maxPerPrint) || maxPerPrint));
        job.ranges = splitRanges(total, job.maxPerPrint);
        job.rangeIndex = 0;
      }
      if (!job.printTotalQuestions) job.printTotalQuestions = total;
      var current = job.ranges[job.rangeIndex];
      if (!current) throw new Error("Não existe uma parte pendente para imprimir.");
      ensureRunning(state);
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
      ensureRunning(state);
      if (sequential && !sequential.checked && typeof context.delayBeforeAction === "function") await context.delayBeforeAction(state);
      ensureRunning(state);
      if (sequential && !sequential.checked && !clickElement(documentNode, sequential)) throw new Error("Não consegui selecionar 'A partir da questão'.");
      setInputValue(initialInput, current.start);
      var quantityInput = documentNode.querySelector("#numeroQuestoesInput, #numeroQuestoes");
      if (quantityInput) setInputValue(quantityInput, current.count);
      if (String(initialInput.value) !== String(current.start)) throw new Error("O início da impressão não foi atualizado para a questão " + current.start + ".");
      if (quantityInput && String(quantityInput.value) !== String(current.count)) throw new Error("A quantidade da parte não foi atualizada para " + current.count + " questões.");
      var confirm = documentNode.querySelector("#confirmar-button");
      if (!confirm || confirm.disabled) throw new Error("O botão 'Imprimir Caderno' não ficou disponível.");
      if (!preparePrintForm(documentNode)) throw new Error("Não encontrei o formulário de impressão do caderno.");
      ensureRunning(state);
      context.persistProgress(state, {
        phase: "opening-output",
        message: "Enviando a parte " + String(job.rangeIndex + 1) + " de " + String(job.ranges.length) + " para a saída de impressão.",
        matterCode: job.code,
        matterTitle: job.title,
        rangeIndex: job.rangeIndex,
        rangesTotal: job.ranges.length,
        printTotalQuestions: job.printTotalQuestions
      });
      if (typeof context.delayBeforeAction === "function") await context.delayBeforeAction(state);
      ensureRunning(state);
      if (!clickElement(documentNode, confirm)) throw new Error("Encontrei 'Imprimir Caderno', mas não consegui acionar o botão.");
      await waitForRunning(state, function () { return context.isPrintPage(rootNode); }, 8000, "O clique em 'Imprimir Caderno' não abriu a página HTML de saída.");
      return "Abrindo a parte iniciada na questão " + current.start + ".";
    }

    return { submitCurrentRange: submitCurrentRange };
  }

  return {
    splitRanges: splitRanges,
    recommendedMaxPerPrint: recommendedMaxPerPrint,
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
    var extractPrintedQuestionsAsync = context.extractPrintedQuestionsAsync || deps.library.extractPrintedQuestionsAsync;

    function measureOutputPage() {
      var images = documentNode && typeof documentNode.querySelectorAll === "function" ? documentNode.querySelectorAll("#prova-conteudo img, .questao img") : [];
      var contentNode = documentNode && typeof documentNode.querySelector === "function" ? documentNode.querySelector("#prova-conteudo") : null;
      return {
        imageCount: images.length,
        questionCount: documentNode && typeof documentNode.querySelectorAll === "function" ? documentNode.querySelectorAll(".questao").length : 0,
        contentChildCount: contentNode && contentNode.children ? contentNode.children.length : 0
      };
    }

    function adaptPendingRanges(job, current, metrics) {
      var fallback = Number(job.maxPerPrint) || 200;
      var recommend = typeof context.recommendedMaxPerPrint === "function" ? context.recommendedMaxPerPrint(metrics, fallback) : fallback;
      job.maxPerPrint = Math.min(fallback, recommend);
      if (job.maxPerPrint >= fallback) return false;
      var total = Number(job.printTotalQuestions) || job.ranges.reduce(function (sum, range) { return sum + (Number(range.count) || 0); }, 0);
      var completed = job.ranges.slice(0, job.rangeIndex);
      var nextStart = Number(current.start) + Number(current.count);
      var tail = [];
      for (var start = nextStart; start <= total; start += job.maxPerPrint) {
        tail.push({ start: start, count: Math.min(job.maxPerPrint, total - start + 1) });
      }
      job.ranges = completed.concat(tail);
      job.rangeIndex = completed.length;
      return true;
    }

    function ensureRunning(state) {
      if (typeof context.ensureRunning === "function") context.ensureRunning(state);
    }

    function isPausedError(error) {
      return Boolean(error && error.code === "AUTOMATION_PAUSED");
    }

    async function waitForPrintedQuestions(state) {
      ensureRunning(state);
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
          ensureRunning(state);
          var count = documentNode && typeof documentNode.querySelectorAll === "function" ? documentNode.querySelectorAll(".questao").length : 0;
          observedCount = count;
          if (count !== lastCount) {
            lastCount = count;
            context.recordEvent(state, "output-question-count", { count: count, expected: expected });
          }
          if (Date.now() - lastHeartbeat >= 1000) {
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
        if (isPausedError(error)) throw error;
        context.recordEvent(state, "output-timeout", { expected: expected, observed: observedCount, page: context.pageDiagnosticSnapshot(rootNode, documentNode) });
        context.writeState(state);
        throw new Error("A página de impressão não trouxe a quantidade esperada de questões (" + observedCount + "/" + expected + "). " + error.message);
      }
      context.recordEvent(state, "output-ready", context.pageDiagnosticSnapshot(rootNode, documentNode));
      context.writeState(state);
    }

    async function finishExportPart(state) {
      ensureRunning(state);
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
      ensureRunning(state);
      var outputMetrics = measureOutputPage();
      var questions = typeof extractPrintedQuestionsAsync === "function"
        ? await extractPrintedQuestionsAsync(documentNode, {
          chunkSize: context.extractionChunkSize || 5,
          ensureRunning: function () { ensureRunning(state); }
        })
        : extractPrintedQuestions(documentNode);
      if (!questions.length) {
        context.recordEvent(state, "extraction-empty", { page: context.pageDiagnosticSnapshot(rootNode, documentNode), expected: current && current.count });
        context.writeState(state);
        throw new Error("A página de impressão montou o DOM, mas nenhuma questão pôde ser extraída.");
      }
      ensureRunning(state);
      context.recordEvent(state, "questions-extracted", { extracted: questions.length, expected: current && current.count, outputMetrics: outputMetrics, page: context.pageDiagnosticSnapshot(rootNode, documentNode) });
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
      adaptPendingRanges(job, current, outputMetrics);
      if (job.rangeIndex < job.ranges.length) {
        ensureRunning(state);
        context.persistProgress(state, {
          phase: "part-saved",
          message: "Parte salva (" + questions.length + " questões). Retomando a parte " + String(job.rangeIndex + 1) + " de " + String(job.ranges.length) + ".",
          matterCode: job.code,
          matterTitle: job.title,
          rangeIndex: job.rangeIndex,
          rangesTotal: job.ranges.length,
          printTotalQuestions: job.printTotalQuestions
        });
        ensureRunning(state);
        rootNode.location.href = context.cadernoUrl(rootNode, job.cadernoId);
        return "Parte salva: " + questions.length + " questões. Indo para a próxima parte.";
      }
      ensureRunning(state);
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
        ensureRunning(state);
        rootNode.location.href = state.creation.folderUrl || state.creation.filterUrl;
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

    function ensureRunning(state) {
      if (typeof context.ensureRunning === "function") context.ensureRunning(state);
    }

    async function createNextCaderno(state) {
      ensureRunning(state);
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
      await filters.clearActiveFilters(documentNode, function () { ensureRunning(state); }, function () { return context.delayBeforeAction(state); });
      await filters.applyMatterFilters(documentNode, creation.plan, matter, function (message) {
        context.persistProgress(state, {
          phase: "filtering",
          message: message,
          matterCode: matter.code,
          matterTitle: matter.title,
          matterIndex: creation.index,
          mattersTotal: creation.plan.matters.length
        });
      }, function () { ensureRunning(state); }, function () { return context.delayBeforeAction(state); });
      ensureRunning(state);
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
      ensureRunning(state);
      if (typeof context.delayBeforeAction === "function") await context.delayBeforeAction(state);
      ensureRunning(state);
      if (!context.fillCadernoName(documentNode, nameInput, matter.title)) {
        throw new Error("Não consegui preencher o nome do caderno com o título do plano: " + matter.title + ".");
      }
      var option = Array.from(folderSelect.options || []).find(function (item) { return String(item.value) === String(creation.folderId); });
      if (!option) throw new Error("A pasta " + creation.folderId + " não está disponível no seletor do TecConcursos.");
      folderSelect.value = option.value;
      folderSelect.dispatchEvent(new Event("change", { bubbles: true }));
      await context.waitFor(documentNode, function () { return !generateButton.disabled; }, 12000, "O botão 'Gerar Caderno' permaneceu desabilitado após aplicar os filtros.");
      ensureRunning(state);
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
      if (typeof context.delayBeforeAction === "function") await context.delayBeforeAction(state);
      ensureRunning(state);
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
    var lastPersistedPatchKey = "";
    var lastPersistedAt = 0;
    var INTERMEDIATE_PERSIST_INTERVAL_MS = 1000;

    function currentTime() {
      return typeof context.now === "function" ? Number(context.now()) || Date.now() : Date.now();
    }

    function patchKey(patch) {
      var source = patch && typeof patch === "object" ? patch : {};
      return JSON.stringify(Object.keys(source).sort().reduce(function (result, key) {
        result[key] = source[key];
        return result;
      }, {}));
    }

    function isIntermediatePatch(patch) {
      var phase = String(patch && patch.phase || "");
      return phase === "filtering" || phase === "waiting-output";
    }

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
      var nextPatchKey = patchKey(patch);
      var now = currentTime();
      if (nextPatchKey === lastPersistedPatchKey) return state;
      markProgress(state, patch);
      recordEvent(state, "progress", patch);
      if (isIntermediatePatch(patch) && lastPersistedAt && now - lastPersistedAt < INTERMEDIATE_PERSIST_INTERVAL_MS) return state;
      var result = context.writeState(state);
      lastPersistedPatchKey = nextPatchKey;
      lastPersistedAt = now;
      return result;
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
      if (typeof context.ensureRunning === "function") context.ensureRunning(state);
      var creation = state && state.creation;
      var filterUrl = creation && String(creation.filterUrl || "");
      if (!filterUrl) throw new Error("A execução pendente não possui a URL de filtros da pasta.");
      context.persistProgress(state, {
        phase: "opening-filter",
        message: "Abrindo a página de filtros para retomar a criação do próximo caderno.",
        matterIndex: creation.index,
        mattersTotal: creation.plan && creation.plan.matters ? creation.plan.matters.length : 0
      });
      if (typeof context.ensureRunning === "function") context.ensureRunning(state);
      if (context.root && context.root.location) context.root.location.href = filterUrl;
      return "Abrindo a página de filtros para retomar a criação do caderno.";
    }

    function openCadernoForPendingExport(state) {
      if (typeof context.ensureRunning === "function") context.ensureRunning(state);
      var job = state && state.export && state.export.job;
      var cadernoId = job && String(job.cadernoId || "");
      if (!cadernoId) throw new Error("A exportação pendente não possui o ID do caderno para retomar.");
      var cadernoUrl = context.cadernoUrl(context.root, cadernoId);
      context.persistProgress(state, {
        phase: "opening-caderno",
        message: "Abrindo o caderno salvo para retomar a impressão.",
        matterCode: job.code,
        matterTitle: job.title,
        rangeIndex: job.rangeIndex,
        rangesTotal: job.ranges && job.ranges.length
      });
      if (typeof context.ensureRunning === "function") context.ensureRunning(state);
      if (context.root && context.root.location) context.root.location.href = cadernoUrl;
      return "Abrindo o caderno salvo para retomar a impressão.";
    }

    function openFolderForPendingCreation(state) {
      if (typeof context.ensureRunning === "function") context.ensureRunning(state);
      var creation = state && state.creation;
      var folderUrl = creation && String(creation.folderUrl || "");
      if (!folderUrl) throw new Error("A execução pendente não possui a URL da pasta para procurar cadernos.");
      context.persistProgress(state, {
        phase: "opening-folder",
        message: "Abrindo a pasta para procurar cadernos já existentes.",
        matterIndex: creation.index,
        mattersTotal: creation.plan && creation.plan.matters ? creation.plan.matters.length : 0
      });
      if (typeof context.ensureRunning === "function") context.ensureRunning(state);
      if (context.root && context.root.location) context.root.location.href = folderUrl;
      return "Abrindo a pasta para procurar cadernos já existentes.";
    }

    async function reuseExistingCadernoOrOpenFilter(state) {
      if (typeof context.ensureRunning === "function") context.ensureRunning(state);
      if (context.isFolderPageReady && !context.isFolderPageReady(context.document)) {
        if (typeof context.waitFor !== "function") throw new Error("A página da pasta ainda não carregou a lista de cadernos.");
        await context.waitFor(context.document, function () {
          if (typeof context.ensureRunning === "function") context.ensureRunning(state);
          return context.isFolderPageReady(context.document);
        }, 10000, "A lista de cadernos da pasta não carregou a tempo.");
      }
      var creation = state && state.creation;
      var matter = creation && creation.plan && creation.plan.matters && creation.plan.matters[creation.index];
      if (!matter) {
        state.running = false;
        state.creation = null;
        context.persistProgress(state, {
          phase: "completed",
          message: "Todos os cadernos do plano foram processados.",
          matterIndex: creation && creation.index,
          mattersTotal: creation && creation.plan && creation.plan.matters ? creation.plan.matters.length : 0
        });
        context.lockManager.releaseLease(state);
        return "Todos os cadernos do plano foram processados.";
      }
      var link = typeof context.findCadernoLinkByTitle === "function"
        ? context.findCadernoLinkByTitle(context.document, matter.title)
        : null;
      if (!link) {
        creation.phase = "prepare";
        context.persistProgress(state, {
          phase: "opening-filter",
          message: "Caderno não encontrado na pasta. Abrindo os filtros para criar " + matter.title + ".",
          matterCode: matter.code,
          matterTitle: matter.title,
          matterIndex: creation.index,
          mattersTotal: creation.plan.matters.length
        });
        return openFilterForPendingCreation(state);
      }
      var existingId = context.cadernoIdFromLocation(link.href || link.getAttribute && link.getAttribute("href"));
      if (!existingId) throw new Error("Encontrei o caderno '" + matter.title + "', mas não consegui ler o ID do link.");
      creation.phase = "awaiting-existing-caderno";
      creation.current = Object.assign({}, matter, { cadernoId: existingId, reused: true });
      context.persistProgress(state, {
        phase: "opening-existing-caderno",
        message: "Caderno existente encontrado: " + matter.title + ". Abrindo para coletar as questões.",
        matterCode: matter.code,
        matterTitle: matter.title,
        matterIndex: creation.index,
        mattersTotal: creation.plan.matters.length,
        cadernoId: existingId
      });
      if (typeof context.ensureRunning === "function") context.ensureRunning(state);
      var targetUrl = context.cadernoUrl(context.root, existingId);
      if (typeof link.click === "function") link.click();
      else if (context.root && context.root.location) context.root.location.href = targetUrl;
      return "Caderno existente encontrado. Abrindo " + matter.title + ".";
    }

    async function resume() {
      var state = context.readState();
      if (!state.running) return context.status();
      var acquired = context.lockManager.acquireLease(state, false);
      if (!acquired.acquired) return context.lockManager.lockStatus(acquired.lock);
      if (typeof context.ensureRunning === "function") context.ensureRunning(state);
      context.recordEvent(state, "resume-enter", { page: context.pageDiagnosticSnapshot(context.root, context.document), running: Boolean(state.running) });
      context.writeState(state);
      if (context.isPrintPage(context.root) && state.export && state.export.job) return context.output.finishExportPart(state);
      if (context.isCadernoPage(context.root) && state.creation && (state.creation.phase === "awaiting-caderno" || state.creation.phase === "awaiting-existing-caderno") && !state.export) {
        var currentMatter = state.creation.current;
        var createdId = currentMatter && currentMatter.cadernoId || context.cadernoIdFromLocation(context.root.location);
        if (!createdId) throw new Error("O TecConcursos abriu um caderno sem identificador.");
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
          message: currentMatter.reused ? "Caderno existente aberto. Preparando a primeira parte da impressão." : "Novo caderno aberto. Preparando a primeira parte da impressão.",
          matterCode: currentMatter.code,
          matterTitle: currentMatter.title,
          matterIndex: state.creation.index,
          mattersTotal: state.creation.plan.matters.length
        });
      }
      if (context.isCadernoPage(context.root) && state.export && state.export.job && typeof context.ensureRunning === "function") context.ensureRunning(state);
      if (context.isCadernoPage(context.root) && state.export && state.export.job) return context.print.submitCurrentRange(state);
      if (state.export && state.export.job && !context.isCadernoPage(context.root)) {
        if (typeof context.ensureRunning === "function") context.ensureRunning(state);
        return openCadernoForPendingExport(state);
      }
      if (state.creation && state.creation.reuseExistingCadernos && context.isFolderPage(context.root)) {
        return reuseExistingCadernoOrOpenFilter(state);
      }
      if (state.creation && state.creation.reuseExistingCadernos && state.creation.phase === "prepare" && !context.isFolderPage(context.root) && !context.isFilterPage(context.root)) {
        return openFolderForPendingCreation(state);
      }
      if (state.creation && state.creation.phase === "prepare" && state.creation.filterUrl && !context.isFilterPage(context.root)) {
        return openFilterForPendingCreation(state);
      }
      if (context.isFilterPage(context.root) && state.creation && state.creation.phase === "prepare") {
        if (typeof context.ensureRunning === "function") context.ensureRunning(state);
        return context.caderno.createNextCaderno(state);
      }
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
      activity: require("./automation-activity.cjs"),
      lock: require("./automation-lock.cjs"),
      state: require("./automation-state.cjs"),
      filters: require("./automation-filters.cjs"),
      print: require("./automation-print.cjs"),
      output: require("./automation-output.cjs"),
      caderno: require("./automation-caderno.cjs"),
      diagnostics: require("./automation-diagnostics.cjs"),
      orchestrator: require("./automation-orchestrator.cjs"),
      timing: require("./timing.cjs")
    } : (function (modules) {
      return Object.assign({}, modules, {
        dom: modules.automationDom,
        activity: modules.automationActivity,
        lock: modules.automationLock,
        state: modules.automationState,
        filters: modules.automationFilters,
        print: modules.automationPrint,
        output: modules.automationOutput,
        caderno: modules.automationCaderno,
        diagnostics: modules.automationDiagnostics,
        orchestrator: modules.automationOrchestrator,
        timing: modules.timing
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
  var INACTIVITY_PAUSE_MS = stateModule.INACTIVITY_PAUSE_MS;
  var ACTION_DELAY_MIN_MS = 300;
  var ACTION_DELAY_MAX_MS = 600;
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

    var pauseRequestHandler = null;
    var lockManager = deps.lock.createLockManager({
      root: rootNode,
      storage: storage,
      readState: readState,
      ownerId: config.ownerId,
      onPauseRequest: function (request) {
        if (pauseRequestHandler) return pauseRequestHandler(request);
        return undefined;
      }
    });
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
      clickElement: clickElement,
      ensureRunning: ensureRunning,
      delayBeforeAction: delayBeforeAction
    });
    var printWorkflow = deps.print.createPrintWorkflow({
      root: rootNode,
      document: documentNode,
      maxPerPrint: MAX_PER_PRINT,
      persistProgress: diagnostics.persistProgress,
      isPrintPage: deps.filters.isPrintPage,
      ensureRunning: ensureRunning,
      delayBeforeAction: delayBeforeAction
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
      recommendedMaxPerPrint: deps.print.recommendedMaxPerPrint,
      cadernoUrl: deps.filters.cadernoUrl,
      ensureRunning: ensureRunning,
      delayBeforeAction: delayBeforeAction
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
      cadernoUrl: deps.filters.cadernoUrl,
      findCadernoLinkByTitle: deps.filters.findCadernoLinkByTitle,
      isFolderPageReady: deps.filters.isFolderPageReady,
      isFilterPage: deps.filters.isFilterPage,
      isPrintPage: deps.filters.isPrintPage,
      isCadernoPage: deps.filters.isCadernoPage,
      isFolderPage: deps.filters.isFolderPage,
      waitFor: waitFor,
      caderno: cadernoWorkflow,
      print: printWorkflow,
      output: outputWorkflow,
      ensureRunning: ensureRunning,
      delayBeforeAction: delayBeforeAction
    });
    var resume = orchestrator.resume;

    function errorMessage(error) {
      return String(error && error.message || error || "Erro desconhecido").replace(/\s+/g, " ").trim();
    }

    function automationPausedError(message) {
      var error = new Error(message || "A automação foi pausada antes do próximo passo.");
      error.code = "AUTOMATION_PAUSED";
      return error;
    }

    function ensureRunning(state) {
      var current = readState();
      if (!current.running) throw automationPausedError();
      if (state && current.runId && state.runId && current.runId !== state.runId) {
        throw automationPausedError("A execução mudou enquanto o passo estava aguardando.");
      }
      if (current.runId && !lockManager.ownsLock(lockManager.readLock(), current)) {
        throw automationPausedError("O lease da execução não pertence mais a esta aba.");
      }
      return true;
    }

    function delayBeforeAction(state) {
      ensureRunning(state);
      var interrupted = null;
      var duration = deps.timing.randomInt(ACTION_DELAY_MIN_MS, ACTION_DELAY_MAX_MS);
      return deps.timing.sleep(duration, function () {
        try {
          ensureRunning(state);
          return false;
        } catch (error) {
          interrupted = error;
          return true;
        }
      }).then(function () {
        if (interrupted) throw interrupted;
        ensureRunning(state);
        return true;
      });
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
    function pause(source) {
      var state = readState();
      if (!state.running) return status();
      var currentLock = lockManager.readLock();
      if (state.runId && !lockManager.ownsLock(currentLock, state)) {
        var lockIsActive = Boolean(currentLock && Number(currentLock.expiresAt) > Date.now());
        var canReacquire = !lockIsActive || currentLock.ownerId === lockManager.ownerId;
        if (canReacquire) {
          var acquired = lockManager.acquireLease(state, false);
          if (acquired.acquired) currentLock = lockManager.readLock();
        }
        if (!lockManager.ownsLock(currentLock, state)) {
          var requested = typeof lockManager.requestPause === "function" && lockManager.requestPause(state, source || "manual");
          return requested
            ? "Pausa solicitada à aba proprietária. A execução será interrompida assim que receber o comando."
            : status();
        }
      }
      if (inactivityMonitor) inactivityMonitor.cancel();
      diagnostics.recordEvent(state, "manual-pause", { source: String(source || "manual") });
      state.running = false;
      diagnostics.persistProgress(state, { phase: "paused", message: "Automação pausada. A execução pode ser retomada." });
      lockManager.releaseLease(state);
      return status();
    }

    pauseRequestHandler = function (request) {
      var state = readState();
      if (!state.running || !state.runId) return status();
      if (request && request.runId && request.runId !== state.runId) return status();
      if (!lockManager.ownsLock(lockManager.readLock(), state)) return status();
      return pause("remote:" + String(request && request.sourceLabel || "manual"));
    };

    function pauseForInactivity() {
      var state = readState();
      if (!state.running) return status();
      if (state.runId && !lockManager.ownsLock(lockManager.readLock(), state)) return status();
      if (inactivityMonitor) inactivityMonitor.cancel();
      diagnostics.recordEvent(state, "inactivity-pause", {
        timeoutMs: INACTIVITY_PAUSE_MS,
        page: pageDiagnosticSnapshot(rootNode, documentNode)
      });
      state.running = false;
      diagnostics.persistProgress(state, {
        phase: "paused",
        message: "Automação pausada por inatividade após 1 minuto sem a página ativa. Clique em Retomar para continuar.",
        pausedBy: "inactivity",
        inactivityTimeoutMs: INACTIVITY_PAUSE_MS
      });
      lockManager.releaseLease(state);
      return status();
    }

    var inactivityMonitor = deps.activity && typeof deps.activity.createInactivityMonitor === "function"
      ? deps.activity.createInactivityMonitor({
        root: rootNode,
        document: documentNode,
        timeoutMs: INACTIVITY_PAUSE_MS,
        onInactive: pauseForInactivity
      })
      : null;
    if (inactivityMonitor) inactivityMonitor.start();
    function fail(error) {
      var state = readState();
      if (error && error.code === "AUTOMATION_PAUSED") return status();
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

    function pauseForManualResume(state) {
      state.running = false;
      stateModule.markProgress(state, {
        phase: "paused",
        message: "Automação pausada ao reabrir o site. Clique em Retomar para continuar.",
        pausedAt: new Date().toISOString()
      });
      stateModule.appendEvent(state, "manual-resume-required", {
        reason: "execution-owner-not-restored"
      }, rootNode && rootNode.location && rootNode.location.href, deps.dom.compactDiagnosticValue);
      storage.write(STATE_KEY, state);
      return status();
    }

    async function resumeOnPageLoad() {
      var state = readState();
      if (!state.running || (!state.creation && !state.export)) return status();
      var currentLock = lockManager.readLock();
      var ownsRestoredLease = lockManager.ownsLock(currentLock, state) && (!state.ownerId || state.ownerId === ownerId);
      if (ownsRestoredLease || (!state.ownerId && !currentLock)) return resume();
      if (currentLock && Number(currentLock.expiresAt) > Date.now() && currentLock.ownerId !== ownerId) {
        return lockManager.lockStatus(currentLock);
      }
      return pauseForManualResume(state);
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

    function restartMaterialSearch(folderId) {
      var existing = readState();
      if (existing.running) throw new Error("Pause a automação atual antes de reiniciar a busca por materiais.");
      if (existing.runId) lockManager.releaseLease(existing);
      var plan = readPlan();
      if (!plan.matters.length) throw new Error("Importe o plano consolidado antes de reiniciar a busca por materiais.");
      var id = clean(folderId || readFolderId());
      if (!id) throw new Error("Informe a pasta de destino do TecConcursos.");
      saveFolderId(id);
      var state = {
        version: 1,
        runId: lockManager.createRunId(),
        ownerId: ownerId,
        running: true,
        creation: {
          plan: plan,
          folderId: id,
          folderUrl: deps.filters.folderUrl(rootNode, id),
          filterUrl: deps.filters.filterUrl(rootNode, id),
          reuseExistingCadernos: true,
          index: 0,
          phase: "prepare",
          outcomes: []
        },
        export: null,
        progress: { phase: "starting", message: "Busca de materiais reiniciada.", matterIndex: 0, mattersTotal: plan.matters.length, startedAt: new Date().toISOString() }
      };
      var acquired = lockManager.acquireLease(state, false);
      if (!acquired.acquired) throw lockManager.lockError(acquired.lock);
      writeState(state);
      if (!deps.filters.isFolderPage(rootNode)) {
        rootNode.location.href = state.creation.folderUrl;
        return "Abrindo a pasta para reiniciar a busca de materiais.";
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
      pauseForInactivity: pauseForInactivity,
      ensureRunning: ensureRunning,
      takeover: takeover,
      startCreation: startCreation,
      restartMaterialSearch: restartMaterialSearch,
      startCurrentCaderno: startCurrentCaderno,
      resume: resume,
      resumeOnPageLoad: resumeOnPageLoad,
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

  var embeddedContent = "# Universal Agent Guidelines (The AI Bible)\r\n\r\nThis document defines the core behavioral, security, design, and coding constraints. These rules are universally applicable to ensure high-quality, maintainable, and correct code output.\r\n\r\n## Rule Precedence\r\n\r\nApply instructions in this order:\r\n1. The user’s explicit task requirements.\r\n2. Repository-level rule files and project documentation.\r\n3. More specific rule files or documentation in the affected directory.\r\n4. Explicit constraints marked `CAVEAT`, `IMPORTANT`, `DO NOT CHANGE`, or equivalent, when they are relevant and not contradicted by a higher-priority rule.\r\n5. Existing local code conventions.\r\n\r\nTreat nearby code comments as context, not absolute authority, unless they clearly define a current technical or business constraint.\r\n\r\nWhen a rule applies only to a specific language, subsystem, framework, or workflow, place it in a path- or context-scoped rule file rather than the universal core.\r\n\r\n## Agent Behavior & Workflow\r\n\r\n* **Verification over assumption:** Treat the first implementation as a draft. Before presenting the result, run the repository's applicable verification checks. If no relevant checks exist or they cannot be run, say so explicitly.\r\n* **Surgical edits:** Make only the modifications necessary for the requested change. Do not rewrite, reformat, or restate unrelated files, functions, or code.\r\n* **Fail gracefully:** If a command or test fails, inspect its output and address the root cause. Do not repeatedly guess at fixes. If blocked by missing information, permissions, or an external dependency, state the blocker and the assumption made.\r\n* **Enforcement over instruction:** When a behavior must happen deterministically, prefer hooks, CI, generators, linters, type-checkers, tests, or scanners over prompt-only instructions. Rely on the repository's active tooling for styling and type-checking rather than debating stylistic prompts.\r\n\r\n## Security and Configuration\r\n\r\n* Never commit, print, log, or embed real secrets, credentials, tokens, or sensitive internal URLs.\r\n* Read secrets and environment-dependent values through the repository’s approved configuration mechanism.\r\n* When adding required configuration, update the relevant example/config schema and documentation.\r\n* Use existing secret-scanning, validation, and CI checks; instructions are not a substitute for enforcement.\r\n\r\n## External Integrations & Canonical References\r\n\r\n* Before changing an external API, SDK, CLI, or domain integration, consult the repository’s canonical integration documentation and, when necessary, the official documentation for the version in use.\r\n* Do not invent endpoints, methods, parameters, versions, or capabilities.\r\n* Prefer the existing client, generated types, schemas, and integration tests. If documentation is missing or ambiguous, state the assumption rather than guessing.\r\n\r\n## Shared-State Changes\r\n\r\n* For changes that write shared or persistent state, follow the repository’s existing transaction, locking, idempotency, validation, and retry conventions.\r\n* Add or update tests for relevant failure, rollback, and concurrency cases when applicable.\r\n\r\n## Code Style\r\n\r\n* Follow the repository’s existing formatter, linter, naming, directory, and framework conventions. Do not introduce style-only rewrites in a functional change.\r\n* Prefer small, cohesive functions and modules. Treat 4–20 lines per function and 500 lines per handwritten production module as review targets, not hard limits.\r\n* Split code when responsibilities, dependencies, or reasons to change are independent. Do not split cohesive workflows merely to satisfy a line-count rule.\r\n* Prefer guard clauses and early returns when they reduce nesting. Avoid more than two logical control-flow levels in new business logic unless deeper nesting makes resource lifetime, transactions, or error handling clearer.\r\n* Keep module paths predictable. Follow the repository’s structure first; use framework conventions when the repository has no established alternative.\r\n\r\n## Data Transformations and Performance\r\n\r\n* For repeated membership checks, grouping, or joins over in-memory collections, prefer an appropriate Set, Map, dictionary, index, or database query over repeated linear scans.\r\n* Avoid avoidable repeated scans inside loops when an index can preserve correctness and substantially improve complexity.\r\n* Nested loops are acceptable for inherently pairwise, matrix, cross-product, bounded-small-data, or clearer algorithms. Do not optimize solely to remove nesting.\r\n* Preserve required ordering, memory limits, and semantics. Profile or benchmark performance-sensitive paths before introducing non-obvious optimization.\r\n\r\n## Naming\r\n\r\n* Use names that describe the domain role, action, or invariant and are distinctive within their module and search context.\r\n* Avoid vague catch-all modules or identifiers such as `utils`, `helpers`, `data`, or generic `manager` unless they are established framework conventions or include a precise domain qualifier.\r\n* Name boolean predicates clearly using the convention appropriate to the language and meaning, such as `is`, `has`, `can`, `should`, `was`, or `needs`.\r\n\r\n## Types\r\n\r\n* Make types explicit at public APIs and system boundaries: HTTP, CLI, database, queue, filesystem, external APIs, serialization, and complex domain operations.\r\n* Allow local type inference when the inferred type is clear and preserves type safety.\r\n* In TypeScript, do not introduce implicit `any`. Avoid explicit `any`; use `unknown` with runtime validation when input is uncertain.\r\n* In Python, type public functions and structured data. Prefer domain models, `TypedDict`, `dataclass`, or typed mappings over untyped dictionaries when shape matters.\r\n* Introduce domain-specific types for values whose accidental interchange would cause meaningful bugs, such as money, units, identifiers, or validated state.\r\n\r\n## Duplication and Abstraction\r\n\r\n* Do not duplicate business rules, validation rules, security policy, or protocol behavior that must remain consistent across call sites.\r\n* Extract a shared abstraction when three similar call sites reveal a stable shared contract, or earlier when one policy must change atomically everywhere.\r\n* Do not abstract code merely because it looks syntactically similar. Preserve separate implementations when their future changes are likely to diverge.\r\n\r\n## Errors\r\n\r\n* For validation and internal diagnostic errors, include the operation or field, the expected contract, and a safe summary of the received value.\r\n* Redact, hash, omit, or truncate secrets, credentials, session identifiers, personal data, and large payloads.\r\n* Keep user-facing errors safe and actionable; keep implementation detail in protected logs or structured diagnostics.\r\n\r\n## Comments and Documentation\r\n\r\n* **Preserve intent:** Preserve useful comments and docstrings during refactoring. Update or relocate them when surrounding code changes; remove them only when obsolete, inaccurate, redundant with clear code, or replaced by a more durable source of truth.\r\n* **Explain why, not what:** Write comments to document the \"why\" and explain non-obvious logic, invariants, or external limitations. Never write comments that merely restate self-documenting code (e.g., `# Increment counter`).\r\n* **Workarounds and Provenance:** When introducing code to fix a production incident, upstream bug, or version conflict, include a comment stating:\r\n  * The reason for the workaround.\r\n  * A stable issue, ticket, or commit reference.\r\n  * The affected dependency/version and the removal condition (e.g., target upgrade version).\r\n  * *A comment explains the exception; a regression test prevents its accidental removal.*\r\n* **Do not leak data:** Never include real credentials, private URLs, customer data, or sensitive incident details in comments.\r\n\r\n## Public APIs and Interfaces\r\n\r\n* **Document boundaries:** Document stable consumer-facing contracts according to the language and repository convention. Describe behavior, constraints, side effects, and compatibility expectations when they are not evident from types or usage.\r\n* **Document the contract:** State the intent, key parameters, expected return values, exceptions raised, and side effects. Do not add boilerplate docstrings that only repeat obvious signatures.\r\n* **Conditional examples:** Include code usage examples only when the invocation, state requirements, or return semantics are complex or non-obvious. Prefer verified automated tests over documentation examples.\r\n\r\n## Verification and Test Automation\r\n\r\n* **Verification command:** Provide one documented, non-interactive command (e.g., `npm run verify` or `make verify`) that executes all fast deterministic checks (formatting, linting, type-checking, and unit tests) before presenting a change.\r\n* **Readiness guarantee:** Do not claim a change is verified if the required checks could not run. The CI must execute the full required test matrix.\r\n\r\n## Test Coverage and Regressions\r\n\r\n* **Tested behavior:** Add or update tests for every behavior change that can fail (business rules, validation, serialization, errors, security). Test observable behavior through stable public interfaces; do not test trivial private helpers just for coverage.\r\n* **Regression testing:** Every bug fix must include a regression test that fails before the fix is applied. If a deterministic test is not feasible, state why and add the nearest reliable automated coverage.\r\n\r\n## External I/O and Test Doubles\r\n\r\n* **Isolation boundary:** Unit tests must not call production services or depend on uncontrolled network access, shared databases, system time, randomness, or machine-specific environments.\r\n* **Pragmatic doubles:** Prefer a reusable named fake for complex dependencies. Use focused stubs, mocks, spies, or patches only for one-off scenarios (e.g., timeouts, retries, or verifying side effects).\r\n* **No scattered patching:** Do not scatter patches of third-party libraries. Wrap external services in thin project-owned adapters and test the adapter with focused integration tests.\r\n\r\n## Test Qualities and Determinism\r\n\r\n* **F.I.R.S.T. unit tests:** Keep unit tests Fast, Independent (no shared mutable state), Repeatable (order-independent), Self-validating, and Timely (written alongside code).\r\n* **Deterministic environment:** Freeze or inject time, randomness, locale, timezone, and API responses to eliminate flakiness.\r\n* **Cleanup and isolation:** New tests must not introduce shared mutable state, order dependence, or environment leakage, and must respect the repository's supported execution model.\r\n* **Readable naming:** Name tests as readable behavior statements including the condition and expected outcome (e.g., `test_order_total_includes_tax_when_region_is_eu`), preferring one behavior per test.\r\n\r\n## Dependencies and Composition\r\n\r\n* **Explicit injection:** Prefer constructor injection for long-lived dependencies and function parameters for transient operation values. Avoid hidden dependencies via mutable global state or static service locators.\r\n* **Composition root:** In application code with meaningful infrastructure boundaries, keep vendor-specific construction and wiring at the composition root or framework bootstrap layer.\r\n* **Framework lifecycle:** Use singleton lifecycles only when the dependency is thread-safe and intentionally shared. Allow immutable constants and pure functions.\r\n\r\n## Third-Party Libraries & Adaptability\r\n\r\n* **Project-owned boundaries:** Wrap external integrations (databases, payment providers, third-party APIs) in project-owned adapters. Domain logic must depend on these local contracts, not vendor SDK types or vendor-specific exceptions.\r\n* **Capability-focused design:** Shape adapter contracts around the specific capability the application needs, not the vendor's entire API. Do not create one-to-one mirror interfaces.\r\n* **Pragmatic direct usage:** Allow direct third-party imports only for small, stable utility libraries with no external lifecycle or I/O.\r\n* **YAGNI abstraction:** Do not add abstractions solely for \"future vendor replacement.\" Introduce adapters to create clean testing seams, isolate I/O, or centralize cross-cutting concerns (retries, timeouts, error mapping).\r\n\r\n## Dependency Hygiene and Security\r\n\r\n* **Lockfile maintenance:** For deployable applications and services, commit and maintain the ecosystem-appropriate lockfile when repository policy requires it. Never edit lockfiles manually; update them only using the repository's package manager in the same commit as the manifest change.\r\n* **Scope enforcement:** Do not add, remove, or upgrade dependencies unless explicitly requested by the task or required to resolve a verified security vulnerability.\r\n* **Upgrade diligence:** When modifying dependencies, review the lockfile diff, transitive changes, release notes, and licenses.\r\n\r\n## Formatting\r\n\r\n* **Enforce existing rules:** Follow the repository’s configured formatter, linter, editor settings, and file-specific rules. Do not debate styling choices already enforced.\r\n* **No unsolicited styling:** Do not make unrelated, style-only changes outside files affected by the task. Do not introduce new formatters, configurations, or mass-formatting diffs during unrelated tasks.\r\n* **Execution:** Run the applicable formatter on changed files. If formatting would create a broad unrelated diff, prefer check mode or isolate formatting in a separate intentional change. Treat unsafe autocorrect modes as code changes—review their diffs and run verification.\r\n\r\n## Logging and Observability\r\n\r\n* **No ad-hoc logs:** Use the repository’s logging abstraction. Never use print statements, `console.log`, or raw string concatenation for production observability.\r\n* **Structured data:** Production service logs must be structured and machine-queryable (JSON preferred when no standard exists). Let the framework supply metadata like timestamps and environment context.\r\n* **Correlation:** Include correlation IDs (`trace_id`, `request_id`, `operation_id`) when available, but do not force irrelevant identifiers into every event.\r\n* **CLI output:** Keep CLI output human-readable, sending diagnostics and errors to stderr.\r\n\r\n## Log Levels and Safety\r\n\r\n* **Logging levels:** Log at `DEBUG` for high-volume troubleshooting, `INFO` for operation/business lifecycles, `WARN` for unexpected but recoverable conditions, and `ERROR` for operation failures.\r\n* **Contextual safety:** Include error types, operations, and stack traces when logging failures. Never log secrets, credentials, auth headers, session tokens, payment data, raw request/responses, or unredacted personal data.\r\n* **No substitute:** Do not use logs as a substitute for metrics, traces, audit records, or automated tests.\r\n\r\n## Git Hygiene\r\n\r\n* **Atomic commits:** Make each commit atomic and reviewable (include code, tests, migrations, config, and docs together for one change). Do not combine unrelated refactors or formatting changes with functional fixes.\r\n* **Verify before commit:** Run the repository's build, formatting, linting, type-checking, and tests before committing. If the baseline fails or checks cannot run, document it in the commit or PR.\r\n* **Commit conventions:** Follow the repository’s commit-message convention. Use Conventional Commits (`<type>(<scope>): <summary>`) only if already adopted or explicitly requested.\r\n* **Descriptions & History:** PR descriptions must explain *why* the change is needed, summarize verification, and state limitations. Never amend published commits, force-push shared branches, or alter history unless requested.\r\n\r\n---\r\n\r\n# TecConcursos — Contexto operacional observado\r\n\r\nEste contexto reúne apenas contratos observados no código deste projeto, no HTML fornecido pelo usuário, nas páginas abertas durante a depuração e no log detalhado de 23/07/2026. Ele orienta futuras alterações, mas não substitui uma nova inspeção quando o site mudar.\r\n\r\n## Escopo do userscript\r\n\r\n- Domínio observado: `https://www.tecconcursos.com.br`.\r\n- O bundle é carregado em qualquer rota `https://www.tecconcursos.com.br/*` (e no domínio sem `www`) para que a Biblioteca TC esteja disponível globalmente. A coleta de questões continua limitada às páginas de caderno/filtro; a busca de reutilização usa a listagem de `/questoes/pastas/{id}` e a página do caderno/ impressão.\n- A sessão, login, assinatura e permissões pertencem ao navegador e ao TecConcursos. O script não deve armazenar ou registrar credenciais, cookies, tokens ou cabeçalhos.\r\n- A automação usa a UI real do site, especialmente Angular e seus eventos, em vez de presumir que um `click()` em texto decorativo seja suficiente.\r\n\r\n## Identificação de pasta\r\n\r\n- Uma pasta foi observada em `/questoes/pastas/{id}`; o exemplo usado foi `6423024`.\r\n- A página de filtros usa `https://www.tecconcursos.com.br/questoes/filtrar?idPasta={id}`.\r\n- O ID pode desaparecer ao navegar. Por isso ele deve ser salvo no estado da execução e usado para reconstruir a URL de filtros.\r\n- O ID da pasta não deve ser inferido de texto visual se já estiver disponível na URL, no estado persistido ou em um atributo de link.\n- A busca de materiais deve comparar o nome exato do MAT com links `a[href*='/questoes/cadernos/']`; não deve tratar links de `/questoes/pastas/` como cadernos. Se não encontrar o caderno, somente então deve abrir a URL de filtros e criar um novo.\n\r\n## Filtros de matéria e assunto\r\n\r\n- O painel observado mostra a área “Matéria e assunto”. Depois de uma busca, o cabeçalho pode aparecer como “Nome”; o reconhecimento deve considerar os dois estados.\r\n- A árvore usa itens com `.arvore-item-conteudo.arvore-borda` e `ng-click=\"vm.notificarClick()\"`. O `span.arvore-item-nome` é texto visual; o clique confiável deve ocorrer no contêiner Angular ou usar o fallback Angular validado pelos testes.\r\n- O assunto de exemplo foi `Coerência. Coesão (Anáfora, Catáfora, Uso dos Conectores - Pronomes Relativos, Conjunções, etc)`.\r\n- O nome do caderno deve ser o título do plano, por exemplo `Coesão textual - Conectivos básicos`, e não o título da taxonomia do TecConcursos.\r\n- O plano pode ser exportado pelo painel em Markdown consolidado (`Tecconcursos_Materias_Consolidado-{data}.md`) com `plan.serializePlan`, no formato reverso do import: grupos, linhas `MAT-xxx — título`/`PRAT-xx — título` e `TecConcursos: ID — caminho`.\r\n- A seleção de banca é feita clicando no item real da árvore. O nome observado para a banca foi `OBJETIVA CONCURSOS`; outros nomes devem ser resolvidos pelo texto real exibido pelo site.\r\n- Os anos devem ser selecionados clicando nos itens da árvore. Não se deve apenas escrever o ano em um campo, porque a seleção precisa atualizar o estado Angular do filtro.\r\n- Critérios solicitados pelo plano: anos `2016` a `2026` conforme a lista configurada, remover questões desatualizadas e remover questões anuladas.\r\n- O contador de resultados aparece em um `strong.ng-binding`; ele deve ser lido depois que os filtros terminarem de carregar, nunca imediatamente após o clique.\r\n\r\n## Criação do caderno\r\n\r\n- O campo do nome observado foi `#nomeCadernoId`, com `ng-model=\"vm.nomeCaderno\"` e `ng-model-options=\"{ updateOn: 'blur' }\"`.\r\n- O procedimento confiável é clicar, preencher, disparar `input`/`change` quando necessário e disparar `blur` para sincronizar o `ng-model`.\r\n- O botão observado foi `button[ng-click=\"vm.gerarCaderno()\"]`; ele fica desabilitado quando não há nome, filtros ou questões.\r\n- O estado deve registrar o índice e o título do MAT antes de navegar para o caderno criado.\r\n\r\n## Impressão e divisão em partes\r\n\r\n- A aba de impressão observada usa `div[role=\"button\"].aba-navegacao` com ícone `glyphicon-print` e texto `Imprimir`.\r\n- O botão final observado foi `button#confirmar-button` com texto `Imprimir Caderno`.\r\n- O site limita cada saída a no máximo 200 questões.\r\n- A primeira parte começa em `1`; as seguintes usam `201`, `401`, `601` e assim por diante, conforme a quantidade encontrada.\r\n- O campo observado foi `#questaoInicialInput`, cujo `max` é dinâmico.\r\n- A automação deve persistir o intervalo antes de clicar, salvar somente depois de extrair questões válidas e avançar de forma idempotente.\r\n- A página pode carregar o HTML das questões gradualmente via AJAX. “Nenhuma questão no primeiro instante” é estado de espera; ausência definitiva depois do timeout é erro diagnosticável.\r\n- O site também pode chamar `window.print()`. O userscript bloqueia a janela nativa de impressão na página de saída para evitar que o diálogo Ctrl+P interrompa o fluxo.\r\n\r\n## Extração e biblioteca local\r\n\r\n- O HTML da página de impressão é a fonte observada para enunciado, alternativas e metadados como banca, ano, órgão, cargo e vaga.\r\n- As partes são consolidadas por identificador/número original; repetir uma parte não pode duplicar questões.\r\n- A Biblioteca TC organiza os resultados por grupo do plano e permite baixar Excel e HTML.\r\n- O Excel é XLSX real, com cabeçalhos, linhas de questões, metadados e autofiltro.\r\n- O Excel deve manter uma coluna `Imagem N` por posição de imagem; imagens PNG/JPEG/GIF obtidas com as credenciais da página são incorporadas nas partes OOXML de mídia/desenho e a origem permanece como fallback quando a incorporação falhar.\r\n- O HTML interativo usa tema escuro, mantém respostas, mostra feedback de acerto/erro quando `question.answer` existe, marca a alternativa correta, permite alternativas anuladas por duplo clique, salto para questão, filtros e histórico no `localStorage` do próprio documento. A reabertura deve hidratar o estado; reiniciar é uma ação explícita.\r\n- Fragmentos HTML de enunciado e alternativas devem preservar imagens e transformar URLs relativas em absolutas antes de entrar na biblioteca; não remover imagens durante a sanitização.\r\n- Exportações e logs devem omitir segredos e não devem enviar dados para serviço externo.\r\n\r\n## Estado, retomada e concorrência\r\n\r\nEstados operacionais usados pelo projeto: `idle`, `creating-caderno`, `opening-print`, `loading-output`, `waiting-questions`, `extracting`, `saving`, `paused`, `error` e `completed`.\r\n\r\nEventos importantes registram horário, `runId`, aba, fase, caderno, parte, intervalo, quantidade esperada/encontrada, URL, ação, erro e snapshot resumido.\r\n\r\n- A execução possui `runId` e `ownerId` por aba.\r\n- O lock usa lease, heartbeat, renovação, liberação e takeover explícito quando obsoleto.\r\n- Uma aba sem o lease não pode retomar ou imprimir a execução de outra aba; um comando explícito de Parar pode encaminhar uma solicitação à aba proprietária, mas somente a aba proprietária grava a pausa e libera o lease.\n- O estado persistido deve preservar partes concluídas, próximo intervalo, índice do MAT, URL de filtros, URL da pasta, modo `reuseExistingCadernos` e diagnóstico do erro.\n- Em 23/07/2026, o log mostrou que os botões Pausar/Retomar eram executados, mas Retomar não tinha uma transição quando a página estava em `/questoes/pastas/{id}`. A correção passou a registrar `opening-filter` e reabrir a `filterUrl` salva antes de continuar.\r\n- O userscript registra `GM_registerMenuCommand`/`GM_unregisterMenuCommand` para expor `⏹ Parar automação` e `▶ Retomar automação` no menu de comandos do Tampermonkey; o menu interno de gerenciamento com `Edit`/`Delete` não é extensível pelo script.\r\n- O comando reutiliza `automation.pause()`/`automation.resumePaused()` e os fluxos consultam `ensureRunning` antes de cliques e navegações críticas. Uma navegação já iniciada não é cancelada, mas a próxima transição não deve ocorrer depois que a pausa for persistida.\r\n\r\n## Diagnóstico de falhas\r\n\r\nMensagens e logs devem distinguir:\r\n\r\n1. seletor ausente ou página errada;\r\n2. elemento presente, mas evento Angular não aplicado;\r\n3. contador ainda carregando;\r\n4. impressão nativa interceptada ou popup/dialog bloqueador;\r\n5. página de saída sem questões depois do timeout;\r\n6. lock de outra aba;\r\n7. estado corrompido ou sem URL de retomada.\r\n\r\nUm log detalhado deve permitir saber exatamente em qual URL, MAT, parte, intervalo e fase a execução parou. Eventos antigos podem permanecer no histórico; a UI deve destacar a atividade mais recente.\r\n\r\n## Regras para futuras alterações\r\n\r\n- Antes de alterar seletores, capturar novamente o HTML e confirmar o comportamento Angular.\r\n- Não substituir cliques de itens da árvore por preenchimento textual sem validar que o modelo Angular foi atualizado.\r\n- Não remover a persistência de `folderId`, `filterUrl`, partes concluídas, lease ou histórico.\r\n- Toda correção de fluxo deve incluir um teste de regressão e, quando possível, um teste E2E local com carregamento lento.\r\n- O teste local simula o TecConcursos; ele não prova que o site real não mudou. Uma execução supervisionada real continua necessária antes de uma bateria longa.\r\n- Não publicar mudanças no userscript sem regenerar o bundle, executar `npm run check` e conferir a versão/URL de atualização.\r\n\r\n## Verificação do projeto\r\n\r\nComando principal não interativo:\r\n\r\n```powershell\r\nnpm run check\r\n```\r\n\r\nTestes de fluxo real:\r\n\r\n```powershell\r\nnpm run test:e2e\r\n```\r\n\r\nO bundle publicado usa a URL raw:\r\n\r\n`https://raw.githubusercontent.com/YsraEstudos/Tecconcursos/main/tecconcursos-scraper.user.js`\r\n";
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
    var pollMs = Number(config.pollMs) > 0 ? Number(config.pollMs) : 400;
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
        observer.observe(observationRoot, { childList: true, subtree: true });
      }
      if (!observer) interval = setInterval(check, pollMs);
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
    var html = button(documentNode, "HTML", "tec-scraper-export-html");
    var excel = button(documentNode, "Excel", "tec-scraper-export-excel");
    var clear = button(documentNode, "Limpar", "tec-scraper-clear");
    start.style.background = "#059669";
    stop.style.background = "#dc2626";
    text.style.background = "#2563eb";
    json.style.background = "#4f46e5";
    html.style.background = "#0891b2";
    excel.style.background = "#65a30d";
    clear.style.background = "#4b5563";
    [start, stop, text, json, html, excel, clear].forEach(function (item) { row.appendChild(item); });
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
    html.addEventListener("click", function () {
      if (typeof config.onExportHtml === "function") config.onExportHtml();
    });
    excel.addEventListener("click", function () {
      if (typeof config.onExportExcel === "function") config.onExportExcel();
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

  function completionSummary(plan, entries, progress) {
    var matters = plan && Array.isArray(plan.matters) ? plan.matters : [];
    var savedEntries = Array.isArray(entries) ? entries : [];
    var byCode = savedEntries.reduce(function (result, entry) {
      var code = String(entry && entry.code || "").trim().toUpperCase();
      if (code) result[code] = entry;
      return result;
    }, {});
    return matters.map(function (matter, index) {
      var code = String(matter && matter.code || "").trim().toUpperCase();
      var entry = byCode[code];
      var savedParts = entry && Array.isArray(entry.parts) ? entry.parts.length : 0;
      var savedQuestions = entry && (Number(entry.questionCount) || (Array.isArray(entry.questions) ? entry.questions.length : 0)) || 0;
      var totalQuestions = Number(entry && entry.totalQuestions) || 0;
      var expectedParts = totalQuestions ? Math.ceil(totalQuestions / 200) : 0;
      var complete = Boolean(entry && ((totalQuestions > 0 && savedQuestions >= totalQuestions) || (expectedParts > 0 && savedParts >= expectedParts)));
      var current = Boolean(progress && code && String(progress.matterCode || "").trim().toUpperCase() === code);
      var status = complete ? "completed" : current && progress.phase === "error" ? "failed" : current ? "active" : entry ? "saved" : "pending";
      return {
        code: code,
        title: String(matter && matter.title || code || "MAT sem título"),
        index: index,
        status: status,
        savedParts: savedParts,
        savedQuestions: savedQuestions,
        totalQuestions: totalQuestions
      };
    });
  }

  function createPanel(documentNode, handlers) {
    if (documentNode.getElementById("tec-library-panel")) return null;
    var config = handlers || {};
    var style = documentNode.createElement("style");
    style.textContent = "#tec-library-launcher{position:fixed;left:18px;bottom:18px;z-index:2147483646;border:0;border-radius:999px;background:#1d4ed8;color:#fff;padding:12px 16px;font:700 14px system-ui;box-shadow:0 8px 22px #1e3a8a66;cursor:pointer}#tec-library-panel{position:fixed;left:18px;bottom:18px;z-index:2147483647;width:min(460px,calc(100vw - 36px));max-height:min(720px,calc(100vh - 36px));display:none;flex-direction:column;overflow:hidden;border-radius:16px;background:#f8fafc;color:#172554;box-shadow:0 18px 55px #0f172a55;font:14px system-ui}#tec-library-panel.open{display:flex}#tec-library-panel .head{display:flex;align-items:center;gap:10px;padding:15px 16px;background:linear-gradient(135deg,#1d4ed8,#0f766e);color:#fff}#tec-library-panel .head strong{font-size:16px}#tec-library-panel .head button{margin-left:auto;border:0;background:#ffffff22;color:#fff;border-radius:8px;padding:6px 9px;cursor:pointer}#tec-library-panel .tabs{display:flex;gap:5px;padding:10px 12px;border-bottom:1px solid #dbeafe;background:#fff;overflow-x:auto}#tec-library-panel .tabs button{border:0;border-radius:7px;background:#eff6ff;color:#1e3a8a;padding:7px 10px;cursor:pointer;font-weight:700;white-space:nowrap}#tec-library-panel .tabs button.active{background:#1d4ed8;color:#fff}#tec-library-panel .body{overflow:auto;padding:14px 16px}#tec-library-panel label{display:block;margin:8px 0 4px;font-weight:700}#tec-library-panel textarea,#tec-library-panel input{width:100%;box-sizing:border-box;border:1px solid #bfdbfe;border-radius:8px;padding:8px;font:13px ui-monospace,Consolas,monospace}#tec-library-panel textarea{min-height:106px;resize:vertical}#tec-library-panel .actions{display:flex;gap:7px;flex-wrap:wrap;margin:12px 0}#tec-library-panel .actions button,#tec-library-panel .entry-actions button{border:0;border-radius:8px;background:#1d4ed8;color:#fff;padding:8px 10px;font-weight:700;cursor:pointer}#tec-library-panel .actions button.secondary,#tec-library-panel .entry-actions button.secondary{background:#475569}#tec-library-panel .actions button.danger,#tec-library-panel .entry-actions button.danger{background:#b91c1c}#tec-library-panel .status{min-height:36px;color:#0f766e;font-size:13px;line-height:1.35}#tec-library-panel .hint{padding:10px;border-radius:9px;background:#eff6ff;color:#1e3a8a;font-size:13px;line-height:1.4}#tec-library-panel details{margin:8px 0;border:1px solid #dbeafe;border-radius:9px;background:#fff}#tec-library-panel summary{cursor:pointer;padding:9px 10px;font-weight:700}#tec-library-panel .entry{padding:8px 10px;border-top:1px solid #eff6ff}#tec-library-panel .entry button.entry-open{border:0;background:transparent;color:#1d4ed8;padding:0;text-align:left;font:700 13px system-ui;cursor:pointer}#tec-library-panel .entry small{display:block;margin-top:3px;color:#64748b}#tec-library-panel .entry-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}#tec-library-panel .entry-actions button{font-size:12px;padding:6px 8px}#tec-library-panel .ai-context{margin:0;max-height:500px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;border:1px solid #dbeafe;border-radius:9px;background:#fff;color:#0f172a;padding:12px;font:12px/1.5 ui-monospace,Consolas,monospace}#tec-library-panel .ai-context-actions{display:flex;gap:7px;align-items:center;flex-wrap:wrap;margin:10px 0}";
    documentNode.head.appendChild(style);
    style.textContent += "#tec-library-panel .completion-summary{margin:10px 0;border:1px solid #dbeafe;border-radius:9px;background:#fff;padding:10px}#tec-library-panel .completion-summary strong{display:block;margin-bottom:7px}#tec-library-panel .completion-summary ol{margin:0;padding-left:24px}#tec-library-panel .completion-summary li{padding:3px 0;color:#334155}#tec-library-panel .completion-summary li.completed{color:#047857}#tec-library-panel .completion-summary li.failed{color:#b91c1c}#tec-library-panel .completion-summary li.active{color:#1d4ed8}";
    style.textContent += "#tec-library-launcher-wrap{position:fixed;left:18px;bottom:18px;z-index:2147483646;display:flex;align-items:stretch;gap:6px}#tec-library-launcher{position:static;left:auto;bottom:auto}#tec-library-pause{border:0;border-radius:999px;background:#b91c1c;color:#fff;padding:0 13px;font:700 13px system-ui;box-shadow:0 8px 22px #7f1d1d55;cursor:pointer;white-space:nowrap}#tec-library-pause:hover{background:#991b1b}#tec-library-pause:disabled{background:#94a3b8;box-shadow:none;cursor:not-allowed;opacity:.85}";
    style.textContent += "#tec-library-print-card{display:flex;align-items:center;gap:10px;min-width:0;padding:0;border:1px solid transparent;border-radius:14px;background:transparent;box-shadow:none;transition:padding .5s cubic-bezier(.22,1,.36,1),background .5s ease,box-shadow .5s ease,border-color .5s ease}#tec-library-launcher-wrap.print-mode{gap:0}#tec-library-launcher-wrap.print-mode #tec-library-print-card{padding:9px 12px;background:linear-gradient(135deg,#111827,#1e3a8a);box-shadow:0 12px 32px rgba(15,23,42,.5);border-color:rgba(255,255,255,.14)}#tec-library-launcher{transition:max-width .5s cubic-bezier(.22,1,.36,1),opacity .35s ease,transform .5s cubic-bezier(.22,1,.36,1),padding .5s cubic-bezier(.22,1,.36,1)}#tec-library-launcher-wrap.print-mode #tec-library-launcher{max-width:0;overflow:hidden;padding:0;border:0;opacity:0;transform:translateX(-12px) scale(.88);pointer-events:none}#tec-library-print-card .card-info{display:flex;flex-direction:column;gap:3px;min-width:0;max-width:0;overflow:hidden;white-space:nowrap;opacity:0;transform:translateX(-14px);transition:max-width .5s cubic-bezier(.22,1,.36,1),opacity .35s ease,transform .5s cubic-bezier(.22,1,.36,1)}#tec-library-launcher-wrap.print-mode #tec-library-print-card .card-info{max-width:320px;opacity:1;transform:translateX(0)}#tec-library-print-card .card-label{font:700 10px system-ui;letter-spacing:.14em;text-transform:uppercase;color:#93c5fd;opacity:0;transform:translateY(6px);transition:opacity .3s ease .1s,transform .45s cubic-bezier(.22,1,.36,1) .1s}#tec-library-print-card .card-title{font:700 13px system-ui;color:#f9fafb;text-overflow:ellipsis;overflow:hidden;opacity:0;transform:translateY(6px);transition:opacity .3s ease .18s,transform .45s cubic-bezier(.22,1,.36,1) .18s}#tec-library-print-card .card-meta{display:flex;align-items:center;gap:8px;opacity:0;transform:translateY(6px);transition:opacity .3s ease .26s,transform .45s cubic-bezier(.22,1,.36,1) .26s}#tec-library-print-card .card-parts{font:600 11px system-ui;color:#cbd5e1}#tec-library-print-card .card-remaining{font:700 11px system-ui;color:#fbbf24;background:#78350f66;border:1px solid #fbbf2444;border-radius:999px;padding:1px 8px}#tec-library-print-card .card-bar{height:3px;border-radius:999px;background:#1f2937;overflow:hidden;opacity:0;transition:opacity .3s ease .34s}#tec-library-print-card .card-bar i{display:block;height:100%;width:0;border-radius:999px;background:linear-gradient(90deg,#059669,#3b82f6);transition:width .6s cubic-bezier(.22,1,.36,1)}#tec-library-launcher-wrap.print-mode #tec-library-print-card .card-label,#tec-library-launcher-wrap.print-mode #tec-library-print-card .card-title,#tec-library-launcher-wrap.print-mode #tec-library-print-card .card-meta,#tec-library-launcher-wrap.print-mode #tec-library-print-card .card-bar{opacity:1;transform:translateY(0)}";

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
    var launcherPause = button(documentNode, "⏹ Parar", "");
    launcherPause.id = "tec-library-pause";
    launcherPause.dataset.tecScraperVersion = "2.7.3";
    launcherPause.setAttribute("aria-label", "Parar automação");
    var printCard = documentNode.createElement("div");
    printCard.id = "tec-library-print-card";
    var cardInfo = documentNode.createElement("div");
    cardInfo.className = "card-info";
    var cardLabel = documentNode.createElement("span");
    cardLabel.className = "card-label";
    cardLabel.textContent = "Imprimindo caderno";
    var cardTitle = documentNode.createElement("span");
    cardTitle.className = "card-title";
    cardTitle.textContent = "Caderno";
    var cardMeta = documentNode.createElement("span");
    cardMeta.className = "card-meta";
    var cardParts = documentNode.createElement("span");
    cardParts.className = "card-parts";
    var cardRemaining = documentNode.createElement("span");
    cardRemaining.className = "card-remaining";
    cardMeta.appendChild(cardParts);
    cardMeta.appendChild(cardRemaining);
    var cardBar = documentNode.createElement("span");
    cardBar.className = "card-bar";
    var cardBarFill = documentNode.createElement("i");
    cardBar.appendChild(cardBarFill);
    cardInfo.appendChild(cardLabel);
    cardInfo.appendChild(cardTitle);
    cardInfo.appendChild(cardMeta);
    cardInfo.appendChild(cardBar);
    printCard.appendChild(cardInfo);
    printCard.appendChild(launcherPause);
    var launcherWrap = documentNode.createElement("div");
    launcherWrap.id = "tec-library-launcher-wrap";
    launcherWrap.appendChild(launcher);
    launcherWrap.appendChild(printCard);
    var panel = documentNode.createElement("section");
    panel.id = "tec-library-panel";
    panel.dataset.tecScraperVersion = "2.7.3";
    launcher.dataset.tecScraperVersion = "2.7.3";
    panel.innerHTML = "<div class=\"head\"><strong>Biblioteca de Cadernos <small>v2.7.3</small></strong><button type=\"button\" data-action=\"close\">Fechar</button></div><div class=\"tabs\"><button type=\"button\" class=\"active\" data-tab=\"automation\">Automação</button><button type=\"button\" data-tab=\"library\">Pastas e arquivos</button><button type=\"button\" data-tab=\"ai-context\">AI Context</button></div><div class=\"body\"></div>";
    documentNode.body.appendChild(launcherWrap);
    documentNode.body.appendChild(panel);
    var body = panel.querySelector(".body");
    var activeTab = "automation";
    var progressTimer = null;
    var progressTimerMs = 0;
    var refreshFrame = null;
    var refreshIncludesSummary = false;
    var lastProgressSignature = null;

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
      var message = String(progress.message || (progress.running ? "Processo em andamento." : "Pronto."));
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

    function scheduleProgressRefresh(includeSummary) {
      refreshIncludesSummary = refreshIncludesSummary || includeSummary !== false;
      if (refreshFrame != null) return;
      var pageWindow = documentNode.defaultView || {};
      var request = typeof pageWindow.requestAnimationFrame === "function"
        ? pageWindow.requestAnimationFrame.bind(pageWindow)
        : function (callback) { return setTimeout(callback, 0); };
      refreshFrame = request(function () {
        refreshFrame = null;
        var shouldIncludeSummary = refreshIncludesSummary;
        refreshIncludesSummary = false;
        refreshProgress(shouldIncludeSummary);
      });
    }

    function updateProgressTimer(progress) {
      var isOpen = panel.classList.contains("open");
      var desiredInterval = isOpen ? 2000 : progress.running ? 5000 : 0;
      if (!desiredInterval) {
        if (progressTimer != null) clearInterval(progressTimer);
        progressTimer = null;
        progressTimerMs = 0;
        return;
      }
      if (progressTimer != null && progressTimerMs === desiredInterval) return;
      if (progressTimer != null) clearInterval(progressTimer);
      progressTimerMs = desiredInterval;
      progressTimer = setInterval(function () { refreshProgress(false); }, desiredInterval);
    }

    function renderCompletionSummary() {
      var node = body.querySelector("#tec-completion-summary");
      if (!node) return;
      var rows = completionSummary(
        typeof config.getPlan === "function" ? config.getPlan() : { matters: [] },
        typeof config.listLibrary === "function" ? config.listLibrary() : [],
        progressSnapshot()
      );
      node.innerHTML = "";
      var heading = documentNode.createElement("strong");
      heading.textContent = "Progresso salvo do plano";
      node.appendChild(heading);
      if (!rows.length) {
        var empty = documentNode.createElement("div");
        empty.textContent = "Nenhuma matéria foi importada ainda.";
        node.appendChild(empty);
        return;
      }
      var completed = rows.filter(function (row) { return row.status === "completed"; }).length;
      heading.textContent += " — " + completed + "/" + rows.length + " concluído(s)";
      var list = documentNode.createElement("ol");
      rows.forEach(function (row) {
        var item = documentNode.createElement("li");
        item.className = row.status;
        var label = row.status === "completed" ? "concluído" : row.status === "failed" ? "erro nesta etapa" : row.status === "active" ? "em andamento" : row.status === "saved" ? "salvo parcialmente" : "pendente";
        var detail = row.savedParts ? " — " + row.savedParts + " parte(s) salva(s)" : "";
        item.textContent = row.code + " — " + row.title + ": " + label + detail;
        list.appendChild(item);
      });
      node.appendChild(list);
    }

    function updatePrintCard(progress) {
      var printMode = Boolean(progress && progress.running && Number(progress.rangesTotal) > 0 && progress.rangeIndex != null);
      launcherWrap.classList.toggle("print-mode", printMode);
      if (!printMode) return;
      var total = Math.max(1, Number(progress.rangesTotal) || 1);
      var index = Math.max(0, Number(progress.rangeIndex) || 0);
      var remaining = Math.max(0, total - index - 1);
      cardTitle.textContent = String(progress.matterTitle || "Caderno");
      cardTitle.title = String(progress.matterTitle || "");
      cardParts.textContent = "Parte " + String(index + 1) + " de " + total;
      cardRemaining.textContent = remaining <= 0 ? "última parte" : remaining === 1 ? "falta 1 parte" : "faltam " + remaining + " partes";
      cardBarFill.style.width = Math.min(100, Math.round((index / total) * 100)) + "%";
    }

    function progressSignature(progress) {
      return [
        progress.running, progress.phase, progress.stale, progress.lockedByOtherTab,
        progress.message, progress.updatedAt,
        progress.matterIndex, progress.mattersTotal,
        progress.rangeIndex, progress.rangesTotal,
        progress.matterTitle, progress.matterCode
      ].map(function (value) { return String(value == null ? "" : value); }).join("|");
    }

    function refreshProgress(includeSummary) {
      var progress = progressSnapshot();
      var signature = progressSignature(progress);
      if (signature === lastProgressSignature) {
        updateProgressTimer(progress);
        return;
      }
      lastProgressSignature = signature;
      var label = progressLabel(progress);
      launcherStatus.textContent = label;
      launcher.title = progressDetails(progress);
      launcherPause.disabled = !progress.running;
      launcherPause.title = progress.running ? "Parar a automação agora. " + progressDetails(progress) : "A automação não está em execução.";
      updatePrintCard(progress);
      var progressNode = body.querySelector("#tec-progress");
      if (progressNode) {
        progressNode.textContent = progressDetails(progress);
        progressNode.style.color = progress.phase === "error" || progress.stale ? "#b91c1c" : progress.phase === "paused" ? "#92400e" : "#1e3a8a";
      }
      updateProgressTimer(progress);
      if (includeSummary !== false) renderCompletionSummary();
    }

    function handleLauncherPause() {
      if (launcherPause.disabled) return;
      try {
        Promise.resolve(config.onPause && config.onPause("library-launcher")).then(function (message) {
          setStatus(message || "Pausa solicitada.", false);
          refreshProgress();
        }).catch(handleAutomationError);
      } catch (error) { handleAutomationError(error); }
    }

    function handleAutomationError(error) {
      if (config.onError) {
        try { config.onError(error); } catch (_) {}
      }
      setStatus(error && error.message || error, true);
      scheduleProgressRefresh(true);
    }

    function setStatus(message, isError) {
      var node = body.querySelector(".status");
      if (!node) return;
      node.textContent = String(message || "");
      node.style.color = isError ? "#b91c1c" : "#0f766e";
      scheduleProgressRefresh(false);
    }

    function automationView() {
      var plan = typeof config.getPlan === "function" ? config.getPlan() : { matters: [] };
      body.innerHTML = "<div class=\"hint\">Cole ou selecione o seu <code>Tecconcursos_Materias_Consolidado.md</code> (ou JSON). O plano fica salvo no script e cada MAT vira um caderno no TecConcursos.</div><label for=\"tec-plan-file\">Arquivo do plano</label><input id=\"tec-plan-file\" type=\"file\" accept=\".md,.txt,.json,text/plain,text/markdown,application/json\"><label for=\"tec-plan-input\">Plano de matérias</label><textarea id=\"tec-plan-input\" placeholder=\"MAT-001 — Coesão textual&#10;TecConcursos: 12507 — Língua Portuguesa ...\"></textarea><div class=\"actions\"><button type=\"button\" data-action=\"import\">Salvar plano</button><button type=\"button\" data-action=\"export-plan\" class=\"secondary\">Exportar plano</button></div><div class=\"hint\" id=\"tec-plan-summary\">Plano atual: " + String(plan.matters && plan.matters.length || 0) + " matéria(s), " + String(plan.banks && plan.banks.length || 0) + " banca(s) e " + String(plan.years && plan.years.length || 0) + " ano(s).</div><label for=\"tec-folder-id\">ID da pasta de destino no TecConcursos</label><input id=\"tec-folder-id\" value=\"" + String(typeof config.defaultFolderId === "function" ? config.defaultFolderId() : "") + "\" inputmode=\"numeric\"><div class=\"actions\"><button type=\"button\" data-action=\"create\">Criar e exportar plano</button><button type=\"button\" data-action=\"current\" class=\"secondary\">Exportar caderno atual</button><button type=\"button\" data-action=\"pause\" class=\"danger\">Pausar</button><button type=\"button\" data-action=\"resume\" class=\"secondary\">Retomar execução</button><button type=\"button\" data-action=\"takeover\" class=\"secondary\">Assumir execução</button><button type=\"button\" data-action=\"diagnostics\" class=\"secondary\">Baixar log detalhado</button></div><div class=\"hint\" id=\"tec-progress\"></div><div class=\"status\"></div>";
      body.innerHTML = body.innerHTML.replace("<div class=\"hint\" id=\"tec-progress\"></div>", "<div class=\"hint\" id=\"tec-progress\"></div><div id=\"tec-completion-summary\" class=\"completion-summary\"></div>");
      var folderInput = body.querySelector("#tec-folder-id");
      folderInput.addEventListener("input", function () {
        if (config.onFolderIdChange) config.onFolderIdChange(folderInput.value);
      });
      var createAction = body.querySelector("[data-action='create']");
      if (createAction && createAction.parentNode) {
        var restartAction = button(documentNode, "Reiniciar busca de materiais", "secondary");
        restartAction.dataset.action = "restart";
        createAction.parentNode.insertBefore(restartAction, createAction.nextSibling);
      }
      setStatus(typeof config.getStatus === "function" ? config.getStatus() : "Pronto.", false);
      refreshProgress();
      body.querySelector("[data-action='import']").addEventListener("click", function () {
        try {
          var result = config.onImport && config.onImport(body.querySelector("#tec-plan-input").value);
          automationView();
          setStatus(result || "Plano salvo.", false);
        } catch (error) { setStatus(error.message || error, true); }
      });
      body.querySelector("[data-action='export-plan']").addEventListener("click", function () {
        try {
          var result = config.onExportPlan && config.onExportPlan();
          setStatus(result || "Plano exportado.", false);
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
      body.querySelector("[data-action='restart']").addEventListener("click", function () {
        try { Promise.resolve(config.onRestart && config.onRestart(body.querySelector("#tec-folder-id").value)).then(function (message) { setStatus(message || "Busca de materiais reiniciada.", false); refreshProgress(); }).catch(handleAutomationError); } catch (error) { handleAutomationError(error); }
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
          info.textContent = String(entry.questionCount || (entry.questions ? entry.questions.length : 0) || entry.totalQuestions || 0) + " questões · " + String(entry.parts ? entry.parts.length : 0) + " parte(s)";
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
    launcher.addEventListener("click", function () { panel.classList.add("open"); launcherWrap.style.display = "none"; render(); });
    launcherPause.addEventListener("click", function (event) {
      if (event && typeof event.stopPropagation === "function") event.stopPropagation();
      handleLauncherPause();
    });
    panel.querySelector("[data-action='close']").addEventListener("click", function () {
      panel.classList.remove("open");
      launcherWrap.style.display = "flex";
      scheduleProgressRefresh(false);
    });
    Array.from(panel.querySelectorAll("[data-tab]")).forEach(function (tab) {
      tab.addEventListener("click", function () { activeTab = tab.getAttribute("data-tab"); render(); });
    });
    var pageWindow = documentNode.defaultView || {};
    if (typeof pageWindow.addEventListener === "function") {
      pageWindow.addEventListener("storage", function () { scheduleProgressRefresh(false); });
    }
    refreshProgress(false);
    return { panel: panel, launcher: launcher, pauseButton: launcherPause, open: function () { panel.classList.add("open"); launcherWrap.style.display = "none"; render(); }, refresh: render, setStatus: setStatus };
  }

  return { createPanel: createPanel, completionSummary: completionSummary };
});

// ---- automation-controls.cjs ----
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

// ---- print-blocker.cjs ----
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) {
    root.TecConcursosModules = root.TecConcursosModules || {};
    root.TecConcursosModules.printBlocker = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var OUTPUT_PATH = /\/questoes\/cadernos\/\d+\/imprimir(?:\/|$)/i;
  var IMAGE_PLACEHOLDER = "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";
  var PRINT_TARGETS = [];
  var GUARD_RECORDS = [];
  var PROTOTYPE_PATCHES = [];
  var BRIDGE_DOCUMENTS = [];
  var IMAGE_GUARD_RECORDS = [];

  function locationBase(target) {
    var location = target && target.location;
    if (location && location.href) return String(location.href);
    return "https://www.tecconcursos.com.br" + String(location && location.pathname || "/");
  }

  function routePath(value, target) {
    if (value == null || value === "") return "";
    try {
      return new URL(String(value), locationBase(target)).pathname;
    } catch (_) {
      return String(value).split(/[?#]/)[0];
    }
  }

  function isPrintRoute(value, target) {
    return OUTPUT_PATH.test(routePath(value, target));
  }

  function imageSource(value, target) {
    var raw = String(value == null ? "" : value).trim();
    if (!raw || raw === IMAGE_PLACEHOLDER) return "";
    try { return new URL(raw, locationBase(target)).href; } catch (_) { return raw; }
  }

  function deferImageLoading(image, target) {
    if (!image || typeof image.getAttribute !== "function" || typeof image.setAttribute !== "function") return false;
    if (image.getAttribute("data-tec-image-deferred") === "1") return false;
    var source = image.getAttribute("data-tec-original-src") || image.getAttribute("src") || image.getAttribute("data-src") || "";
    var sourceSet = image.getAttribute("data-tec-original-srcset") || image.getAttribute("srcset") || "";
    if (!source && !sourceSet) return false;
    if (source) image.setAttribute("data-tec-original-src", imageSource(source, target));
    if (sourceSet) {
      image.setAttribute("data-tec-original-srcset", sourceSet);
      if (typeof image.removeAttribute === "function") image.removeAttribute("srcset");
    }
    image.setAttribute("loading", "lazy");
    image.setAttribute("decoding", "async");
    if (source && source !== IMAGE_PLACEHOLDER) image.setAttribute("src", IMAGE_PLACEHOLDER);
    image.setAttribute("data-tec-image-deferred", "1");
    return true;
  }

  var IMAGE_GUARD_IDLE_MS = 120000;

  function installImageGuard(target, documentNode) {
    if (!documentNode) return false;
    var existing = IMAGE_GUARD_RECORDS.find(function (item) { return item.target === target && item.document === documentNode; });
    if (existing) return true;
    var scan = function (rootNode) {
      if (!rootNode) return;
      if (String(rootNode.tagName || "").toUpperCase() === "IMG") deferImageLoading(rootNode, target);
      if (typeof rootNode.querySelectorAll === "function") Array.from(rootNode.querySelectorAll("img")).forEach(function (image) { deferImageLoading(image, target); });
    };
    scan(documentNode);
    var Observer = target && target.MutationObserver;
    if (!Observer && documentNode.defaultView) Observer = documentNode.defaultView.MutationObserver;
    var observer = null;
    var queue = [];
    var frame = null;
    var idleTimer = null;
    var disposed = false;

    function flush() {
      frame = null;
      if (disposed) return;
      var pending = queue;
      queue = [];
      for (var i = 0; i < pending.length; i += 1) scan(pending[i]);
      armIdle();
    }

    function scheduleFlush() {
      if (frame != null || disposed) return;
      var view = documentNode.defaultView || {};
      var request = typeof view.requestAnimationFrame === "function"
        ? view.requestAnimationFrame.bind(view)
        : function (callback) { return setTimeout(callback, 16); };
      frame = request(flush);
    }

    function armIdle() {
      if (idleTimer != null) clearTimeout(idleTimer);
      idleTimer = setTimeout(function () { idleTimer = null; dispose(); }, IMAGE_GUARD_IDLE_MS);
    }

    function dispose() {
      if (disposed) return;
      disposed = true;
      if (idleTimer != null) { clearTimeout(idleTimer); idleTimer = null; }
      if (observer && observer.disconnect) observer.disconnect();
      observer = null;
    }

    if (typeof Observer === "function") {
      try {
        observer = new Observer(function (mutations) {
          for (var i = 0; i < mutations.length; i += 1) {
            var added = mutations[i].addedNodes || [];
            for (var j = 0; j < added.length; j += 1) queue.push(added[j]);
          }
          scheduleFlush();
        });
        observer.observe(documentNode.body || documentNode.documentElement || documentNode, { childList: true, subtree: true });
      } catch (_) { observer = null; }
    }
    armIdle();
    IMAGE_GUARD_RECORDS.push({ target: target, document: documentNode, observer: observer, dispose: dispose });
    return true;
  }

  function formAction(form) {
    if (!form) return "";
    if (typeof form.getAttribute === "function") {
      var attribute = form.getAttribute("action");
      if (attribute) return attribute;
    }
    return form.action || "";
  }

  function isPrintForm(form, target) {
    return isPrintRoute(formAction(form), target);
  }

  function installPrintBlock(target) {
    if (!target) return false;
    if (PRINT_TARGETS.indexOf(target) >= 0) return true;
    var blocked = function () { return undefined; };
    try {
      Object.defineProperty(target, "print", {
        configurable: false,
        enumerable: true,
        get: function () { return blocked; },
        set: function () {}
      });
      PRINT_TARGETS.push(target);
      return true;
    } catch (_) {
      try {
        target.print = blocked;
        if (target.print !== blocked) return false;
        PRINT_TARGETS.push(target);
        return true;
      } catch (_) {
        return false;
      }
    }
  }

  function replaceFunction(target, name, replacement) {
    if (!target || typeof target[name] !== "function") return false;
    var descriptor;
    try { descriptor = Object.getOwnPropertyDescriptor(target, name); } catch (_) {}
    try {
      if (descriptor) {
        Object.defineProperty(target, name, Object.assign({}, descriptor, { value: replacement }));
      } else {
        target[name] = replacement;
      }
      return target[name] === replacement;
    } catch (_) {
      try {
        target[name] = replacement;
        return target[name] === replacement;
      } catch (_) {
        return false;
      }
    }
  }

  function patchFormMethod(target, methodName, windowLike) {
    var constructor = target && target.HTMLFormElement;
    var prototype = constructor && constructor.prototype;
    if (!prototype || typeof prototype[methodName] !== "function") return false;
    if (PROTOTYPE_PATCHES.some(function (item) { return item.prototype === prototype && item.method === methodName; })) return true;
    var original = prototype[methodName];
    var replacement = function () {
      if (isPrintForm(this, windowLike)) return undefined;
      return original.apply(this, arguments);
    };
    if (!replaceFunction(prototype, methodName, replacement)) return false;
    PROTOTYPE_PATCHES.push({ prototype: prototype, method: methodName });
    return true;
  }

  function elementFromEvent(event) {
    var node = event && event.target;
    if (!node) return null;
    if (typeof node.closest === "function") {
      return node.closest("a,button,input,form") || node;
    }
    return node;
  }

  function formFromElement(node) {
    if (!node) return null;
    if (String(node.tagName || "").toUpperCase() === "FORM") return node;
    if (node.form) return node.form;
    var current = node.parentNode;
    while (current) {
      if (String(current.tagName || "").toUpperCase() === "FORM") return current;
      current = current.parentNode;
    }
    return null;
  }

  function eventTargetsPrint(event, windowLike, eventType) {
    var node = elementFromEvent(event);
    if (!node) return false;
    if (String(node.tagName || "").toUpperCase() === "FORM") return isPrintForm(node, windowLike);
    if (isPrintRoute(node.href || (typeof node.getAttribute === "function" && node.getAttribute("href")), windowLike)) return true;
    var explicitFormAction = typeof node.getAttribute === "function" ? node.getAttribute("formaction") : "";
    if (explicitFormAction && isPrintRoute(explicitFormAction, windowLike)) return true;
    var form = formFromElement(node);
    if (eventType === "submit") return isPrintForm(form || node, windowLike);
    if (eventType === "click" && form && isPrintForm(form, windowLike)) {
      var tagName = String(node.tagName || "").toUpperCase();
      var type = String(node.type || "").toLowerCase();
      return tagName === "BUTTON" || tagName === "INPUT" || type === "submit";
    }
    return false;
  }

  function cancelEvent(event) {
    if (!event) return;
    if (typeof event.preventDefault === "function") event.preventDefault();
    if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
    if (typeof event.stopPropagation === "function") event.stopPropagation();
  }

  function installDomGuards(target, documentNode) {
    if (!documentNode || typeof documentNode.addEventListener !== "function") return false;
    var record = GUARD_RECORDS.find(function (item) { return item.target === target && item.document === documentNode; });
    if (record) return true;
    var clickHandler = function (event) {
      if (eventTargetsPrint(event, target, "click")) cancelEvent(event);
    };
    var submitHandler = function (event) {
      if (eventTargetsPrint(event, target, "submit")) cancelEvent(event);
    };
    documentNode.addEventListener("click", clickHandler, true);
    documentNode.addEventListener("submit", submitHandler, true);
    GUARD_RECORDS.push({ target: target, document: documentNode, click: clickHandler, submit: submitHandler });
    return true;
  }

  function installOpenGuard(target) {
    if (!target || typeof target.open !== "function") return false;
    var record = GUARD_RECORDS.find(function (item) { return item.target === target && item.open; });
    if (record) return true;
    var original = target.open;
    var replacement = function (url) {
      if (isPrintRoute(url, target)) return null;
      return original.apply(this, arguments);
    };
    if (!replaceFunction(target, "open", replacement)) return false;
    GUARD_RECORDS.push({ target: target, open: replacement });
    return true;
  }

  function installPrintGuards(target, documentNode) {
    if (!target) return false;
    installPrintBlock(target);
    installOpenGuard(target);
    patchFormMethod(target, "submit", target);
    patchFormMethod(target, "requestSubmit", target);
    installDomGuards(target, documentNode);
    return true;
  }

  function pageWorldSource() {
    return String.raw`(function(){if(window.__tecConcursosPrintGuard)return;var route=/\/questoes\/cadernos\/\d+\/imprimir(?:\/|$)/i.test(String(location&&location.pathname||''));if(!route)return;var placeholder='${IMAGE_PLACEHOLDER}';var isPrint=function(value){if(value==null||value==='')return false;try{return /\/questoes\/cadernos\/\d+\/imprimir(?:\/|$)/i.test(new URL(String(value),location.href).pathname);}catch(_){return /\/questoes\/cadernos\/\d+\/imprimir/i.test(String(value));}};var defer=function(image){if(!image||!image.getAttribute||!image.setAttribute||image.getAttribute('data-tec-image-deferred')==='1')return;var source=image.getAttribute('data-tec-original-src')||image.getAttribute('src')||image.getAttribute('data-src')||'';var sourceSet=image.getAttribute('data-tec-original-srcset')||image.getAttribute('srcset')||'';if(!source&&!sourceSet)return;if(source&&source!==placeholder)image.setAttribute('data-tec-original-src',source);if(sourceSet){image.setAttribute('data-tec-original-srcset',sourceSet);image.removeAttribute&&image.removeAttribute('srcset');}image.setAttribute('loading','lazy');image.setAttribute('decoding','async');if(source&&source!==placeholder)image.setAttribute('src',placeholder);image.setAttribute('data-tec-image-deferred','1');};var scan=function(node){if(!node)return;if(String(node.tagName||'').toUpperCase()==='IMG')defer(node);if(node.querySelectorAll)Array.prototype.forEach.call(node.querySelectorAll('img'),defer);};scan(document);var Observer=window.MutationObserver;if(typeof Observer==='function'&&!window.__tecConcursosImageObserver){try{var queue=[];var frame=null;var idle=null;var flush=function(){frame=null;var pending=queue;queue=[];for(var q=0;q<pending.length;q+=1)scan(pending[q]);clearTimeout(idle);idle=setTimeout(function(){idle=null;try{observer.disconnect();}catch(_){}},120000);};var schedule=function(){if(frame!=null)return;var raf=window.requestAnimationFrame||function(callback){return setTimeout(callback,16);};frame=raf(flush);};var observer=new Observer(function(mutations){for(var m=0;m<mutations.length;m+=1){var added=mutations[m].addedNodes||[];for(var n=0;n<added.length;n+=1)queue.push(added[n]);}schedule();});observer.observe(document.body||document.documentElement||document,{childList:true,subtree:true});window.__tecConcursosImageObserver=observer;}catch(_){}}var imageProto=window.HTMLImageElement&&window.HTMLImageElement.prototype;var srcDescriptor=imageProto&&Object.getOwnPropertyDescriptor(imageProto,'src');if(srcDescriptor&&srcDescriptor.set){try{Object.defineProperty(imageProto,'src',{configurable:srcDescriptor.configurable,enumerable:srcDescriptor.enumerable,get:srcDescriptor.get,set:function(value){var source=String(value==null?'':value);if(source&&source!==placeholder){this.setAttribute('data-tec-original-src',source);this.setAttribute('loading','lazy');this.setAttribute('decoding','async');this.setAttribute('data-tec-image-deferred','1');return srcDescriptor.set.call(this,placeholder);}return srcDescriptor.set.call(this,value);}});}catch(_){}}var blocked=function(){return undefined;};try{Object.defineProperty(window,'print',{configurable:false,enumerable:true,get:function(){return blocked;},set:function(){}});}catch(_){try{window.print=blocked;}catch(__){}}var originalOpen=window.open;if(typeof originalOpen==='function'){try{Object.defineProperty(window,'open',{configurable:true,writable:true,value:function(url){if(isPrint(url))return null;return originalOpen.apply(this,arguments);}});}catch(_){}}var proto=window.HTMLFormElement&&window.HTMLFormElement.prototype;['submit','requestSubmit'].forEach(function(name){if(!proto||typeof proto[name]!=='function')return;var original=proto[name];try{Object.defineProperty(proto,name,{configurable:true,writable:true,value:function(){var action=this.getAttribute&&this.getAttribute('action')||this.action||'';if(isPrint(action))return undefined;return original.apply(this,arguments);}});}catch(_){}});var cancel=function(event){var node=event&&event.target;var form=node&&(node.form||node);var action=form&&(form.getAttribute&&form.getAttribute('action')||form.action||'');var href=node&&(node.href||(node.getAttribute&&node.getAttribute('href')));if(isPrint(action)||isPrint(href)){event.preventDefault&&event.preventDefault();event.stopImmediatePropagation&&event.stopImmediatePropagation();event.stopPropagation&&event.stopPropagation();}};document.addEventListener('click',cancel,true);document.addEventListener('submit',cancel,true);try{Object.defineProperty(window,'__tecConcursosPrintGuard',{configurable:false,value:true});}catch(_){window.__tecConcursosPrintGuard=true;}})();`;
  }

  function installPageWorldBridge(documentNode, options) {
    if (!documentNode) return false;
    if (BRIDGE_DOCUMENTS.indexOf(documentNode) >= 0) return true;
    var source = pageWorldSource();
    var addElement = options && options.addElement;
    if (typeof addElement === "function") {
      try {
        var added = addElement("script", { textContent: source });
        if (added && typeof added.remove === "function") added.remove();
        if (added) BRIDGE_DOCUMENTS.push(documentNode);
        return Boolean(added);
      } catch (_) {}
    }
    if (typeof documentNode.createElement !== "function") return false;
    var parent = documentNode.documentElement || documentNode.head || documentNode.body;
    if (!parent || typeof parent.appendChild !== "function") return false;
    try {
      var bridge = documentNode.createElement("script");
      bridge.textContent = source;
      parent.appendChild(bridge);
      if (typeof bridge.remove === "function") bridge.remove();
      BRIDGE_DOCUMENTS.push(documentNode);
      return true;
    } catch (_) {
      return false;
    }
  }

  function suppressNativePrintOnOutputPage(rootNode, options) {
    var path = String(rootNode && rootNode.location && rootNode.location.pathname || "");
    if (!OUTPUT_PATH.test(path)) return false;
    var config = options || {};
    if (config.enabled === false) return true;
    var pageWindow = config.pageWindow || (typeof unsafeWindow !== "undefined" ? unsafeWindow : rootNode);
    installPrintGuards(pageWindow, rootNode && rootNode.document);
    installImageGuard(pageWindow, rootNode && rootNode.document);
    var addElement = config.addElement;
    if (typeof addElement !== "function") {
      try { addElement = typeof GM_addElement === "function" ? GM_addElement : null; } catch (_) { addElement = null; }
    }
    installPageWorldBridge(rootNode && rootNode.document, { addElement: addElement });
    return true;
  }

  return {
    OUTPUT_PATH: OUTPUT_PATH,
    installPrintBlock: installPrintBlock,
    installPrintGuards: installPrintGuards,
    installPageWorldBridge: installPageWorldBridge,
    installImageGuard: installImageGuard,
    deferImageLoading: deferImageLoading,
    IMAGE_PLACEHOLDER: IMAGE_PLACEHOLDER,
    isPrintRoute: isPrintRoute,
    suppressNativePrintOnOutputPage: suppressNativePrintOnOutputPage
  };
});

// ---- tampermonkey-menu.cjs ----
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) {
    root.TecConcursosModules = root.TecConcursosModules || {};
    root.TecConcursosModules.tampermonkeyMenu = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var PAUSE_LABEL = "⏹ Parar automação";
  var RESUME_LABEL = "▶ Retomar automação";

  function hasPendingRun(state) {
    return Boolean(state && (state.creation || state.export));
  }

  function commandLabel(state) {
    if (!hasPendingRun(state)) return "";
    return state.running ? PAUSE_LABEL : RESUME_LABEL;
  }

  function apiFunction(rootNode, name) {
    if (rootNode && typeof rootNode[name] === "function") return rootNode[name];
    try {
      return typeof globalThis[name] === "function" ? globalThis[name] : null;
    } catch (_) {
      return null;
    }
  }

  function createMenu(options) {
    var config = options || {};
    var rootNode = config.root || {};
    var register = apiFunction(rootNode, "GM_registerMenuCommand");
    var unregister = apiFunction(rootNode, "GM_unregisterMenuCommand");
    var commandId = null;

    function reportError(error) {
      if (typeof config.onError !== "function") return;
      try { config.onError(error); } catch (_) {}
    }

    function removeCurrentCommand() {
      if (commandId == null || typeof unregister !== "function") {
        commandId = null;
        return;
      }
      try { unregister(commandId); } catch (_) {}
      commandId = null;
    }

    function readState() {
      return typeof config.getState === "function" ? config.getState() : null;
    }

    function refresh() {
      var label;
      try {
        label = commandLabel(readState());
      } catch (error) {
        reportError(error);
        label = "";
      }
      removeCurrentCommand();
      if (!label || typeof register !== "function") return false;

      var callback = function () {
        var state;
        try {
          state = readState();
          var action = state && state.running ? config.onPause : config.onResume;
          if (typeof action !== "function") return undefined;
          return Promise.resolve(action()).then(function (result) {
            refresh();
            return result;
          }, function (error) {
            reportError(error);
            refresh();
            return undefined;
          });
        } catch (error) {
          reportError(error);
          refresh();
          return undefined;
        }
      };

      try {
        commandId = register(label, callback);
        return true;
      } catch (error) {
        commandId = null;
        reportError(error);
        return false;
      }
    }

    function destroy() {
      removeCurrentCommand();
    }

    return { refresh: refresh, destroy: destroy };
  }

  return {
    PAUSE_LABEL: PAUSE_LABEL,
    RESUME_LABEL: RESUME_LABEL,
    hasPendingRun: hasPendingRun,
    commandLabel: commandLabel,
    createMenu: createMenu
  };
});

// ---- entry.cjs ----
(function (root) {
  "use strict";

  function installEarlyPrintGuard() {
    var modules = root.TecConcursosModules;
    if (!modules || !modules.storage || !modules.automationState || !modules.printBlocker || !root.document) return;
    var storage = modules.storage.createStorage(root);
    var stateModule = modules.automationState;
    var state = stateModule.normalizeState(storage.read(stateModule.STATE_KEY, stateModule.defaultState()));
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
})();
