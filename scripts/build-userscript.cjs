const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const sharedDir = path.join(projectRoot, "src", "shared");
const sourceDir = path.join(projectRoot, "src", "userscript");
const distDir = path.join(projectRoot, "dist");

const metadata = [
  "// ==UserScript==",
  "// @name         TecConcursos - Coletor de Questões Pro",
  "// @namespace    https://github.com/YsraEstudos/Tecconcursos",
  "// @version      2.7.0",
  "// @description  Coleta questões e cria/exporta cadernos para uma biblioteca local com Excel e HTML interativo.",
  "// @author       Codex",
  "// @match        https://www.tecconcursos.com.br/*",
  "// @match        https://tecconcursos.com.br/*",
  "// @match        https://www.tecconcursos.com.br/questoes/cadernos/*",
  "// @match        https://tecconcursos.com.br/questoes/cadernos/*",
  "// @match        https://www.tecconcursos.com.br/questoes/filtrar*",
  "// @match        https://tecconcursos.com.br/questoes/filtrar*",
  "// @match        https://www.tecconcursos.com.br/questoes/pastas*",
  "// @match        https://tecconcursos.com.br/questoes/pastas*",
  "// @updateURL    https://raw.githubusercontent.com/YsraEstudos/Tecconcursos/main/tecconcursos-scraper.user.js",
  "// @downloadURL  https://raw.githubusercontent.com/YsraEstudos/Tecconcursos/main/tecconcursos-scraper.user.js",
  "// @run-at       document-start",
  "// @grant        GM_getValue",
  "// @grant        GM_setValue",
  "// @grant        GM_deleteValue",
  "// @grant        GM_registerMenuCommand",
  "// @grant        GM_unregisterMenuCommand",
  "// @grant        GM_addElement",
  "// @grant        unsafeWindow",
  "// @noframes",
  "// ==/UserScript=="
].join("\n");

const moduleOrder = [
  { dir: sharedDir, name: "answer.cjs" },
  { dir: sourceDir, name: "api.cjs" },
  { dir: sourceDir, name: "gabarito.cjs" },
  ...[
    "selectors.cjs",
    "parse-question.cjs",
    "format.cjs",
    "storage.cjs",
    "plan.cjs",
    "automation-lock.cjs",
    "automation-activity.cjs",
    "automation-dom.cjs",
    "timing.cjs",
    "library.cjs",
    "automation-state.cjs",
    "automation-filters.cjs",
    "automation-print.cjs",
    "automation-output.cjs",
    "automation-caderno.cjs",
    "automation-diagnostics.cjs",
    "automation-orchestrator.cjs",
    "automation.cjs",
    "ai-context.cjs",
    "navigation.cjs",
    "collector.cjs",
    "ui.cjs",
    "library-ui.cjs",
    "automation-controls.cjs",
    "print-blocker.cjs",
    "tampermonkey-menu.cjs",
    "entry.cjs"
  ].map((name) => ({ dir: sourceDir, name }))
];

const modules = moduleOrder.map(({ dir, name }) => {
  const filePath = path.join(dir, name);
  let source = fs.readFileSync(filePath, "utf8");
  if (name === "ai-context.cjs") {
    const contextPath = path.join(sourceDir, "AI_CONTEXT.md");
    const context = fs.readFileSync(contextPath, "utf8");
    source = source.replace('"__TEC_AI_CONTEXT__"', JSON.stringify(context));
  }
  return "// ---- " + name + " ----\n" + source.trim();
});

const bundle = metadata + "\n\n(function () {\n" + modules.join("\n\n") + "\n})();\n";

fs.mkdirSync(distDir, { recursive: true });
fs.writeFileSync(path.join(projectRoot, "tecconcursos-scraper.user.js"), bundle, "utf8");
fs.writeFileSync(path.join(distDir, "tecconcursos-scraper.user.js"), bundle, "utf8");
console.log("Built tecconcursos-scraper.user.js and dist/tecconcursos-scraper.user.js");
