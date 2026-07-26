import http from 'http';
import fs from 'fs';
import path from 'path';

const PORT = 3000;

const server = http.createServer((req, res) => {
  const filePath = path.resolve('./tecconcursos-scraper.user.js');
  if (fs.existsSync(filePath)) {
    // Content-Type oficial de Userscripts para forçar a interceptação pelo Tampermonkey
    res.writeHead(200, {
      'Content-Type': 'application/x-userscript; charset=utf-8',
      'Content-Disposition': 'inline',
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*'
    });
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.writeHead(404);
    res.end('Arquivo nao encontrado');
  }
});

server.listen(PORT, () => {
  console.log(`\n✅ Servidor de instalação do Tampermonkey rodando em:`);
  console.log(`👉 http://localhost:${PORT}/tecconcursos-scraper.user.js\n`);
});
