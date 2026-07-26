const fs = require("node:fs");
const path = require("node:path");
const childProcess = require("node:child_process");

const projectRoot = path.resolve(__dirname, "..");
const sourceDir = path.join(projectRoot, "src", "userscript");
const testDirs = [path.join(projectRoot, "tests", "userscript"), path.join(projectRoot, "tests", "e2e")];

function cjsFiles(directory) {
  return fs.readdirSync(directory)
    .filter(name => name.endsWith(".cjs"))
    .map(name => path.join(directory, name));
}

const sourceFiles = cjsFiles(sourceDir);
const testFiles = testDirs.flatMap(cjsFiles);
const errors = [];

for (const filePath of [...sourceFiles, ...testFiles]) {
  const syntax = childProcess.spawnSync(process.execPath, ["--check", filePath], { encoding: "utf8" });
  if (syntax.status !== 0) errors.push(`${filePath}: sintaxe inválida\n${syntax.stderr || syntax.stdout}`);
  const content = fs.readFileSync(filePath, "utf8");
  if (/\bdebugger\s*;/.test(content)) errors.push(`${filePath}: instrução debugger não permitida`);
  if (sourceFiles.includes(filePath) && /\bconsole\.(?:log|warn|error|debug)\s*\(/.test(content)) {
    errors.push(`${filePath}: console em código de produção do userscript`);
  }
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(`Lint do userscript concluído: ${sourceFiles.length} módulos e ${testFiles.length} testes verificados.`);
