# Universal Agent Guidelines (The AI Bible)

This document defines the core behavioral, security, design, and coding constraints. These rules are universally applicable to ensure high-quality, maintainable, and correct code output.

## Rule Precedence

Apply instructions in this order:
1. The user’s explicit task requirements.
2. Repository-level rule files and project documentation.
3. More specific rule files or documentation in the affected directory.
4. Explicit constraints marked `CAVEAT`, `IMPORTANT`, `DO NOT CHANGE`, or equivalent, when they are relevant and not contradicted by a higher-priority rule.
5. Existing local code conventions.

Treat nearby code comments as context, not absolute authority, unless they clearly define a current technical or business constraint.

When a rule applies only to a specific language, subsystem, framework, or workflow, place it in a path- or context-scoped rule file rather than the universal core.

## Agent Behavior & Workflow

* **Verification over assumption:** Treat the first implementation as a draft. Before presenting the result, run the repository's applicable verification checks. If no relevant checks exist or they cannot be run, say so explicitly.
* **Surgical edits:** Make only the modifications necessary for the requested change. Do not rewrite, reformat, or restate unrelated files, functions, or code.
* **Fail gracefully:** If a command or test fails, inspect its output and address the root cause. Do not repeatedly guess at fixes. If blocked by missing information, permissions, or an external dependency, state the blocker and the assumption made.
* **Enforcement over instruction:** When a behavior must happen deterministically, prefer hooks, CI, generators, linters, type-checkers, tests, or scanners over prompt-only instructions. Rely on the repository's active tooling for styling and type-checking rather than debating stylistic prompts.

## Security and Configuration

* Never commit, print, log, or embed real secrets, credentials, tokens, or sensitive internal URLs.
* Read secrets and environment-dependent values through the repository’s approved configuration mechanism.
* When adding required configuration, update the relevant example/config schema and documentation.
* Use existing secret-scanning, validation, and CI checks; instructions are not a substitute for enforcement.

## External Integrations & Canonical References

* Before changing an external API, SDK, CLI, or domain integration, consult the repository’s canonical integration documentation and, when necessary, the official documentation for the version in use.
* Do not invent endpoints, methods, parameters, versions, or capabilities.
* Prefer the existing client, generated types, schemas, and integration tests. If documentation is missing or ambiguous, state the assumption rather than guessing.

## Shared-State Changes

* For changes that write shared or persistent state, follow the repository’s existing transaction, locking, idempotency, validation, and retry conventions.
* Add or update tests for relevant failure, rollback, and concurrency cases when applicable.

## Code Style

* Follow the repository’s existing formatter, linter, naming, directory, and framework conventions. Do not introduce style-only rewrites in a functional change.
* Prefer small, cohesive functions and modules. Treat 4–20 lines per function and 500 lines per handwritten production module as review targets, not hard limits.
* Split code when responsibilities, dependencies, or reasons to change are independent. Do not split cohesive workflows merely to satisfy a line-count rule.
* Prefer guard clauses and early returns when they reduce nesting. Avoid more than two logical control-flow levels in new business logic unless deeper nesting makes resource lifetime, transactions, or error handling clearer.
* Keep module paths predictable. Follow the repository’s structure first; use framework conventions when the repository has no established alternative.

## Data Transformations and Performance

* For repeated membership checks, grouping, or joins over in-memory collections, prefer an appropriate Set, Map, dictionary, index, or database query over repeated linear scans.
* Avoid avoidable repeated scans inside loops when an index can preserve correctness and substantially improve complexity.
* Nested loops are acceptable for inherently pairwise, matrix, cross-product, bounded-small-data, or clearer algorithms. Do not optimize solely to remove nesting.
* Preserve required ordering, memory limits, and semantics. Profile or benchmark performance-sensitive paths before introducing non-obvious optimization.

## Naming

* Use names that describe the domain role, action, or invariant and are distinctive within their module and search context.
* Avoid vague catch-all modules or identifiers such as `utils`, `helpers`, `data`, or generic `manager` unless they are established framework conventions or include a precise domain qualifier.
* Name boolean predicates clearly using the convention appropriate to the language and meaning, such as `is`, `has`, `can`, `should`, `was`, or `needs`.

## Types

* Make types explicit at public APIs and system boundaries: HTTP, CLI, database, queue, filesystem, external APIs, serialization, and complex domain operations.
* Allow local type inference when the inferred type is clear and preserves type safety.
* In TypeScript, do not introduce implicit `any`. Avoid explicit `any`; use `unknown` with runtime validation when input is uncertain.
* In Python, type public functions and structured data. Prefer domain models, `TypedDict`, `dataclass`, or typed mappings over untyped dictionaries when shape matters.
* Introduce domain-specific types for values whose accidental interchange would cause meaningful bugs, such as money, units, identifiers, or validated state.

## Duplication and Abstraction

* Do not duplicate business rules, validation rules, security policy, or protocol behavior that must remain consistent across call sites.
* Extract a shared abstraction when three similar call sites reveal a stable shared contract, or earlier when one policy must change atomically everywhere.
* Do not abstract code merely because it looks syntactically similar. Preserve separate implementations when their future changes are likely to diverge.

## Errors

* For validation and internal diagnostic errors, include the operation or field, the expected contract, and a safe summary of the received value.
* Redact, hash, omit, or truncate secrets, credentials, session identifiers, personal data, and large payloads.
* Keep user-facing errors safe and actionable; keep implementation detail in protected logs or structured diagnostics.

## Comments and Documentation

* **Preserve intent:** Preserve useful comments and docstrings during refactoring. Update or relocate them when surrounding code changes; remove them only when obsolete, inaccurate, redundant with clear code, or replaced by a more durable source of truth.
* **Explain why, not what:** Write comments to document the "why" and explain non-obvious logic, invariants, or external limitations. Never write comments that merely restate self-documenting code (e.g., `# Increment counter`).
* **Workarounds and Provenance:** When introducing code to fix a production incident, upstream bug, or version conflict, include a comment stating:
  * The reason for the workaround.
  * A stable issue, ticket, or commit reference.
  * The affected dependency/version and the removal condition (e.g., target upgrade version).
  * *A comment explains the exception; a regression test prevents its accidental removal.*
* **Do not leak data:** Never include real credentials, private URLs, customer data, or sensitive incident details in comments.

## Public APIs and Interfaces

* **Document boundaries:** Document stable consumer-facing contracts according to the language and repository convention. Describe behavior, constraints, side effects, and compatibility expectations when they are not evident from types or usage.
* **Document the contract:** State the intent, key parameters, expected return values, exceptions raised, and side effects. Do not add boilerplate docstrings that only repeat obvious signatures.
* **Conditional examples:** Include code usage examples only when the invocation, state requirements, or return semantics are complex or non-obvious. Prefer verified automated tests over documentation examples.

## Verification and Test Automation

* **Verification command:** Provide one documented, non-interactive command (e.g., `npm run verify` or `make verify`) that executes all fast deterministic checks (formatting, linting, type-checking, and unit tests) before presenting a change.
* **Readiness guarantee:** Do not claim a change is verified if the required checks could not run. The CI must execute the full required test matrix.

## Test Coverage and Regressions

* **Tested behavior:** Add or update tests for every behavior change that can fail (business rules, validation, serialization, errors, security). Test observable behavior through stable public interfaces; do not test trivial private helpers just for coverage.
* **Regression testing:** Every bug fix must include a regression test that fails before the fix is applied. If a deterministic test is not feasible, state why and add the nearest reliable automated coverage.

## External I/O and Test Doubles

* **Isolation boundary:** Unit tests must not call production services or depend on uncontrolled network access, shared databases, system time, randomness, or machine-specific environments.
* **Pragmatic doubles:** Prefer a reusable named fake for complex dependencies. Use focused stubs, mocks, spies, or patches only for one-off scenarios (e.g., timeouts, retries, or verifying side effects).
* **No scattered patching:** Do not scatter patches of third-party libraries. Wrap external services in thin project-owned adapters and test the adapter with focused integration tests.

## Test Qualities and Determinism

* **F.I.R.S.T. unit tests:** Keep unit tests Fast, Independent (no shared mutable state), Repeatable (order-independent), Self-validating, and Timely (written alongside code).
* **Deterministic environment:** Freeze or inject time, randomness, locale, timezone, and API responses to eliminate flakiness.
* **Cleanup and isolation:** New tests must not introduce shared mutable state, order dependence, or environment leakage, and must respect the repository's supported execution model.
* **Readable naming:** Name tests as readable behavior statements including the condition and expected outcome (e.g., `test_order_total_includes_tax_when_region_is_eu`), preferring one behavior per test.

## Dependencies and Composition

* **Explicit injection:** Prefer constructor injection for long-lived dependencies and function parameters for transient operation values. Avoid hidden dependencies via mutable global state or static service locators.
* **Composition root:** In application code with meaningful infrastructure boundaries, keep vendor-specific construction and wiring at the composition root or framework bootstrap layer.
* **Framework lifecycle:** Use singleton lifecycles only when the dependency is thread-safe and intentionally shared. Allow immutable constants and pure functions.

## Third-Party Libraries & Adaptability

* **Project-owned boundaries:** Wrap external integrations (databases, payment providers, third-party APIs) in project-owned adapters. Domain logic must depend on these local contracts, not vendor SDK types or vendor-specific exceptions.
* **Capability-focused design:** Shape adapter contracts around the specific capability the application needs, not the vendor's entire API. Do not create one-to-one mirror interfaces.
* **Pragmatic direct usage:** Allow direct third-party imports only for small, stable utility libraries with no external lifecycle or I/O.
* **YAGNI abstraction:** Do not add abstractions solely for "future vendor replacement." Introduce adapters to create clean testing seams, isolate I/O, or centralize cross-cutting concerns (retries, timeouts, error mapping).

## Dependency Hygiene and Security

* **Lockfile maintenance:** For deployable applications and services, commit and maintain the ecosystem-appropriate lockfile when repository policy requires it. Never edit lockfiles manually; update them only using the repository's package manager in the same commit as the manifest change.
* **Scope enforcement:** Do not add, remove, or upgrade dependencies unless explicitly requested by the task or required to resolve a verified security vulnerability.
* **Upgrade diligence:** When modifying dependencies, review the lockfile diff, transitive changes, release notes, and licenses.

## Formatting

* **Enforce existing rules:** Follow the repository’s configured formatter, linter, editor settings, and file-specific rules. Do not debate styling choices already enforced.
* **No unsolicited styling:** Do not make unrelated, style-only changes outside files affected by the task. Do not introduce new formatters, configurations, or mass-formatting diffs during unrelated tasks.
* **Execution:** Run the applicable formatter on changed files. If formatting would create a broad unrelated diff, prefer check mode or isolate formatting in a separate intentional change. Treat unsafe autocorrect modes as code changes—review their diffs and run verification.

## Logging and Observability

* **No ad-hoc logs:** Use the repository’s logging abstraction. Never use print statements, `console.log`, or raw string concatenation for production observability.
* **Structured data:** Production service logs must be structured and machine-queryable (JSON preferred when no standard exists). Let the framework supply metadata like timestamps and environment context.
* **Correlation:** Include correlation IDs (`trace_id`, `request_id`, `operation_id`) when available, but do not force irrelevant identifiers into every event.
* **CLI output:** Keep CLI output human-readable, sending diagnostics and errors to stderr.

## Log Levels and Safety

* **Logging levels:** Log at `DEBUG` for high-volume troubleshooting, `INFO` for operation/business lifecycles, `WARN` for unexpected but recoverable conditions, and `ERROR` for operation failures.
* **Contextual safety:** Include error types, operations, and stack traces when logging failures. Never log secrets, credentials, auth headers, session tokens, payment data, raw request/responses, or unredacted personal data.
* **No substitute:** Do not use logs as a substitute for metrics, traces, audit records, or automated tests.

## Git Hygiene

* **Atomic commits:** Make each commit atomic and reviewable (include code, tests, migrations, config, and docs together for one change). Do not combine unrelated refactors or formatting changes with functional fixes.
* **Verify before commit:** Run the repository's build, formatting, linting, type-checking, and tests before committing. If the baseline fails or checks cannot run, document it in the commit or PR.
* **Commit conventions:** Follow the repository’s commit-message convention. Use Conventional Commits (`<type>(<scope>): <summary>`) only if already adopted or explicitly requested.
* **Descriptions & History:** PR descriptions must explain *why* the change is needed, summarize verification, and state limitations. Never amend published commits, force-push shared branches, or alter history unless requested.

---

# TecConcursos — Contexto operacional observado

Este contexto reúne apenas contratos observados no código deste projeto, no HTML fornecido pelo usuário, nas páginas abertas durante a depuração e no log detalhado de 23/07/2026. Ele orienta futuras alterações, mas não substitui uma nova inspeção quando o site mudar.

## Escopo do userscript

- Domínio observado: `https://www.tecconcursos.com.br`.
- O bundle é carregado em qualquer rota `https://www.tecconcursos.com.br/*` (e no domínio sem `www`) para que a Biblioteca TC esteja disponível globalmente. A coleta de questões continua limitada às páginas de caderno/filtro; a busca de reutilização usa a listagem de `/questoes/pastas/{id}` e a página do caderno/ impressão.
- A sessão, login, assinatura e permissões pertencem ao navegador e ao TecConcursos. O script não deve armazenar ou registrar credenciais, cookies, tokens ou cabeçalhos.
- A automação usa a UI real do site, especialmente Angular e seus eventos, em vez de presumir que um `click()` em texto decorativo seja suficiente.

## Identificação de pasta

- Uma pasta foi observada em `/questoes/pastas/{id}`; o exemplo usado foi `6423024`.
- A página de filtros usa `https://www.tecconcursos.com.br/questoes/filtrar?idPasta={id}`.
- O ID pode desaparecer ao navegar. Por isso ele deve ser salvo no estado da execução e usado para reconstruir a URL de filtros.
- O ID da pasta não deve ser inferido de texto visual se já estiver disponível na URL, no estado persistido ou em um atributo de link.
- A busca de materiais deve comparar o nome exato do MAT com links `a[href*='/questoes/cadernos/']`; não deve tratar links de `/questoes/pastas/` como cadernos. Se não encontrar o caderno, somente então deve abrir a URL de filtros e criar um novo.

## Filtros de matéria e assunto

- O painel observado mostra a área “Matéria e assunto”. Depois de uma busca, o cabeçalho pode aparecer como “Nome”; o reconhecimento deve considerar os dois estados.
- A árvore usa itens com `.arvore-item-conteudo.arvore-borda` e `ng-click="vm.notificarClick()"`. O `span.arvore-item-nome` é texto visual; o clique confiável deve ocorrer no contêiner Angular ou usar o fallback Angular validado pelos testes.
- O assunto de exemplo foi `Coerência. Coesão (Anáfora, Catáfora, Uso dos Conectores - Pronomes Relativos, Conjunções, etc)`.
- O nome do caderno deve ser o título do plano, por exemplo `Coesão textual - Conectivos básicos`, e não o título da taxonomia do TecConcursos.
- A seleção de banca é feita clicando no item real da árvore. O nome observado para a banca foi `OBJETIVA CONCURSOS`; outros nomes devem ser resolvidos pelo texto real exibido pelo site.
- Os anos devem ser selecionados clicando nos itens da árvore. Não se deve apenas escrever o ano em um campo, porque a seleção precisa atualizar o estado Angular do filtro.
- Critérios solicitados pelo plano: anos `2016` a `2026` conforme a lista configurada, remover questões desatualizadas e remover questões anuladas.
- O contador de resultados aparece em um `strong.ng-binding`; ele deve ser lido depois que os filtros terminarem de carregar, nunca imediatamente após o clique.

## Criação do caderno

- O campo do nome observado foi `#nomeCadernoId`, com `ng-model="vm.nomeCaderno"` e `ng-model-options="{ updateOn: 'blur' }"`.
- O procedimento confiável é clicar, preencher, disparar `input`/`change` quando necessário e disparar `blur` para sincronizar o `ng-model`.
- O botão observado foi `button[ng-click="vm.gerarCaderno()"]`; ele fica desabilitado quando não há nome, filtros ou questões.
- O estado deve registrar o índice e o título do MAT antes de navegar para o caderno criado.

## Impressão e divisão em partes

- A aba de impressão observada usa `div[role="button"].aba-navegacao` com ícone `glyphicon-print` e texto `Imprimir`.
- O botão final observado foi `button#confirmar-button` com texto `Imprimir Caderno`.
- O site limita cada saída a no máximo 200 questões.
- A primeira parte começa em `1`; as seguintes usam `201`, `401`, `601` e assim por diante, conforme a quantidade encontrada.
- O campo observado foi `#questaoInicialInput`, cujo `max` é dinâmico.
- A automação deve persistir o intervalo antes de clicar, salvar somente depois de extrair questões válidas e avançar de forma idempotente.
- A página pode carregar o HTML das questões gradualmente via AJAX. “Nenhuma questão no primeiro instante” é estado de espera; ausência definitiva depois do timeout é erro diagnosticável.
- O site também pode chamar `window.print()`. O userscript bloqueia a janela nativa de impressão na página de saída para evitar que o diálogo Ctrl+P interrompa o fluxo.

## Extração e biblioteca local

- O HTML da página de impressão é a fonte observada para enunciado, alternativas e metadados como banca, ano, órgão, cargo e vaga.
- As partes são consolidadas por identificador/número original; repetir uma parte não pode duplicar questões.
- A Biblioteca TC organiza os resultados por grupo do plano e permite baixar Excel e HTML.
- O Excel é XLSX real, com cabeçalhos, linhas de questões, metadados e autofiltro.
- O Excel deve manter uma coluna `Imagem N` por posição de imagem; imagens PNG/JPEG/GIF obtidas com as credenciais da página são incorporadas nas partes OOXML de mídia/desenho e a origem permanece como fallback quando a incorporação falhar.
- O HTML interativo usa tema escuro, mantém respostas, mostra feedback de acerto/erro quando `question.answer` existe, marca a alternativa correta, permite alternativas anuladas por duplo clique, salto para questão, filtros e histórico no `localStorage` do próprio documento. A reabertura deve hidratar o estado; reiniciar é uma ação explícita.
- Fragmentos HTML de enunciado e alternativas devem preservar imagens e transformar URLs relativas em absolutas antes de entrar na biblioteca; não remover imagens durante a sanitização.
- Exportações e logs devem omitir segredos e não devem enviar dados para serviço externo.

## Estado, retomada e concorrência

Estados operacionais usados pelo projeto: `idle`, `creating-caderno`, `opening-print`, `loading-output`, `waiting-questions`, `extracting`, `saving`, `paused`, `error` e `completed`.

Eventos importantes registram horário, `runId`, aba, fase, caderno, parte, intervalo, quantidade esperada/encontrada, URL, ação, erro e snapshot resumido.

- A execução possui `runId` e `ownerId` por aba.
- O lock usa lease, heartbeat, renovação, liberação e takeover explícito quando obsoleto.
- Uma aba sem o lease não pode retomar ou imprimir a execução de outra aba; um comando explícito de Parar pode encaminhar uma solicitação à aba proprietária, mas somente a aba proprietária grava a pausa e libera o lease.
- O estado persistido deve preservar partes concluídas, próximo intervalo, índice do MAT, URL de filtros, URL da pasta, modo `reuseExistingCadernos` e diagnóstico do erro.
- Em 23/07/2026, o log mostrou que os botões Pausar/Retomar eram executados, mas Retomar não tinha uma transição quando a página estava em `/questoes/pastas/{id}`. A correção passou a registrar `opening-filter` e reabrir a `filterUrl` salva antes de continuar.
- O userscript registra `GM_registerMenuCommand`/`GM_unregisterMenuCommand` para expor `⏹ Parar automação` e `▶ Retomar automação` no menu de comandos do Tampermonkey; o menu interno de gerenciamento com `Edit`/`Delete` não é extensível pelo script.
- O comando reutiliza `automation.pause()`/`automation.resumePaused()` e os fluxos consultam `ensureRunning` antes de cliques e navegações críticas. Uma navegação já iniciada não é cancelada, mas a próxima transição não deve ocorrer depois que a pausa for persistida.

## Diagnóstico de falhas

Mensagens e logs devem distinguir:

1. seletor ausente ou página errada;
2. elemento presente, mas evento Angular não aplicado;
3. contador ainda carregando;
4. impressão nativa interceptada ou popup/dialog bloqueador;
5. página de saída sem questões depois do timeout;
6. lock de outra aba;
7. estado corrompido ou sem URL de retomada.

Um log detalhado deve permitir saber exatamente em qual URL, MAT, parte, intervalo e fase a execução parou. Eventos antigos podem permanecer no histórico; a UI deve destacar a atividade mais recente.

## Regras para futuras alterações

- Antes de alterar seletores, capturar novamente o HTML e confirmar o comportamento Angular.
- Não substituir cliques de itens da árvore por preenchimento textual sem validar que o modelo Angular foi atualizado.
- Não remover a persistência de `folderId`, `filterUrl`, partes concluídas, lease ou histórico.
- Toda correção de fluxo deve incluir um teste de regressão e, quando possível, um teste E2E local com carregamento lento.
- O teste local simula o TecConcursos; ele não prova que o site real não mudou. Uma execução supervisionada real continua necessária antes de uma bateria longa.
- Não publicar mudanças no userscript sem regenerar o bundle, executar `npm run check` e conferir a versão/URL de atualização.

## Verificação do projeto

Comando principal não interativo:

```powershell
npm run check
```

Testes de fluxo real:

```powershell
npm run test:e2e
```

O bundle publicado usa a URL raw:

`https://raw.githubusercontent.com/YsraEstudos/Tecconcursos/main/tecconcursos-scraper.user.js`
