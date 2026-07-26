const test = require("node:test");
const assert = require("node:assert/strict");

const aiContext = require("../../src/userscript/ai-context.cjs");

test("AI Context carrega as regras universais e o contexto operacional do TecConcursos", () => {
  const content = aiContext.getText();

  assert.match(content, /# Universal Agent Guidelines \(The AI Bible\)/);
  assert.match(content, /Verification over assumption/);
  assert.match(content, /Never commit, print, log, or embed real secrets/);
  assert.match(content, /# TecConcursos — Contexto operacional observado/);
  assert.match(content, /#questaoInicialInput/);
  assert.match(content, /opening-filter/);
});
