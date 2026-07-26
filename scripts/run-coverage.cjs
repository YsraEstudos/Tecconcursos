const fs = require("node:fs");
const path = require("node:path");
const childProcess = require("node:child_process");

const projectRoot = path.resolve(__dirname, "..");
const testDir = path.join(projectRoot, "tests", "userscript");
const files = fs.readdirSync(testDir)
  .filter(name => name.endsWith(".test.cjs"))
  .sort()
  .map(name => path.join(testDir, name));

const args = [
  "--experimental-test-coverage",
  "--test-coverage-include=src/userscript/*.cjs",
  "--test-coverage-lines=70",
  "--test-coverage-branches=50",
  "--test-coverage-functions=75",
  "--test",
  ...files
];
const result = childProcess.spawnSync(process.execPath, args, { cwd: projectRoot, stdio: "inherit" });
process.exit(result.status == null ? 1 : result.status);
