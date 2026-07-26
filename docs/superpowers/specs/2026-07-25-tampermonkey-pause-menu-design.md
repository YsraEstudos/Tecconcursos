# Controle de pausa no menu do Tampermonkey

## Objetivo

Permitir que a automação de cadernos seja parada e retomada pelo menu de comandos do userscript no popup do Tampermonkey, inclusive quando a página atual está sendo trocada e o painel da página não está acessível.

O menu interno de gerenciamento do Tampermonkey, que contém `Edit` e `Delete`, não será alterado porque não existe uma API de userscript para inserir itens nessa área. O ponto de integração será `GM_registerMenuCommand`.

## Comportamento aprovado

- Durante uma execução pendente, o comando aparece como `⏹ Parar automação`.
- Depois de uma pausa, o mesmo comando aparece como `▶ Retomar automação`.
- O comando usa as operações existentes de automação, preservando `runId`, estado persistido, histórico, lease e a regra de não controlar uma execução pertencente a outra aba.
- Ao navegar para outra página compatível, o comando é registrado novamente com o texto derivado do estado salvo.
- Se uma navegação ou um clique do site já tiver sido iniciado quando o usuário clicar em Parar, essa ação em andamento não será desfeita. O fluxo deve parar no próximo checkpoint seguro e não iniciar nova navegação depois que a pausa estiver persistida.
- Quando não houver criação ou exportação pendente, nenhum comando de pausa/retomada será registrado.
- O comando só estará disponível quando houver uma página compatível com o `@match` do userscript ativo.

## Arquitetura

Será criado um módulo pequeno e testável, `src/userscript/tampermonkey-menu.cjs`, responsável apenas por:

1. derivar o rótulo do comando a partir do estado resumido;
2. registrar ou atualizar um único comando via `GM_registerMenuCommand` e, quando disponível, remover o registro anterior com `GM_unregisterMenuCommand`;
3. encaminhar o clique para `pause` ou `resumePaused`;
4. atualizar o registro depois de cada ação.

`src/userscript/entry.cjs` criará esse controlador depois de criar a instância de automação e antes de iniciar a retomada automática. O controlador receberá callbacks para ler o estado atual e executar as operações existentes. O módulo não manipulará o DOM do Tampermonkey nem criará uma segunda fonte de verdade para pausa.

O bundle incluirá o novo módulo antes de `entry.cjs` e adicionará `@grant GM_registerMenuCommand` e `@grant GM_unregisterMenuCommand` aos metadados. Os arquivos gerados `tecconcursos-scraper.user.js` e `dist/tecconcursos-scraper.user.js` serão regenerados pelo script de build, sem editar o bundle manualmente.

## Fluxo de dados

```text
Tampermonkey popup
        |
        v
GM_registerMenuCommand
        |
        v
tampermonkey-menu.cjs ---- lê ----> automation.getState()
        |                                  |
        |                                  v
        +---- Parar ----------------> automation.pause()
        +---- Retomar --------------> automation.resumePaused()
        |
        v
atualiza o rótulo do comando
```

O estado operacional continua sendo armazenado pela abstração existente (`GM_getValue`/`GM_setValue`, com o fallback atual). A pausa deve liberar o lease por meio de `automation.pause()`. A retomada deve tentar adquirir o lease por meio de `automation.resumePaused()` e respeitar a mensagem de bloqueio quando outra aba for proprietária.

## Checkpoints de segurança

O menu não tentará cancelar uma navegação do navegador que já começou. Para reduzir a janela em que uma operação continua depois do clique, os fluxos de caderno, impressão, saída e orquestração devem consultar o estado antes de seus cliques ou atribuições de `location.href` de transição. Uma pausa detectada nesses pontos deve encerrar o passo sem marcar uma parte como concluída.

O comportamento existente de retomada automática será preservado: quando `state.running` estiver falso e houver `creation` ou `export`, `entry.cjs` registrará `Retomar automação`, mas não chamará a execução automaticamente.

## Testes e verificação

- Teste unitário do módulo de menu com um falso `GM_registerMenuCommand`, cobrindo rótulo parado/em execução, callback de pausa/retomada e atualização sem duplicar o comando.
- Teste de ciclo de vida garantindo que a pausa acionada pelo mesmo callback persiste `running: false`, fase `paused` e libera o lease; a retomada continua usando o estado salvo.
- Teste de bundle verificando o grant e a presença do módulo/comandos no userscript gerado.
- Verificação executável com `npm test`, `npm run build:userscript`, `npm run check` e `npm run test:e2e`, respeitando o limite de que o teste local não prova uma mudança futura na UI real do TecConcursos.

## Fora do escopo

- Inserir controles na lista interna `Edit`/`Delete` do Tampermonkey.
- Alterar a extensão Tampermonkey ou o navegador.
- Cancelar requests, cliques ou navegações que já estejam em execução.
- Criar uma pausa global independente do estado da automação de cadernos.
