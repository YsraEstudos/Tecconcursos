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
