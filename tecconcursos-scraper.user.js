// ==UserScript==
// @name         TecConcursos - Coletor de Questões Automático
// @namespace    https://github.com/YsraEstudos/Tecconcursos
// @version      1.1.0
// @description  Extrai questões sequencialmente no Tec Concursos clicando na seta de próxima questão.
// @author       Antigravity
// @match        https://www.tecconcursos.com.br/*
// @match        https://tecconcursos.com.br/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_download
// @grant        GM_setClipboard
// ==UserScript==

(function () {
  'use strict';

  let isRunning = false;
  let timerId = null;
  let lastExtractedId = null;

  // Carregar dados salvos
  function getQuestions() {
    try {
      return JSON.parse(GM_getValue('tec_questions_data', '[]'));
    } catch (e) {
      return [];
    }
  }

  // Salvar no armazenamento do Tampermonkey
  function saveQuestions(list) {
    GM_setValue('tec_questions_data', JSON.stringify(list));
    updateWidgetUI();
  }

  // Capturar dados da questão visível na tela
  function parseQuestion() {
    const pageText = document.body.innerText;
    
    // Tenta encontrar o ID da questão (ex: #3702591)
    const matchId = pageText.match(/#(\d{5,8})/);
    const id = matchId ? `#${matchId[1]}` : null;

    if (!id) return null;

    // Enunciado
    const statementEl = document.querySelector('.q-question-enunciado, .q-enunciado, article, [data-testid="question-text"]');
    const statement = statementEl ? statementEl.innerText.trim() : '';

    // Alternativas (A, B, C, D, E)
    const optionEls = Array.from(document.querySelectorAll('.q-options li, .q-opcao, [role="radio"], [data-testid="option"]'));
    const options = optionEls.map(el => el.innerText.trim()).filter(Boolean);

    // Cabeçalho / Matéria / Banca / Ano
    const headerEl = document.querySelector('header, .q-question-header');
    const header = headerEl ? headerEl.innerText.trim() : '';

    return {
      id: id,
      header: header,
      statement: statement,
      options: options,
      url: window.location.href,
      timestamp: new Date().toLocaleString('pt-BR')
    };
  }

  // Localizar o botão de "Próxima questão"
  function findNextButton() {
    // 1. Tentar por aria-label ou title
    let btn = document.querySelector('[aria-label="Próxima questão"], [title="Próxima questão"], [aria-label*="Próxima"]');
    if (btn) return btn;

    // 2. Busca genérica por texto ou atributos em elementos clicáveis
    const candidates = Array.from(document.querySelectorAll('button, a, div[role="button"], span[role="button"]'));
    return candidates.find(el => {
      const label = (el.getAttribute('aria-label') || '').toLowerCase();
      const title = (el.getAttribute('title') || '').toLowerCase();
      const text = (el.innerText || '').toLowerCase().trim();
      return label.includes('próxima') || title.includes('próxima') || text === 'próxima' || text.includes('próxima questão');
    });
  }

  // Loop de execução
  function processStep() {
    if (!isRunning) return;

    const q = parseQuestion();

    if (q && q.id !== lastExtractedId) {
      const list = getQuestions();
      if (!list.some(item => item.id === q.id)) {
        list.push(q);
        saveQuestions(list);
        console.log(`[TecScraper] Questão ${q.id} capturada.`);
      }
      lastExtractedId = q.id;
    }

    const nextBtn = findNextButton();

    if (nextBtn) {
      nextBtn.click();
      // Aguarda 1.8s para a nova questão carregar
      timerId = setTimeout(processStep, 1800);
    } else {
      stop();
      alert('⚠️ Fim da lista ou botão "Próxima questão" não encontrado.');
    }
  }

  function start() {
    if (isRunning) return;
    isRunning = true;
    updateWidgetUI();
    processStep();
  }

  function stop() {
    isRunning = false;
    if (timerId) clearTimeout(timerId);
    updateWidgetUI();
  }

  function exportJSON() {
    const data = JSON.stringify(getQuestions(), null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `questoes_tecconcursos_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function clearAll() {
    if (confirm('Deseja apagar todas as questões salvas no Tampermonkey?')) {
      saveQuestions([]);
      lastExtractedId = null;
    }
  }

  // Painel Flutuante na tela do TecConcursos
  function renderWidget() {
    if (document.getElementById('tec-floating-widget')) return;

    const div = document.createElement('div');
    div.id = 'tec-floating-widget';
    div.style.cssText = `
      position: fixed;
      bottom: 25px;
      right: 25px;
      z-index: 9999999;
      background: #111827;
      color: #F3F4F6;
      border: 2px solid #374151;
      padding: 16px;
      border-radius: 14px;
      box-shadow: 0 10px 25px rgba(0,0,0,0.5);
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 13px;
      min-width: 220px;
    `;

    div.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
        <strong style="color: #60A5FA; font-size: 14px;">🎯 Tec Scraper</strong>
        <span id="tec-badge" style="background: #1F2937; padding: 3px 8px; border-radius: 12px; font-weight: bold; color: #10B981;">0 salvas</span>
      </div>
      <div style="display: flex; gap: 8px; margin-bottom: 8px;">
        <button id="tec-btn-start" style="flex: 1; padding: 8px; border: none; border-radius: 8px; background: #10B981; color: #fff; font-weight: bold; cursor: pointer;">▶️ Iniciar</button>
        <button id="tec-btn-stop" style="flex: 1; padding: 8px; border: none; border-radius: 8px; background: #EF4444; color: #fff; font-weight: bold; cursor: pointer;">⏸️ Pausar</button>
      </div>
      <div style="display: flex; gap: 8px;">
        <button id="tec-btn-export" style="flex: 1; padding: 6px; border: none; border-radius: 6px; background: #3B82F6; color: #fff; cursor: pointer; font-size: 12px;">💾 Baixar JSON</button>
        <button id="tec-btn-clear" style="padding: 6px 10px; border: none; border-radius: 6px; background: #6B7280; color: #fff; cursor: pointer; font-size: 12px;">🗑️</button>
      </div>
    `;

    document.body.appendChild(div);

    document.getElementById('tec-btn-start').onclick = start;
    document.getElementById('tec-btn-stop').onclick = stop;
    document.getElementById('tec-btn-export').onclick = exportJSON;
    document.getElementById('tec-btn-clear').onclick = clearAll;

    updateWidgetUI();
  }

  function updateWidgetUI() {
    const badge = document.getElementById('tec-badge');
    const btnStart = document.getElementById('tec-btn-start');
    const count = getQuestions().length;

    if (badge) badge.innerText = `${count} salvas`;
    if (btnStart) {
      if (isRunning) {
        btnStart.style.opacity = '0.5';
        btnStart.innerText = '⏳ Rodando...';
      } else {
        btnStart.style.opacity = '1';
        btnStart.innerText = '▶️ Iniciar';
      }
    }
  }

  // Inicializar widget assim que a página carregar
  if (document.readyState === 'complete') {
    renderWidget();
  } else {
    window.addEventListener('load', renderWidget);
  }
})();
