const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { chromium } = require("playwright");
const library = require("../../src/userscript/library.cjs");

const entry = {
  id: "html-e2e-1",
  code: "MAT-001",
  title: "Coesão textual - Base FCC",
  group: "Português",
  questions: [1, 2, 3].map(number => ({
    id: String(number),
    number,
    bank: number === 2 ? "FGV" : "FCC",
    year: number === 2 ? 2024 : 2025,
    vacancy: number === 2 ? "Técnico" : "Analista",
    organization: "Órgão E2E",
    role: "Analista",
    subject: "Língua Portuguesa",
    topic: "Coesão",
    statement: "Enunciado " + number,
    statementHtml: "<p>Enunciado " + number + "</p>",
    options: ["A", "B", "C"].map(letter => ({ letter, text: "Alternativa " + letter, html: "<strong>" + letter + ")</strong> Alternativa " + letter }))
  }))
};

async function startHtmlServer(html) {
  const server = http.createServer((request, response) => {
    if (new URL(request.url, "http://127.0.0.1").pathname !== "/caderno.html") {
      response.writeHead(404);
      response.end();
      return;
    }
    response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
    response.end(html);
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve({ server, url: `http://127.0.0.1:${server.address().port}/caderno.html` }));
  });
}

test("HTML interativo salva resposta, duplo clique, filtros e histórico após reabrir", { timeout: 60000 }, async () => {
  const fixture = await startHtmlServer(library.buildInteractiveHtml(entry));
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.goto(fixture.url, { waitUntil: "domcontentloaded" });
    await page.locator(".option").nth(0).click();
    await page.waitForTimeout(300);
    await page.locator(".option").nth(1).dblclick();
    await page.locator("#jump").fill("3");
    await page.locator("#go").click();
    assert.match(await page.locator("#status").textContent(), /Questão 3 de 3/);

    const saved = await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith("tecconcursos-html-v1:")));
    assert.deepEqual(saved, ["tecconcursos-html-v1:html-e2e-1"]);

    await page.close();
    const reopened = await context.newPage();
    await reopened.goto(fixture.url, { waitUntil: "domcontentloaded" });
    assert.match(await reopened.locator(".option").nth(0).getAttribute("class"), /selected/);
    assert.match(await reopened.locator(".option").nth(1).getAttribute("class"), /eliminated/);
    assert.match(await reopened.locator("#status").textContent(), /Questão 1 de 3/);
    await reopened.locator("#jump").fill("3");
    await reopened.locator("#go").click();
    assert.match(await reopened.locator("#status").textContent(), /Questão 3 de 3/);
    await reopened.locator(".option").nth(0).dblclick();
    await reopened.waitForTimeout(300);
    const questionThreeState = await reopened.evaluate(() => JSON.parse(localStorage.getItem("tecconcursos-html-v1:html-e2e-1")));
    assert.equal(questionThreeState.attempts[0].answers["3"], undefined);
    assert.equal(questionThreeState.attempts[0].eliminated["3"].A, true);

    await reopened.locator("#bank").selectOption({ label: "FGV" });
    assert.match(await reopened.locator("#summary").textContent(), /1 questão\(ões\) filtrada\(s\) de 3/);
    assert.match(await reopened.locator(".meta").textContent(), /FGV/);
    await reopened.locator("#bank").selectOption({ label: "FCC" });
    await reopened.locator("#vacancy").selectOption({ label: "Analista" });
    assert.match(await reopened.locator("#summary").textContent(), /2 questão\(ões\) filtrada\(s\) de 3/);

    await reopened.locator("#newAttempt").click();
    const newAttemptState = await reopened.evaluate(() => JSON.parse(localStorage.getItem("tecconcursos-html-v1:html-e2e-1")));
    assert.equal(newAttemptState.attempts.length, 2);
    assert.equal(newAttemptState.activeAttempt, 1);
    assert.deepEqual(newAttemptState.attempts[1].answers, {});
    assert.equal(newAttemptState.attempts[0].answers["1"], "A");
  } finally {
    await context.close();
    await browser.close();
    await new Promise(resolve => fixture.server.close(resolve));
  }
});

test("HTML interativo informa acerto e erro depois da resposta", { timeout: 60000 }, async () => {
  const feedbackEntry = Object.assign({}, entry, {
    id: "html-e2e-feedback",
    questions: [Object.assign({}, entry.questions[0], { answer: "B" })]
  });
  const fixture = await startHtmlServer(library.buildInteractiveHtml(feedbackEntry));
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(fixture.url, { waitUntil: "domcontentloaded" });
    await page.locator(".option").nth(0).click();
    await page.waitForTimeout(300);
    assert.match(await page.locator("#feedback").textContent(), /errou/i);
    assert.match(await page.locator(".option").nth(0).getAttribute("class"), /incorrect/);
    assert.match(await page.locator(".option").nth(1).getAttribute("class"), /correct/);

    await page.locator(".option").nth(1).click();
    await page.waitForTimeout(300);
    assert.match(await page.locator("#feedback").textContent(), /acertou/i);
    assert.match(await page.locator(".option").nth(1).getAttribute("class"), /selected/);
    assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), "rgb(11, 17, 32)");
  } finally {
    await browser.close();
    await new Promise(resolve => fixture.server.close(resolve));
  }
});

test("HTML interativo preserva imagens do enunciado e das alternativas", { timeout: 60000 }, async () => {
  const imageEntry = Object.assign({}, entry, {
    id: "html-e2e-images",
    questions: [Object.assign({}, entry.questions[0], {
      statementHtml: '<p>Texto com imagem</p><img alt="figura" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=">',
      options: [Object.assign({}, entry.questions[0].options[0], {
        html: '<strong>A)</strong> <img alt="alternativa" src="https://cdn.example.test/alternativa.png">'
      })]
    })]
  });
  const fixture = await startHtmlServer(library.buildInteractiveHtml(imageEntry));
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(fixture.url, { waitUntil: "domcontentloaded" });
    assert.equal(await page.locator(".statement img").count(), 1);
    assert.equal(await page.locator(".option img").count(), 1);
    assert.match(await page.locator(".statement img").getAttribute("src"), /^data:image\/png;base64,/);
    assert.equal(await page.locator(".statement img").evaluate(node => getComputedStyle(node).maxWidth), "100%");
  } finally {
    await browser.close();
    await new Promise(resolve => fixture.server.close(resolve));
  }
});
