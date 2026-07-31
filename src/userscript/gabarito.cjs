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
