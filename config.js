export const config = {
  // Arquivo onde as questões serão salvas em tempo real
  outputFile: './questoes.json',

  // Pasta onde a sessão do seu navegador ficará salva (login persistente)
  userDataDir: './user_data',

  // Tempo de espera (em milissegundos) entre a extração e o clique na próxima questão
  delayBetweenQuestionsMs: 1500,

  // Limite máximo de questões a extrair nesta execução (null para ilimitado)
  maxQuestions: null,

  // URL inicial (opcional - se null, você pode navegar livremente na tela aberta)
  initialUrl: 'https://www.tecconcursos.com.br'
};
