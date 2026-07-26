# HTML Interativo e Imagens no Excel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o HTML exportado registrar a resposta, mostrar imediatamente se ela está correta e usar tema escuro, além de preservar imagens no HTML e incorporá-las no XLSX quando estiverem acessíveis.

**Architecture:** O parser da página de impressão continuará sendo a fonte dos fragmentos HTML, mas normalizará os `src` das imagens para URLs absolutas antes de salvá-los na biblioteca. O runtime do HTML interativo exibirá o feedback a partir de `question.answer` e manterá o histórico existente. O exportador XLSX será assíncrono: baixará imagens com as credenciais da página quando necessário, manterá URLs nas colunas de fallback e adicionará as partes OOXML de desenho/mídia apenas quando houver bytes incorporados.

**Tech Stack:** CommonJS compatível com o bundle Tampermonkey, Node.js 18+, Playwright E2E, OOXML XLSX montado manualmente e ZIP sem compressão já usado pelo projeto.

## Global Constraints

- Preservar o armazenamento existente `tecconcursos-html-v1:<id>`, tentativas, filtros, salto, duplo clique para eliminação e download do HTML com histórico.
- Não tratar `status` como gabarito; usar somente `question.answer` ou o campo de resposta já extraído do HTML de impressão.
- Não adicionar dependência externa; imagens remotas devem ser tentadas com `fetch(..., { credentials: "include" })` e falhas devem deixar a URL disponível como fallback.
- Não quebrar o exportador quando não houver imagens, quando `fetch` não existir ou quando o formato da imagem não for suportado pelo Excel.
- Manter mudanças restritas ao escopo HTML/XLSX, seus testes, documentação operacional e artefatos gerados pelo build.

---

### Task 1: Captura e normalização de imagens

**Files:**
- Modify: `src/userscript/library.cjs:21-109`
- Test: `tests/userscript/library.test.cjs`

**Interfaces:**
- Produces `serializeHtmlWithAbsoluteImages(node)` internamente para `statementHtml` e `option.html`.
- `parsePrintedQuestion(node, index)` continuará retornando `statementHtml` e `options[].html`, agora com `src` absolutos quando houver `baseURI`.

- [ ] **Step 1: Write the failing test**

Adicionar um nó DOM mínimo com `cloneNode`, `querySelectorAll`, `innerHTML` e `baseURI`, contendo uma imagem relativa no enunciado e outra em alternativa. Verificar que `parsePrintedQuestion` retorna `https://www.tecconcursos.com.br/questoes/img/enunciado.png` e `https://cdn.example.test/alternativa.jpg`, sem remover o texto HTML.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/userscript/library.test.cjs --test-name-pattern="normaliza imagens"`

Expected: FAIL porque `statementHtml` e `option.html` ainda preservam a URL relativa.

- [ ] **Step 3: Write minimal implementation**

Criar helpers locais para resolver URLs com `new URL(value, baseURI)`, clonar o nó quando a API DOM existir, atualizar `src`/`data-src` de cada `img` e sanitizar o HTML resultante. Preservar `data:` e URLs absolutas sem alteração; usar o HTML bruto como fallback para os stubs dos testes.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/userscript/library.test.cjs --test-name-pattern="normaliza imagens"`

Expected: PASS.

---

### Task 2: Feedback de resposta e tema escuro no HTML

**Files:**
- Modify: `src/userscript/library.cjs:314-401`
- Test: `tests/e2e/library-html.test.cjs`
- Test: `tests/userscript/library.test.cjs`

**Interfaces:**
- O runtime embutido continuará usando `attempt.answers[question.id]` e acrescentará somente classes/feedback derivados do gabarito.
- O HTML gerado deverá conter `#feedback`, classes `.correct` e `.incorrect`, e estilos escuros para `body`, cartão, controles e alternativas.

- [ ] **Step 1: Write the failing test**

No fixture E2E, atribuir `answer: "B"`, clicar em A e verificar `#feedback` com erro, a alternativa A com `.incorrect` e B com `.correct`; depois clicar em B e verificar a mensagem de acerto. Adicionar verificações de CSS/HTML para `background:#0b1120` e regras de `.option.correct`/`.option.incorrect`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/e2e/library-html.test.cjs --test-name-pattern="feedback"`

Expected: FAIL porque não existe `#feedback`, comparação com `question.answer` ou tema escuro.

- [ ] **Step 3: Write minimal implementation**

Adicionar normalização de resposta para aceitar `A` e textos como `Gabarito: A`; calcular a escolha atual, marcar a correta e a escolhida incorreta, renderizar mensagem para acerto/erro ou gabarito indisponível, e manter o `write()`/`render()` atual. Substituir a paleta clara por uma paleta escura acessível, incluindo inputs, selects, cartão, tags, alternativas, dicas, estado vazio e imagens responsivas.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/e2e/library-html.test.cjs tests/userscript/library.test.cjs`

Expected: PASS, preservando também seleção, duplo clique, filtros, nova tentativa e reabertura.

---

### Task 3: Embedding de imagens no XLSX com fallback de URL

**Files:**
- Modify: `src/userscript/library.cjs:193-293`
- Modify: `src/userscript/entry.cjs:149-157`
- Test: `tests/userscript/xlsx.test.cjs`

**Interfaces:**
- `buildXlsxBlob(entry)` passará a retornar `Promise<Blob>`.
- O XLSX manterá uma coluna `Imagem N` por posição máxima encontrada em cada questão, contendo a URL ou `[imagem incorporada]`.
- Quando houver bytes suportados, o pacote conterá `xl/media/imageN.<ext>`, `xl/drawings/drawing1.xml`, relações da planilha/desenho e `drawing` no `sheet1.xml`.

- [ ] **Step 1: Write the failing test**

Adicionar uma questão com `<img src="data:image/png;base64,...">` e outra URL remota simulada por `globalThis.fetch`. Aguardar `buildXlsxBlob`, verificar a coluna `Imagem 1`, o arquivo `xl/media/image1.png`, o desenho, os relacionamentos e a referência ao desenho na planilha. Manter a expectativa sem partes de imagem para o fixture atual sem imagens.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/userscript/xlsx.test.cjs --test-name-pattern="imagem"`

Expected: FAIL porque o builder atual é síncrono, não cria colunas de imagem nem partes OOXML de mídia.

- [ ] **Step 3: Write minimal implementation**

Implementar coleta deduplicada de `img[src]`, decodificação de `data:` URI, `fetch` autenticado para URLs HTTP(S), detecção de PNG/JPEG/GIF, limite seguro de tamanho e fallback silencioso para URL. Alterar o ZIP para aceitar `Uint8Array`, gerar XML de drawing/relationships/content types e ancorar imagens na linha da questão. Atualizar `entry.cjs` para aguardar a Promise e informar erro de download no painel sem gerar rejeição não tratada.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/userscript/xlsx.test.cjs tests/userscript/library.test.cjs`

Expected: PASS, incluindo leitura XML no Windows e compatibilidade dos arquivos sem imagens.

---

### Task 4: Documentação, bundle e verificação completa

**Files:**
- Modify: `README.md`
- Modify: `src/userscript/AI_CONTEXT.md`
- Modify: `tests/userscript/bundle.test.cjs`
- Modify: `tecconcursos-scraper.user.js`
- Modify: `dist/tecconcursos-scraper.user.js`

**Interfaces:**
- O bundle deve conter o novo runtime, as regras de feedback, tema escuro e montagem de imagens, sem alterar a ordem dos módulos.

- [ ] **Step 1: Write the failing test**

Adicionar assertions do bundle para `#feedback`, `image1`, `drawing1.xml`, `credentials: "include"` e a mensagem de gabarito indisponível.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/userscript/bundle.test.cjs --test-name-pattern="bundle"`

Expected: FAIL antes do build porque os artefatos gerados ainda não contêm o novo código.

- [ ] **Step 3: Write minimal implementation**

Atualizar README e AI Context com o contrato de feedback, tema escuro, imagens relativas normalizadas, incorporação XLSX e fallback de URL. Executar `npm run build:userscript` para regenerar os dois userscripts.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run check`

Expected: sintaxe, lint, testes unitários, cobertura, build e E2E sem falhas; o teste LibreOffice pode permanecer skipped se o programa não estiver instalado.

- [ ] **Step 5: Inspect the final diff**

Run: `git diff --check` e `git status --short`.

Expected: sem erros de whitespace e somente arquivos do escopo adicionados/modificados, preservando alterações pré-existentes não relacionadas.
