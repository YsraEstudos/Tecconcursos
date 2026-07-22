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
        return {
          gabarito: answer.statusToAnswer(raw.status),
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
