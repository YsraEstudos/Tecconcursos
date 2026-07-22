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

  return {
    letters: LETTERS.slice(),
    statusToAnswer: statusToAnswer,
    answerToStatus: answerToStatus
  };
});
