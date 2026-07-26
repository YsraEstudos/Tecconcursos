const fs = require("node:fs");
const path = require("node:path");
const childProcess = require("node:child_process");

const projectRoot = path.resolve(__dirname, "..");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

function run(command, args) {
  const result = childProcess.spawnSync(command, args, {
    cwd: projectRoot,
    stdio: "inherit",
    shell: process.platform === "win32" && command.toLowerCase().endsWith(".cmd")
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status == null ? 1 : result.status);
}

function javascriptFiles(directory) {
  return fs.readdirSync(directory)
    .filter(name => name.endsWith(".cjs"))
    .map(name => path.join(directory, name));
}

const syntaxTargets = [
  ...javascriptFiles(path.join(projectRoot, "src", "userscript")),
  ...javascriptFiles(path.join(projectRoot, "tests", "userscript")),
  ...javascriptFiles(path.join(projectRoot, "tests", "e2e")),
  path.join(projectRoot, "scripts", "build-userscript.cjs"),
  path.join(projectRoot, "scripts", "run-tests.cjs"),
  path.join(projectRoot, "scripts", "check-quality.cjs")
];

console.log("Verificando sintaxe de " + syntaxTargets.length + " arquivos JavaScript...");
syntaxTargets.forEach(filePath => run(process.execPath, ["--check", filePath]));
run(npmCommand, ["run", "lint"]);
run(npmCommand, ["run", "build:userscript"]);
run(npmCommand, ["test"]);
run(npmCommand, ["run", "test:coverage"]);
run(npmCommand, ["run", "test:e2e"]);
console.log("Quality gate concluído.");
