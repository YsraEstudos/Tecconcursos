const test = require("node:test");
const assert = require("node:assert/strict");
const collectorModule = require("../../src/userscript/collector.cjs");

test("coleta duas questões e aplica delay aleatório antes do clique", async () => {
  let currentId = "3702591";
  let clicks = 0;
  const statuses = [];
  const delays = [];
  const saved = [];
  const storage = {
    read: () => saved.slice(),
    write: (_key, value) => {
      saved.splice(0, saved.length, ...value);
    },
    remove: () => { saved.splice(0, saved.length); }
  };
  const parser = {
    parseQuestionFromDocument: () => ({
      id: currentId,
      header: "header",
      subject: "subject",
      topic: "topic",
      organization: "org",
      statement: "statement " + currentId,
      options: [],
      url: "https://example.test/questoes/" + currentId
    })
  };
  const navigation = {
    clickNext: () => {
      clicks += 1;
      currentId = "3702592";
      return true;
    },
    waitForQuestionChange: async () => true
  };
  const timing = {
    randomInt: (min, max) => {
      delays.push([min, max]);
      return 5600;
    },
    sleep: async (ms) => {
      delays.push(ms);
      return true;
    }
  };
  const format = {
    downloadText: () => {},
    downloadJson: () => {},
    createFilename: () => "out.txt",
    formatQuestionsAsText: () => ""
  };
  const collector = collectorModule.createCollector({
    document: {
      querySelectorAll: (selector) => selector === "button[aria-label='Próxima questão']"
        ? [{ disabled: false, hidden: false, offsetParent: {} }]
        : []
    },
    storage,
    parser,
    navigation,
    timing,
    format
  });

  const result = await collector.start({ limit: 2, onStatus: (message) => statuses.push(message) });

  assert.equal(result.addedThisRun, 2);
  assert.deepEqual(saved.map((item) => item.id), ["3702591", "3702592"]);
  assert.equal(clicks, 1);
  assert.deepEqual(delays, [[4000, 8000], 5600]);
  assert.ok(statuses.some((message) => message.includes("5.6s")));
});
