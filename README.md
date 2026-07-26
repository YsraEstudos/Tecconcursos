# Tec Concursos — Coletor integrado

Projeto com dois pontos de entrada que compartilham a leitura do gabarito oficial:

- Userscript do Tampermonkey: coleta a questão atual, consulta o gabarito na API autenticada, salva incrementalmente e exporta TXT/JSON.
- CLI via API: coleta um caderno inteiro usando cookies de sessão.

## Userscript

Link de instalação/atualização:

https://raw.githubusercontent.com/YsraEstudos/Tecconcursos/main/tecconcursos-scraper.user.js

Na página de um caderno, o painel original permite iniciar, pausar, exportar TXT/JSON e limpar os dados. Enquanto uma automação de cadernos estiver pendente, o menu de comandos do próprio userscript no popup do Tampermonkey também mostra **Parar automação** ou **Retomar automação**, preservando o ponto salvo quando a página estiver navegando. Os cliques da coleta usam intervalo aleatório entre 6 e 10 segundos; a automação de cadernos também aguarda antes das ações de filtros, criação e impressão. Pressionar **ESC** para as automações ativas. O gabarito é lido do campo oficial `numeroAlternativaCorreta` retornado pela API da própria sessão do Tec Concursos. O campo `status` não é tratado como resposta. Questões antigas que tinham respostas inferidas incorretamente de `status` são limpas e podem ser reprocessadas.

## Biblioteca e exportação de cadernos

O botão **Biblioteca TC** abre a automação de cadernos. Selecione ou cole o conteúdo do arquivo consolidado de matérias (Markdown com linhas `MAT-xxx — título` e `TecConcursos: ID — caminho`) e informe a pasta de destino do TecConcursos. O script cria um caderno por MAT, aplica as bancas, anos, exclusões de anuladas/desatualizadas e exporta em partes de até 200 questões.

Cada caderno consolidado fica na biblioteca local do userscript, agrupado pelo bloco do plano. Dela é possível baixar:

- `.xlsx` com uma linha por questão e colunas para banca, ano, vaga, órgão, cargo, matéria, assunto e alternativas; imagens acessíveis são incorporadas ao arquivo e cada imagem também mantém sua origem na coluna `Imagem N`;
- HTML interativo escuro com filtros, salto por número, resposta, feedback de acerto/erro, eliminação de alternativa por duplo clique e histórico de tentativas. Imagens do enunciado e das alternativas têm URLs normalizadas para continuar carregando no arquivo baixado.

O histórico usa `localStorage` quando o navegador permitir para o HTML baixado. O botão **Baixar HTML com histórico** cria uma cópia do arquivo com o estado atual embutido, para preservar o progresso mesmo em navegadores que isolam `file://`.

Durante uma execução longa, apenas uma aba é proprietária da automação. As demais mostram o bloqueio; se a aba antiga for encerrada, use **Assumir execução** para retomar o estado salvo. O painel também mostra fase, parte, última atividade e permite baixar o log detalhado.

## CLI

Instale as dependências:

~~~text
npm install
~~~

Configure o caderno e os cookies em src/cli/config.js e execute:

~~~text
npm start
~~~

Para gerar cookies usando o navegador Playwright:

~~~text
npm run extract-cookies
~~~

## Estrutura

- src/shared/answer.cjs — conversão única de status da API para A/B/C/D/E.
- src/userscript — módulos do bundle do Tampermonkey.
- src/cli — scraper de terminal e configuração.
- scripts — build do userscript, testes e extração de cookies.
- dist — cópia gerada do userscript.
- tests/userscript — testes do parser, API, coletor, exportação, timing e bundle.
- tests/e2e — fixtures locais de criação, impressão em múltiplas partes, retomada e HTML interativo.

## Build e testes

~~~text
npm run build:userscript
npm test
npm run test:e2e
npm run check
~~~
