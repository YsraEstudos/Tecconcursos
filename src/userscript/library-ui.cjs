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
    launcherPause.dataset.tecScraperVersion = "2.7.2";
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
    panel.dataset.tecScraperVersion = "2.7.2";
    launcher.dataset.tecScraperVersion = "2.7.2";
    panel.innerHTML = "<div class=\"head\"><strong>Biblioteca de Cadernos <small>v2.7.2</small></strong><button type=\"button\" data-action=\"close\">Fechar</button></div><div class=\"tabs\"><button type=\"button\" class=\"active\" data-tab=\"automation\">Automação</button><button type=\"button\" data-tab=\"library\">Pastas e arquivos</button><button type=\"button\" data-tab=\"ai-context\">AI Context</button></div><div class=\"body\"></div>";
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
      body.innerHTML = "<div class=\"hint\">Cole ou selecione o seu <code>Tecconcursos_Materias_Consolidado.md</code> (ou JSON). O plano fica salvo no script e cada MAT vira um caderno no TecConcursos.</div><label for=\"tec-plan-file\">Arquivo do plano</label><input id=\"tec-plan-file\" type=\"file\" accept=\".md,.txt,.json,text/plain,text/markdown,application/json\"><label for=\"tec-plan-input\">Plano de matérias</label><textarea id=\"tec-plan-input\" placeholder=\"MAT-001 — Coesão textual&#10;TecConcursos: 12507 — Língua Portuguesa ...\"></textarea><div class=\"actions\"><button type=\"button\" data-action=\"import\">Salvar plano</button></div><div class=\"hint\" id=\"tec-plan-summary\">Plano atual: " + String(plan.matters && plan.matters.length || 0) + " matéria(s), " + String(plan.banks && plan.banks.length || 0) + " banca(s) e " + String(plan.years && plan.years.length || 0) + " ano(s).</div><label for=\"tec-folder-id\">ID da pasta de destino no TecConcursos</label><input id=\"tec-folder-id\" value=\"" + String(typeof config.defaultFolderId === "function" ? config.defaultFolderId() : "") + "\" inputmode=\"numeric\"><div class=\"actions\"><button type=\"button\" data-action=\"create\">Criar e exportar plano</button><button type=\"button\" data-action=\"current\" class=\"secondary\">Exportar caderno atual</button><button type=\"button\" data-action=\"pause\" class=\"danger\">Pausar</button><button type=\"button\" data-action=\"resume\" class=\"secondary\">Retomar execução</button><button type=\"button\" data-action=\"takeover\" class=\"secondary\">Assumir execução</button><button type=\"button\" data-action=\"diagnostics\" class=\"secondary\">Baixar log detalhado</button></div><div class=\"hint\" id=\"tec-progress\"></div><div class=\"status\"></div>";
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
