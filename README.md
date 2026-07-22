# Sistema de Extração Sequencial de Questões (Tec Concursos)

Este projeto automatiza a navegação e a extração sequencial de questões no site do Tec Concursos utilizando **Playwright**.

## 📌 Funcionalidades

- **Sessão Persistente**: Salva o login na pasta `./user_data`, para que você não precise se autenticar toda vez.
- **Detecção Sequencial**: Captura o enunciado, ID da questão (ex: `#3702591`), alternativas (A, B, C, D, E) e metadados.
- **Clique Automático na Seta**: Avança para a próxima questão automaticamente utilizando o seletor `Próxima questão`.
- **Salvamento Incremental**: Grava cada questão em tempo real no arquivo `questoes.json`, prevenindo perda de dados se você parar a execução.

---

## 🚀 Como Usar

### 1. Instalar as Dependências

```bash
npm install
```

### 2. Executar o Extrair de Questões

```bash
npm start
```

Ou diretamente:

```bash
node scraper.js
```

---

## ⚙️ Configurações (`config.js`)

Você pode ajustar os seguintes parâmetros em `config.js`:

- `outputFile`: Nome do arquivo de saída (padrão: `./questoes.json`).
- `delayBetweenQuestionsMs`: Intervalo em milissegundos entre o clique na próxima questão (padrão: `1500` ms).
- `maxQuestions`: Quantidade máxima de questões a extrair por execução (`null` para extrair todas).

---

## 📄 Estrutura dos Arquivos Criados

- [package.json](file:///c:/Users/israe/OneDrive/Desktop/Projetos/Tecconcursos/package.json) - Dependências do projeto.
- [config.js](file:///c:/Users/israe/OneDrive/Desktop/Projetos/Tecconcursos/config.js) - Arquivo de opções e parâmetros.
- [scraper.js](file:///c:/Users/israe/OneDrive/Desktop/Projetos/Tecconcursos/scraper.js) - Script principal de automação com o Playwright.
- [questoes.json](file:///c:/Users/israe/OneDrive/Desktop/Projetos/Tecconcursos/questoes.json) - Arquivo final com as questões salvas.

## Userscript principal

O fluxo recomendado é o userscript do Tampermonkey, que funciona diretamente na página do caderno.

Ele atende as rotas `/questoes/cadernos/*` e `/questoes/filtrar*`, salva incrementalmente e oferece exportação TXT/JSON.

O intervalo entre cliques é variável, entre 4 e 8 segundos, e pode ser interrompido pelo botão Pausar.

Para gerar o arquivo instalável, execute `npm run build:userscript`.
