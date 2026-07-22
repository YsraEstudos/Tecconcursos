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
