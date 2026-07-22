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
