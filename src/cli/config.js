export const config = {
  // ============================================================
  // CONFIGURAÇÃO DO SCRAPER VIA API
  // (extrai questões + gabarito sem automação de navegador)
  // ============================================================

  // ID do caderno de questões a extrair
  // Ex: se a URL é https://www.tecconcursos.com.br/questoes/cadernos/90463745
  // então o cadernoId é 90463745
  cadernoId: 90463745,

  // COMO OBTER OS COOKIES:
  // 1. Faça login no site no seu navegador
  // 2. Abra DevTools (F12) → Application/Storage → Cookies → tecconcursos.com.br
  // 3. Copie todos os nomes e valores
  // OU execute: npm run extract-cookies
  //    (extrai automaticamente dos dados do Playwright, se você já fez login nele)
  //
  // Formato: "nome1=valor1; nome2=valor2; ..."
  // ⚠️ NÃO compartilhe este arquivo após preencher os cookies!
  cookies: '',

  // Arquivo onde as questões serão salvas
  outputFile: './questoes.json',

  // Tempo entre requisições (em milissegundos) - intervalo aleatório
  delayMin: 3000,   // mínimo 3 segundos
  delayMax: 6000,   // máximo 6 segundos

  // Limite máximo de questões nesta execução (null = ilimitado)
  maxQuestions: null,

  // Modo de relatório: 'todas' = exibe cada questão, 'resumo' = só progresso
  logLevel: 'todas',

  // ============================================================
  // CONFIGURAÇÃO LEGADA (Playwright - não recomendada)
  // ============================================================

  // Pasta com sessão do Playwright (usado apenas pelo extract-cookies)
  userDataDir: './user_data'
};
