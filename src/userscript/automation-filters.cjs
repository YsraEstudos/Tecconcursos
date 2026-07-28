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
