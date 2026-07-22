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
