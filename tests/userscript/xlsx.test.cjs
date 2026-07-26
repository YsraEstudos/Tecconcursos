const test = require("node:test");
const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const library = require("../../src/userscript/library.cjs");

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function makeEntry() {
  return {
    id: "95080137",
    cadernoId: "95080137",
    code: "MAT-001",
    title: 'Coesão & "base" <FCC>',
    group: "Português & Redação",
    questions: [
      {
        id: "3821151",
        number: 1,
        bank: "FCC",
        year: 2026,
        vacancy: 'Analista <A> & "B"',
        organization: "Órgão 'Central'",
        role: "Cargo > Especial",
        subject: "Língua Portuguesa",
        topic: "Coesão & Crase",
        statement: 'Texto <forte> & "teste" com apóstrofo \'',
        options: [
          { letter: "A", text: "Alternativa A" },
          { letter: "B", text: "Alternativa B" },
          { letter: "C", text: "Alternativa C" },
          { letter: "D", text: "Alternativa D" },
          { letter: "E", text: "Alternativa E" }
        ],
        answer: "A"
      },
      {
        id: "3821152",
        number: 201,
        bank: "FUNDATEC",
        year: 2025,
        vacancy: "Técnico",
        organization: "Órgão 2",
        role: "Assistente",
        subject: "Língua Portuguesa",
        topic: "Coesão",
        statement: "Segunda questão",
        options: [{ letter: "A", text: "Verdadeiro" }, { letter: "B", text: "Falso" }],
        answer: "B"
      }
    ]
  };
}

function readU16(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readU32(bytes, offset) {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}

function crc32(bytes) {
  let crc = 0 ^ -1;
  for (const byte of bytes) {
    let value = (crc ^ byte) & 0xFF;
    for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? (0xEDB88320 ^ (value >>> 1)) : (value >>> 1);
    crc = (crc >>> 8) ^ value;
  }
  return (crc ^ -1) >>> 0;
}

function parseStoredZip(bytes) {
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const files = new Map();
  let offset = 0;
  while (offset + 4 <= bytes.length && readU32(bytes, offset) === 0x04034B50) {
    assert.equal(readU16(bytes, offset + 6), 0, "XLSX deve usar entradas sem flags de descriptor");
    assert.equal(readU16(bytes, offset + 8), 0, "o gerador deve produzir ZIP sem compressão");
    const crc = readU32(bytes, offset + 14);
    const compressedSize = readU32(bytes, offset + 18);
    const uncompressedSize = readU32(bytes, offset + 22);
    const nameSize = readU16(bytes, offset + 26);
    const extraSize = readU16(bytes, offset + 28);
    const nameStart = offset + 30;
    const contentStart = nameStart + nameSize + extraSize;
    const contentEnd = contentStart + compressedSize;
    assert.ok(contentEnd <= bytes.length, "entrada ZIP não pode ultrapassar o arquivo");
    const name = decoder.decode(bytes.slice(nameStart, nameStart + nameSize));
    const contentBytes = bytes.slice(contentStart, contentEnd);
    assert.equal(compressedSize, uncompressedSize, `tamanho inconsistente em ${name}`);
    assert.equal(crc32(contentBytes), crc, `CRC inválido em ${name}`);
    files.set(name, name.startsWith("xl/media/") ? contentBytes : decoder.decode(contentBytes));
    offset = contentEnd;
  }
  assert.equal(readU32(bytes, offset), 0x02014B50, "ZIP deve conter diretório central");
  return files;
}

function xmlUnescape(value) {
  return value.replace(/&(amp|lt|gt|quot|apos);/g, (_, entity) => ({
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'"
  })[entity]);
}

function assertWellFormedXml(xml, name) {
  assert.match(xml, /^<\?xml[^>]*\?>/, `${name} precisa declarar XML`);
  const stack = [];
  const tags = /<([^!?][^>]*)>/g;
  let match;
  while ((match = tags.exec(xml))) {
    const token = match[1].trim();
    if (token.startsWith("!--") || token.startsWith("![CDATA[")) continue;
    if (token.startsWith("/")) {
      const closingName = token.slice(1).trim();
      assert.equal(stack.pop(), closingName, `tags XML não balanceadas em ${name}`);
    } else if (!token.endsWith("/")) {
      stack.push(token.split(/\s+/, 1)[0]);
    }
  }
  assert.deepEqual(stack, [], `tags XML não finalizadas em ${name}`);
}

function cellMap(sheetXml, rowNumber) {
  const row = sheetXml.match(new RegExp(`<row r="${rowNumber}">([\\s\\S]*?)</row>`));
  assert.ok(row, `linha ${rowNumber} não encontrada`);
  const cells = new Map();
  const cellPattern = /<c r="([A-Z]+\d+)" t="inlineStr"><is><t xml:space="preserve">([\s\S]*?)<\/t><\/is><\/c>/g;
  let match;
  while ((match = cellPattern.exec(row[1]))) cells.set(match[1], xmlUnescape(match[2]));
  return cells;
}

function findLibreOffice() {
  for (const command of ["soffice", "libreoffice"]) {
    const result = childProcess.spawnSync("where.exe", [command], { encoding: "utf8", timeout: 5000 });
    if (result.status === 0 && result.stdout.trim()) return result.stdout.trim().split(/\r?\n/)[0];
  }
  return null;
}

function findPowerShell() {
  for (const command of ["powershell.exe", "pwsh.exe"]) {
    const result = childProcess.spawnSync("where.exe", [command], { encoding: "utf8", timeout: 5000 });
    if (result.status === 0 && result.stdout.trim()) return result.stdout.trim().split(/\r?\n/)[0];
  }
  return null;
}

test("gera XLSX íntegro, filtrável e compatível com caracteres especiais", async () => {
  const entry = makeEntry();
  const blob = await library.buildXlsxBlob(entry);
  assert.equal(blob.type, XLSX_MIME);

  const bytes = new Uint8Array(await blob.arrayBuffer());
  assert.deepEqual(Array.from(bytes.slice(0, 4)), [0x50, 0x4B, 0x03, 0x04]);
  const files = parseStoredZip(bytes);
  assert.deepEqual([...files.keys()], [
    "[Content_Types].xml",
    "_rels/.rels",
    "xl/workbook.xml",
    "xl/_rels/workbook.xml.rels",
    "xl/worksheets/sheet1.xml"
  ]);

  for (const [name, xml] of files) if (!name.startsWith("xl/media/")) assertWellFormedXml(xml, name);
  assert.match(files.get("[Content_Types].xml"), /PartName="\/xl\/worksheets\/sheet1\.xml"/);
  assert.match(files.get("xl/workbook.xml"), /sheet name="Questões"/);
  assert.match(files.get("xl/_rels/workbook.xml.rels"), /Target="worksheets\/sheet1\.xml"/);

  const sheet = files.get("xl/worksheets/sheet1.xml");
  assert.match(sheet, /<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"\/>/);
  assert.match(sheet, /<autoFilter ref="A1:S3"\/>/);
  assert.equal((sheet.match(/<row\b/g) || []).length, 3, "deve haver cabeçalho e duas questões");
  assert.match(sheet, /&amp;/);
  assert.match(sheet, /&lt;/);
  assert.match(sheet, /&gt;/);
  assert.match(sheet, /&quot;/);
  assert.match(sheet, /&apos;/);

  const headers = [...cellMap(sheet, 1).values()];
  assert.deepEqual(headers, [
    "Número", "Caderno", "Código", "Banca", "Ano", "Vaga", "Órgão", "Cargo", "Matéria", "Assunto",
    "Questão ID", "URL", "Enunciado", "Alternativa A", "Alternativa B", "Alternativa C", "Alternativa D",
    "Alternativa E", "Gabarito"
  ]);
  const firstQuestion = cellMap(sheet, 2);
  assert.equal(firstQuestion.get("A2"), "1");
  assert.equal(firstQuestion.get("B2"), 'Coesão & "base" <FCC>');
  assert.equal(firstQuestion.get("G2"), "Órgão 'Central'");
  assert.equal(firstQuestion.get("M2"), 'Texto <forte> & "teste" com apóstrofo \'');
  assert.equal(firstQuestion.get("S2"), "A");
  assert.equal(cellMap(sheet, 3).get("A3"), "201");
});

test("incorpora imagens no XLSX e mantém a origem como fallback", async () => {
  const pngBytes = Uint8Array.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  const pngData = Buffer.from(pngBytes).toString("base64");
  const entry = makeEntry();
  entry.questions[0].statementHtml = '<p>Texto</p><img src="data:image/png;base64,' + pngData + '">';
  entry.questions[0].options[0].html = '<strong>A)</strong> <img src="https://cdn.example.test/alternativa.png">';
  entry.questions[1].statementHtml = '<p>Sem download</p><img src="https://cdn.example.test/falha.webp">';
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (source) => source.includes("falha") ? ({ ok: false, headers: { get: () => "image/webp" } }) : ({
    ok: true,
    headers: { get: () => "image/png" },
    arrayBuffer: async () => pngBytes.buffer
  });
  try {
    const blob = await library.buildXlsxBlob(entry);
    const files = parseStoredZip(new Uint8Array(await blob.arrayBuffer()));
    const sheet = files.get("xl/worksheets/sheet1.xml");

    assert.ok(files.has("xl/media/image1.png"));
    assert.ok(files.has("xl/media/image2.png"));
    assert.match(sheet, /<drawing r="rId1"\/>/);
    assert.match(sheet, /<c r="T2" t="inlineStr"><is><t xml:space="preserve">\[imagem incorporada\]<\/t>/);
    assert.equal(cellMap(sheet, 3).get("T3"), "https://cdn.example.test/falha.webp");
    assert.match(files.get("xl/drawings/drawing1.xml"), /<xdr:oneCellAnchor>/);
    assert.match(files.get("xl/drawings/_rels/drawing1.xml.rels"), /Target="\.\.\/media\/image1\.png"/);
    assert.match(files.get("xl/worksheets/_rels/sheet1.xml.rels"), /Target="\.\.\/drawings\/drawing1\.xml"/);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

const powershell = findPowerShell();
test("lê o XLSX com o ZIP/XML do .NET no Windows", { skip: powershell ? false : "PowerShell não disponível" }, async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tecconcursos-xlsx-dotnet-"));
  const inputPath = path.join(tempRoot, "questoes.xlsx");
  const blob = await library.buildXlsxBlob(makeEntry());
  fs.writeFileSync(inputPath, Buffer.from(await blob.arrayBuffer()));
  const script = [
    "Add-Type -AssemblyName System.IO.Compression.FileSystem",
    "$archive = [System.IO.Compression.ZipFile]::OpenRead($env:TEC_XLSX_INPUT)",
    "try {",
    "  $entry = $archive.GetEntry('xl/worksheets/sheet1.xml')",
    "  if ($null -eq $entry) { exit 2 }",
    "  $reader = New-Object System.IO.StreamReader($entry.Open(), [System.Text.Encoding]::UTF8)",
    "  try { $xml = [xml]$reader.ReadToEnd() } finally { $reader.Dispose() }",
    "  $ns = New-Object System.Xml.XmlNamespaceManager($xml.NameTable)",
    "  $ns.AddNamespace('x', 'http://schemas.openxmlformats.org/spreadsheetml/2006/main')",
    "  $rows = @($xml.SelectNodes('//x:sheetData/x:row', $ns))",
    "  if ($rows.Count -ne 3) { exit 3 }",
    "  if ([string]$xml.SelectSingleNode('//x:autoFilter', $ns).GetAttribute('ref') -ne 'A1:S3') { exit 4 }",
    "  if ([string]$rows[0].SelectNodes('./x:c', $ns)[0].SelectSingleNode('./x:is/x:t', $ns).InnerText -ne 'Número') { exit 5 }",
    "  if ([string]$rows[1].SelectNodes('./x:c', $ns)[6].SelectSingleNode('./x:is/x:t', $ns).InnerText -ne \"Órgão 'Central'\") { exit 6 }",
    "  if ([string]$rows[1].SelectNodes('./x:c', $ns)[12].SelectSingleNode('./x:is/x:t', $ns).InnerText -notmatch 'Texto <forte>') { exit 7 }",
    "} finally { $archive.Dispose() }",
    "exit 0"
  ].join("; ");
  try {
    const result = childProcess.spawnSync(powershell, ["-NoProfile", "-NonInteractive", "-Command", script], {
      encoding: "utf8",
      timeout: 30000,
      env: Object.assign({}, process.env, { TEC_XLSX_INPUT: inputPath })
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

const libreOffice = findLibreOffice();
test("abre o XLSX com LibreOffice quando disponível", { skip: libreOffice ? false : "LibreOffice não instalado" }, async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tecconcursos-xlsx-"));
  const outputDir = path.join(tempRoot, "out");
  const profileDir = path.join(tempRoot, "profile");
  fs.mkdirSync(outputDir);
  fs.mkdirSync(profileDir);
  const inputPath = path.join(tempRoot, "questoes.xlsx");
  const blob = await library.buildXlsxBlob(makeEntry());
  fs.writeFileSync(inputPath, Buffer.from(await blob.arrayBuffer()));
  try {
    const result = childProcess.spawnSync(libreOffice, [
      "--headless",
      `-env:UserInstallation=${pathToFileURL(profileDir).href}`,
      "--convert-to", "csv",
      "--outdir", outputDir,
      inputPath
    ], { encoding: "utf8", timeout: 30000 });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const csvPath = path.join(outputDir, "questoes.csv");
    assert.ok(fs.existsSync(csvPath), "LibreOffice deveria produzir o CSV convertido");
    const csv = fs.readFileSync(csvPath, "utf8");
    assert.match(csv, /Órgão/);
    assert.match(csv, /Texto/);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
