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
