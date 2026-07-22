# Tec Concursos — Coletor integrado

Projeto com dois pontos de entrada que compartilham a mesma conversão de gabarito:

- Userscript do Tampermonkey: coleta a questão atual, consulta o gabarito na API autenticada, salva incrementalmente e exporta TXT/JSON.
- CLI via API: coleta um caderno inteiro usando cookies de sessão.

## Userscript

Link de instalação/atualização:

https://raw.githubusercontent.com/YsraEstudos/Tecconcursos/main/tecconcursos-scraper.user.js

Na página de um caderno, o painel permite iniciar, pausar, exportar TXT/JSON e limpar os dados. O intervalo antes de cada clique é aleatório entre 4 e 8 segundos. O gabarito é obtido pela API da própria sessão do Tec Concursos e também é aplicado às questões antigas que estavam salvas sem resposta.

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

## Build e testes

~~~text
npm run build:userscript
npm test
~~~
