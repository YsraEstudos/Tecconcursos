const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const childProcess = require("node:child_process");

const projectRoot = path.resolve(__dirname, "../..");
const buildScript = path.join(projectRoot, "scripts", "build-userscript.cjs");
const bundlePath = path.join(projectRoot, "tecconcursos-scraper.user.js");

test("bundle tem metadata válida, rota de caderno e atualização", () => {
  childProcess.execFileSync(process.execPath, [buildScript], { cwd: projectRoot, stdio: "pipe" });
  const bundle = fs.readFileSync(bundlePath, "utf8");
  assert.match(bundle, /^\/\/ ==UserScript==/);
  assert.match(bundle, /\/\/ ==\/UserScript==/);
  assert.match(bundle, /@match\s+https:\/\/www\.tecconcursos\.com\.br\/questoes\/cadernos\/\*/);
  assert.match(bundle, /@updateURL\s+https:\/\/raw\.githubusercontent\.com\/YsraEstudos\/Tecconcursos\/main\/tecconcursos-scraper\.user\.js/);
  assert.doesNotMatch(bundle, /@require/);
  childProcess.execFileSync(process.execPath, ["--check", bundlePath], { cwd: projectRoot, stdio: "pipe" });
});
