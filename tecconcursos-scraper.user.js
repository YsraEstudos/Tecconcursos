// ==UserScript==
// @name         TecConcursos - Coletor de Questões Pro
// @namespace    https://github.com/YsraEstudos/Tecconcursos
// @version      1.2.0
// @description  Extrai questões sequencialmente no Tec Concursos usando bibliotecas modernas (SweetAlert2 e Toastify).
// @author       Antigravity
// @match        https://www.tecconcursos.com.br/*
// @match        https://tecconcursos.com.br/*
// @require      https://cdn.jsdelivr.net/npm/sweetalert2@11
// @require      https://cdn.jsdelivr.net/npm/toastify-js
// @resource     TOASTIFY_CSS https://cdn.jsdelivr.net/npm/toastify-js/src/toastify.min.css
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @grant        GM_getResourceText
// ==UserScript==

(function () {
  'use strict';

  // Injetar CSS do Toastify
  const toastCss = `
    .toastify {
      padding: 12px 20px;
      color: #ffffff;
      display: inline-block;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      border-radius: 8px;
      font-family: system-ui, sans-serif;
      font-size: 13px;
      font-weight: bold;
    }
  `;
  GM_addStyle(toastCss);

  let isRunning = false;
  let timerId = null;
  let lastExtractedId = null;

  function notify(msg, bg = '#10B981') {
    if (typeof Toastify === 'function') {
      Toastify({
        text: msg,
        duration: 2000,
        gravity: "top",
        position: "right",
        style: { background: bg }
      }).showToast();
    }
  }

  function getQuestions() {
    try {
      return JSON.parse(GM_getValue('tec_questions_data', '[]'));
    } catch (e) {
      return [];
    }
  }

  function saveQuestions(list) {
    GM_setValue('tec_questions_data', JSON.stringify(list));
    updateWidgetUI();
  }

  function parseQuestion() {
    const pageText = document.body.innerText;
    const matchId = pageText.match(/#(\d{5,8})/);
    const id = matchId ? `#${matchId[1]}` : null;

    if (!id) return null;

    const statementEl = document.querySelector('.q-question-enunciado, .q-enunciado, article, [data-testid="question-text"]');
    const statement = statementEl ? statementEl.innerText.trim() : '';

    const optionEls = Array.from(document.querySelectorAll('.q-options li, .q-opcao, [role="radio"], [data-testid="option"]'));
    const options = optionEls.map(el => el.innerText.trim()).filter(Boolean);

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

  function findNextButton() {
    let btn = document.querySelector('[aria-label="Próxima questão"], [title="Próxima questão"], [aria-label*="Próxima"]');
    if (btn) return btn;

    const candidates = Array.from(document.querySelectorAll('button, a, div[role="button"], span[role="button"]'));
    return candidates.find(el => {
      const label = (el.getAttribute('aria-label') || '').toLowerCase();
      const title = (el.getAttribute('title') || '').toLowerCase();
      const text = (el.innerText || '').toLowerCase().trim();
      return label.includes('próxima') || title.includes('próxima') || text === 'próxima' || text.includes('próxima questão');
    });
  }

  function processStep() {
    if (!isRunning) return;

    const q = parseQuestion();

    if (q && q.id !== lastExtractedId) {
      const list = getQuestions();
      if (!list.some(item => item.id === q.id)) {
        list.push(q);
        saveQuestions(list);
        notify(`✅ Questão ${q.id} capturada!`, '#10B981');
      }
      lastExtractedId = q.id;
    }

    const nextBtn = findNextButton();

    if (nextBtn) {
      nextBtn.click();
      timerId = setTimeout(processStep, 1800);
    } else {
      stop();
      if (typeof Swal === 'function') {
        Swal.fire({
          icon: 'info',
          title: 'Extração Concluída!',
          text: 'Fim do caderno ou botão "Próxima questão" não encontrado.',
          confirmButtonColor: '#3B82F6'
        });
      }
    }
  }

  function start() {
    if (isRunning) return;
    isRunning = true;
    updateWidgetUI();
    notify('🚀 Extração iniciada!', '#3B82F6');
    processStep();
  }

  function stop() {
    isRunning = false;
    if (timerId) clearTimeout(timerId);
    updateWidgetUI();
    notify('⏸️ Extração pausada.', '#EF4444');
  }

  function exportJSON() {
    const list = getQuestions();
    if (list.length === 0) {
      Swal.fire('Aviso', 'Nenhuma questão salva para exportar.', 'warning');
      return;
    }
    const data = JSON.stringify(list, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `questoes_tecconcursos_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    notify('💾 Arquivo JSON baixado!', '#3B82F6');
  }

  function clearAll() {
    Swal.fire({
      title: 'Limpar banco de questões?',
      text: 'Essa ação apagará todas as questões salvas no Tampermonkey!',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#EF4444',
      cancelButtonColor: '#6B7280',
      confirmButtonText: 'Sim, apagar tudo',
      cancelButtonText: 'Cancelar'
    }).then((result) => {
      if (result.isConfirmed) {
        saveQuestions([]);
        lastExtractedId = null;
        Swal.fire('Limpo!', 'O banco de questões foi resetado.', 'success');
      }
    });
  }

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
      min-width: 230px;
      cursor: move;
    `;

    div.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; pointer-events: none;">
        <strong style="color: #60A5FA; font-size: 14px;">🎯 Tec Scraper Pro</strong>
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

    // Torna o painel arrastável (Draggable)
    let isDragging = false, offsetX = 0, offsetY = 0;
    div.addEventListener('mousedown', (e) => {
      if (e.target.tagName === 'BUTTON') return;
      isDragging = true;
      offsetX = e.clientX - div.offsetLeft;
      offsetY = e.clientY - div.offsetTop;
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      div.style.left = `${e.clientX - offsetX}px`;
      div.style.top = `${e.clientY - offsetY}px`;
      div.style.bottom = 'auto';
      div.style.right = 'auto';
    });

    document.addEventListener('mouseup', () => { isDragging = false; });

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

  if (document.readyState === 'complete') {
    renderWidget();
  } else {
    window.addEventListener('load', renderWidget);
  }
})();
