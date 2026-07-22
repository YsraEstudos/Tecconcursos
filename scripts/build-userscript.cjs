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
  "// @version      2.3.0",
  "// @description  Coleta questões, lê numeroAlternativaCorreta pela API, exporta TXT/JSON e aguarda 4-8 segundos aleatórios entre cliques.",
  "// @author       Codex",
  "// @match        https://www.tecconcursos.com.br/questoes/cadernos/*",
  "// @match        https://tecconcursos.com.br/questoes/cadernos/*",
  "// @match        https://www.tecconcursos.com.br/questoes/filtrar*",
  "// @match        https://tecconcursos.com.br/questoes/filtrar*",
  "// @updateURL    https://raw.githubusercontent.com/YsraEstudos/Tecconcursos/main/tecconcursos-scraper.user.js",
  "// @downloadURL  https://raw.githubusercontent.com/YsraEstudos/Tecconcursos/main/tecconcursos-scraper.user.js",
  "// @run-at       document-idle",
  "// @grant        GM_getValue",
  "// @grant        GM_setValue",
  "// @grant        GM_deleteValue",
  "// @noframes",
  "// ==/UserScript=="
].join("\n");

const moduleOrder = [
  { dir: sharedDir, name: "answer.cjs" },
  { dir: sourceDir, name: "api.cjs" },
  ...[
    "selectors.cjs",
    "parse-question.cjs",
    "format.cjs",
    "storage.cjs",
    "timing.cjs",
    "navigation.cjs",
    "collector.cjs",
    "ui.cjs",
    "entry.cjs"
  ].map((name) => ({ dir: sourceDir, name }))
];

const modules = moduleOrder.map(({ dir, name }) => {
  const filePath = path.join(dir, name);
  return "// ---- " + name + " ----\n" + fs.readFileSync(filePath, "utf8").trim();
});

const bundle = metadata + "\n\n(function () {\n" + modules.join("\n\n") + "\n})();\n";

fs.mkdirSync(distDir, { recursive: true });
fs.writeFileSync(path.join(projectRoot, "tecconcursos-scraper.user.js"), bundle, "utf8");
fs.writeFileSync(path.join(distDir, "tecconcursos-scraper.user.js"), bundle, "utf8");
console.log("Built tecconcursos-scraper.user.js and dist/tecconcursos-scraper.user.js");
