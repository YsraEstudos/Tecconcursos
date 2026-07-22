// ==UserScript==
// @name         TecConcursos - Extração & Avanço Automático
// @namespace    https://github.com/YsraEstudos/Tecconcursos
// @version      1.0.0
// @description  Extrai questões do Tec Concursos sequencialmente e avança automaticamente para a próxima questão. Suporta atualização direta via GitHub.
// @author       Antigravity
// @match        https://www.tecconcursos.com.br/*
// @updateURL    https://raw.githubusercontent.com/YsraEstudos/Tecconcursos/main/tecconcursos-scraper.user.js
// @downloadURL  https://raw.githubusercontent.com/YsraEstudos/Tecconcursos/main/tecconcursos-scraper.user.js
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_setClipboard
// @grant        GM_download
// @grant        GM_registerMenuCommand
// ==UserScript==

(function() {
    'use strict';

    let isRunning = false;
    let autoNextTimeout = null;

    // Carregar questões do armazenamento local do Tampermonkey
    function getSavedQuestions() {
        try {
            return JSON.parse(GM_getValue('tec_questions', '[]'));
        } catch(e) {
            return [];
        }
    }

    // Salvar uma questão capturada
    function saveQuestion(qData) {
        let list = getSavedQuestions();
        if (!list.some(q => q.id === qData.id)) {
            list.push(qData);
            GM_setValue('tec_questions', JSON.stringify(list));
            updateUI();
            return true;
        }
        return false;
    }

    // Extrair os dados da questão atual visível na tela
    function extractCurrentQuestion() {
        const bodyText = document.body.innerText;
        const matchId = bodyText.match(/#(\d{5,8})/);
        const questionId = matchId ? `#${matchId[1]}` : null;

        if (!questionId) return null;

        // Cabeçalho / Metadados
        const headerEl = document.querySelector('header, .q-question-header, [data-testid="question-header"]');
        const headerText = headerEl ? headerEl.innerText.trim() : '';

        // Enunciado
        const statementEl = document.querySelector('.q-question-enunciado, .q-enunciado, article, section article');
        const statementText = statementEl ? statementEl.innerText.trim() : '';

        // Alternativas
        const altEls = Array.from(document.querySelectorAll('.q-options li, .q-opcao, [role="radio"], [data-testid="option"]'));
        const options = altEls.map(el => el.innerText.trim()).filter(Boolean);

        return {
            id: questionId,
            header: headerText,
            statement: statementText,
            options: options,
            url: window.location.href,
            extractedAt: new Date().toISOString()
        };
    }

    // Localizar e clicar na seta "Próxima questão"
    function clickNextButton() {
        const selectors = [
            '[aria-label="Próxima questão"]',
            '[title="Próxima questão"]',
            'a[aria-label="Próxima questão"]',
            'button[aria-label="Próxima questão"]',
            '.q-btn-next',
            '.q-next-question'
        ];

        for (let sel of selectors) {
            try {
                let el = document.querySelector(sel);
                if (!el) {
                    const buttons = Array.from(document.querySelectorAll('button, a, div[role="button"]'));
                    el = buttons.find(b => {
                        const aria = b.getAttribute('aria-label') || '';
                        const title = b.getAttribute('title') || '';
                        const txt = b.innerText || '';
                        return aria.includes('Próxima') || title.includes('Próxima') || txt.includes('Próxima');
                    });
                }
                if (el) {
                    el.click();
                    return true;
                }
            } catch(e) {}
        }
        return false;
    }

    // Ciclo principal de automação
    function step() {
        if (!isRunning) return;

        const qData = extractCurrentQuestion();
        if (qData) {
            const saved = saveQuestion(qData);
            if (saved) {
                console.log(`[Tampermonkey] Questão ${qData.id} capturada.`);
            }
        }

        const clicked = clickNextButton();
        if (!clicked) {
            console.log('[Tampermonkey] Fim da lista de questões ou botão não encontrado.');
            stopAutomation();
            alert('Extração finalizada ou botão "Próxima questão" não encontrado!');
            return;
        }

        // Aguarda 1.8 segundos antes de processar a próxima questão
        autoNextTimeout = setTimeout(step, 1800);
    }

    function startAutomation() {
        isRunning = true;
        updateUI();
        step();
    }

    function stopAutomation() {
        isRunning = false;
        if (autoNextTimeout) clearTimeout(autoNextTimeout);
        updateUI();
    }

    // Exportar questões salvas como JSON
    function exportJSON() {
        const list = getSavedQuestions();
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(list, null, 2));
        const dlAnchorElem = document.createElement('a');
        dlAnchorElem.setAttribute("href", dataStr);
        dlAnchorElem.setAttribute("download", `questoes_tecconcursos_${Date.now()}.json`);
        document.body.appendChild(dlAnchorElem);
        dlAnchorElem.click();
        dlAnchorElem.remove();
    }

    // Limpar armazenamento local
    function clearStorage() {
        if (confirm('Deseja apagar todas as questões salvas no Tampermonkey?')) {
            GM_setValue('tec_questions', '[]');
            updateUI();
        }
    }

    // Painel visual de controle no canto da página
    function createUI() {
        if (document.getElementById('tec-scraper-ui')) return;

        const panel = document.createElement('div');
        panel.id = 'tec-scraper-ui';
        panel.style.position = 'fixed';
        panel.style.bottom = '20px';
        panel.style.right = '20px';
        panel.style.zIndex = '999999';
        panel.style.backgroundColor = '#1e1e2e';
        panel.style.color = '#cdd6f4';
        panel.style.padding = '14px 18px';
        panel.style.borderRadius = '12px';
        panel.style.boxShadow = '0 8px 24px rgba(0,0,0,0.4)';
        panel.style.fontFamily = 'Segoe UI, Roboto, sans-serif';
        panel.style.fontSize = '13px';
        panel.style.display = 'flex';
        panel.style.flexDirection = 'column';
        panel.style.gap = '8px';
        panel.style.border = '1px solid #45475a';

        panel.innerHTML = `
            <div style="font-weight: bold; font-size: 14px; color: #89b4fa; display: flex; justify-content: space-between; align-items: center; gap: 12px;">
                <span>🎯 Tec Scraper</span>
                <span id="tec-count" style="background: #313244; padding: 2px 8px; border-radius: 8px; font-size: 12px;">0 salvas</span>
            </div>
            <div style="display: flex; gap: 6px;">
                <button id="tec-btn-toggle" style="flex: 1; padding: 6px 12px; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; background: #a6e3a1; color: #11111b;">▶️ Iniciar</button>
                <button id="tec-btn-export" style="padding: 6px 10px; border: none; border-radius: 6px; cursor: pointer; background: #89b4fa; color: #11111b; font-weight: bold;">💾 Exportar</button>
                <button id="tec-btn-clear" style="padding: 6px 8px; border: none; border-radius: 6px; cursor: pointer; background: #f38ba8; color: #11111b;">🗑️</button>
            </div>
        `;

        document.body.appendChild(panel);

        document.getElementById('tec-btn-toggle').addEventListener('click', () => {
            if (isRunning) stopAutomation();
            else startAutomation();
        });

        document.getElementById('tec-btn-export').addEventListener('click', exportJSON);
        document.getElementById('tec-btn-clear').addEventListener('click', clearStorage);

        updateUI();
    }

    function updateUI() {
        const countSpan = document.getElementById('tec-count');
        const toggleBtn = document.getElementById('tec-btn-toggle');
        const list = getSavedQuestions();

        if (countSpan) countSpan.innerText = `${list.length} salvas`;
        if (toggleBtn) {
            if (isRunning) {
                toggleBtn.innerText = '⏸️ Pausar';
                toggleBtn.style.background = '#f9e2af';
            } else {
                toggleBtn.innerText = '▶️ Iniciar';
                toggleBtn.style.background = '#a6e3a1';
            }
        }
    }

    // Inicializar quando a página carregar
    window.addEventListener('load', () => {
        setTimeout(createUI, 1200);
    });

})();
