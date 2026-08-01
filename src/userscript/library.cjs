(function (root, factory) {
  var api = factory(
    typeof module !== "undefined" && module.exports
      ? { gabarito: require("./gabarito.cjs") }
      : { gabarito: root.TecConcursosModules.gabarito }
  );
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) {
    root.TecConcursosModules = root.TecConcursosModules || {};
    root.TecConcursosModules.library = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (deps) {
  "use strict";

  var gabaritoModule = deps && deps.gabarito;
  var LIBRARY_KEY = "tecconcursos_export_library_v1";
  var LIBRARY_ENTRY_PREFIX = "tecconcursos_export_library_entry_v1:";

  function entryStorageKey(id) {
    return LIBRARY_ENTRY_PREFIX + String(id);
  }

  function entryMetadata(entry) {
    var metadata = Object.assign({}, entry);
    metadata.questionCount = Array.isArray(entry && entry.questions) ? entry.questions.length : Number(metadata.questionCount) || 0;
    delete metadata.questions;
    return metadata;
  }

  function clean(value) {
    return String(value == null ? "" : value).replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  }

  function safeFilename(value) {
    return clean(value).replace(/[<>:"/\\|?*\x00-\x1F]/g, "-").replace(/\.+$/g, "").slice(0, 100) || "arquivo";
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (character) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character];
    });
  }

  function sanitizeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, "")
      .replace(/<\/?(?:iframe|object|embed)\b[^>]*>/gi, "")
      .replace(/\son\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
      .replace(/\s(?:href|src)\s*=\s*(["'])\s*javascript:[\s\S]*?\1/gi, "");
  }

  function resolveUrl(value, baseUrl) {
    var raw = String(value == null ? "" : value).trim();
    if (!raw || /^(?:data|blob|https?|file):/i.test(raw)) return raw;
    try { return new URL(raw, baseUrl || "").href; } catch (_) { return raw; }
  }

  function normalizeImageAttributes(html, baseUrl) {
    return String(html == null ? "" : html).replace(/\b(src|data-src)\s*=\s*(["'])(.*?)\2/gi, function (_, name, quote, value) {
      return name + "=" + quote + resolveUrl(value, baseUrl) + quote;
    });
  }

  function serializeHtmlWithAbsoluteImages(node) {
    if (!node) return "";
    var baseUrl = node.baseURI || (node.ownerDocument && node.ownerDocument.baseURI) || "";
    if (typeof node.cloneNode === "function") {
      var clone = node.cloneNode(true);
      if (clone && typeof clone.querySelectorAll === "function") {
        Array.from(clone.querySelectorAll("img")).forEach(function (image) {
          var source = image.getAttribute("data-tec-original-src") || image.currentSrc || image.getAttribute("src") || image.getAttribute("data-src") || "";
          var resolved = resolveUrl(source, baseUrl);
          if (resolved) image.setAttribute("src", resolved);
          var srcset = image.getAttribute("data-tec-original-srcset") || image.getAttribute("srcset");
          if (srcset) {
            image.setAttribute("srcset", srcset.split(",").map(function (candidate) {
              var pieces = candidate.trim().split(/\s+/);
              pieces[0] = resolveUrl(pieces[0], baseUrl);
              return pieces.join(" ");
            }).join(", "));
          }
        });
      }
      if (typeof clone.innerHTML === "string") return sanitizeHtml(clone.innerHTML);
    }
    return sanitizeHtml(normalizeImageAttributes(node.innerHTML, baseUrl));
  }

  function parseHeader(value) {
    var header = clean(value);
    var pieces = header.split("/").map(clean).filter(Boolean);
    var first = pieces.shift() || "";
    var firstSplit = first.split(/\s+-\s+/);
    var bank = clean(firstSplit.shift());
    var vacancy = clean(firstSplit.join(" - "));
    var year = null;
    var firstYearMatch = vacancy.match(/\b(19|20)\d{2}\b/);
    if (firstYearMatch) {
      year = Number(firstYearMatch[0]);
      vacancy = clean(vacancy.replace(firstYearMatch[0], "").replace(/^\s*-\s*|\s*-\s*$/g, ""));
    }
    var last = pieces.length ? pieces[pieces.length - 1] : "";
    var yearMatch = last.match(/\b(19|20)\d{2}\b/);
    if (yearMatch && year == null) year = Number(yearMatch[0]);
    if (yearMatch) pieces[pieces.length - 1] = clean(last.replace(yearMatch[0], "").replace(/^\s*-\s*|\s*-\s*$/g, ""));
    pieces = pieces.filter(Boolean);
    return {
      raw: header,
      bank: bank,
      vacancy: vacancy,
      organization: pieces.shift() || "",
      role: pieces.join(" / "),
      year: year
    };
  }

  function optionData(node) {
    var raw = clean(node && (node.innerText || node.textContent));
    var match = raw.match(/^([a-e])\)\s*/i);
    return {
      letter: match ? match[1].toUpperCase() : "",
      text: raw.replace(/^([a-e])\)\s*/i, ""),
      html: serializeHtmlWithAbsoluteImages(node)
    };
  }

  function parsePrintedQuestion(node, index) {
    var source = node || {};
    var link = source.querySelector ? source.querySelector("a[href*='/questoes/']") : null;
    var url = link ? String(link.href || link.getAttribute("href") || "") : "";
    var idMatch = url.match(/\/questoes\/(\d+)/);
    var info = source.querySelector ? source.querySelector(".cabecalho .informacoes") : null;
    var blocks = info ? Array.from(info.children || []) : [];
    var headerBlock = blocks.filter(function (block) {
      return !/(linkQuestao|classificacao)/.test(String(block.className || ""));
    })[0];
    var classification = source.querySelector ? source.querySelector(".classificacao") : null;
    var classificationText = clean(classification && (classification.innerText || classification.textContent));
    var classificationParts = classificationText.split(/\s+-\s+/);
    var answerNode = source.querySelector ? source.querySelector(".gabarito, .resposta-correta") : null;
    var metadata = parseHeader(headerBlock && (headerBlock.innerText || headerBlock.textContent));
    var statement = source.querySelector ? source.querySelector(".enunciado") : null;
    var numberNode = source.querySelector ? source.querySelector(".enunciado strong") : null;
    var numberMatch = clean(numberNode && (numberNode.innerText || numberNode.textContent)).match(/^(\d+)\)/);
    var alternatives = source.querySelectorAll ? Array.from(source.querySelectorAll(".alternativa")).map(optionData) : [];
    return {
      id: idMatch ? idMatch[1] : "print-" + String(index + 1),
      number: numberMatch ? Number(numberMatch[1]) : index + 1,
      url: url,
      header: metadata.raw,
      bank: metadata.bank,
      year: metadata.year,
      vacancy: metadata.vacancy,
      organization: metadata.organization,
      role: metadata.role,
      subject: clean(classificationParts.shift()),
      topic: clean(classificationParts.join(" - ")),
      statement: clean(statement && (statement.innerText || statement.textContent)),
      statementHtml: serializeHtmlWithAbsoluteImages(statement),
      options: alternatives,
      answer: clean(answerNode && (answerNode.innerText || answerNode.textContent))
    };
  }

  function applyGabaritoBlock(questions, documentNode) {
    if (!questions.length || !gabaritoModule || typeof gabaritoModule.parseGabaritoDocument !== "function") return questions;
    var entries = gabaritoModule.parseGabaritoDocument(documentNode);
    if (!entries.length) return questions;
    var byNumber = {};
    entries.forEach(function (entry) {
      if (entry.index > 0 && entry.answer) byNumber[entry.index] = String(entry.answer).trim();
    });
    return questions.map(function (question) {
      var answer = question.answer || byNumber[Number(question.number)];
      if (!answer || answer === question.answer) return question;
      return Object.assign({}, question, {
        answer: answer,
        answerField: "gabarito",
        answerSource: "print-page"
      });
    });
  }

  function extractPrintedQuestions(documentNode) {
    if (!documentNode || typeof documentNode.querySelectorAll !== "function") return [];
    return applyGabaritoBlock(Array.from(documentNode.querySelectorAll(".questao")).map(parsePrintedQuestion), documentNode);
  }

  function yieldToBrowser(documentNode) {
    var view = documentNode && documentNode.defaultView;
    var schedule = view && typeof view.setTimeout === "function"
      ? view.setTimeout.bind(view)
      : typeof setTimeout === "function" ? setTimeout : null;
    if (!schedule) return Promise.resolve();
    return new Promise(function (resolve) { schedule(resolve, 0); });
  }

  async function extractPrintedQuestionsAsync(documentNode, options) {
    if (!documentNode || typeof documentNode.querySelectorAll !== "function") return [];
    var config = options || {};
    var nodes = Array.from(documentNode.querySelectorAll(".questao"));
    var chunkSize = Math.max(1, Number(config.chunkSize) || 5);
    var pauseCheck = typeof config.ensureRunning === "function" ? config.ensureRunning : function () {};
    var yieldControl = typeof config.yieldToBrowser === "function" ? config.yieldToBrowser : function () { return yieldToBrowser(documentNode); };
    var questions = [];
    for (var start = 0; start < nodes.length; start += chunkSize) {
      pauseCheck();
      var end = Math.min(nodes.length, start + chunkSize);
      for (var index = start; index < end; index += 1) questions.push(parsePrintedQuestion(nodes[index], index));
      if (end < nodes.length) {
        await yieldControl();
        pauseCheck();
      }
    }
    return applyGabaritoBlock(questions, documentNode);
  }

  function cadernoIdFromLocation(locationLike) {
    var source = typeof locationLike === "string" ? locationLike : locationLike && locationLike.href;
    var match = String(source || "").match(/\/cadernos\/(\d+)/i);
    return match ? match[1] : "";
  }

  function emptyLibrary() {
    return { version: 1, entries: {} };
  }

  function normalizeLibrary(value) {
    var library = value && typeof value === "object" && !Array.isArray(value) ? value : emptyLibrary();
    if (!library.entries || typeof library.entries !== "object") library.entries = {};
    return library;
  }

  function questionKey(question) {
    return String(question && (question.id || question.url || question.number) || "");
  }

  var SLIM_CHARS = 32 * 1024 * 1024;

  function stripDataUriImages(html) {
    return String(html == null ? "" : html).replace(/data:image\/[a-zA-Z0-9.+-]+(?:;[a-zA-Z0-9=.\-]+)*;base64,[A-Za-z0-9+/=\s]+/gi, "");
  }

  function slimEntryForStorage(entry) {
    if (!entry || !Array.isArray(entry.questions)) return entry;
    var size = 0;
    try { size = JSON.stringify(entry).length; } catch (_) { return entry; }
    if (size <= SLIM_CHARS) return entry;
    return Object.assign({}, entry, {
      questions: entry.questions.map(function (question) {
        return Object.assign({}, question, {
          statementHtml: stripDataUriImages(question && question.statementHtml),
          options: (question && question.options || []).map(function (option) {
            return Object.assign({}, option, { html: stripDataUriImages(option && option.html) });
          })
        });
      })
    });
  }

  function createLibrary(storage) {
    function readIndex() {
      return normalizeLibrary(storage.read(LIBRARY_KEY, emptyLibrary()));
    }
    function writeIndex(library) {
      storage.write(LIBRARY_KEY, library);
    }
    function readEntry(id) {
      var value = storage.read(entryStorageKey(id), null);
      return value && typeof value === "object" && !Array.isArray(value) ? value : null;
    }
    function writeEntry(id, entry) {
      return storage.write(entryStorageKey(id), slimEntryForStorage(entry));
    }
    function removeEntry(id) {
      if (typeof storage.remove === "function") storage.remove(entryStorageKey(id));
      else storage.write(entryStorageKey(id), null);
    }
    function migrateLegacy(library) {
      var touched = false;
      Object.keys(library.entries).forEach(function (key) {
        var entry = library.entries[key];
        if (entry && Array.isArray(entry.questions)) {
          try {
            if (writeEntry(key, entry)) {
              library.entries[key] = entryMetadata(entry);
              touched = true;
            }
          } catch (_) {}
        }
      });
      if (touched) writeIndex(library);
      return library;
    }
    function read() {
      return migrateLegacy(normalizeLibrary(storage.read(LIBRARY_KEY, emptyLibrary())));
    }
    function list() {
      var entries = read().entries;
      return Object.keys(entries).map(function (key) {
        var entry = entries[key];
        return Object.assign({}, entry, { questions: undefined });
      }).sort(function (left, right) {
        return String(left.group || "").localeCompare(String(right.group || ""), "pt-BR") || String(left.title || "").localeCompare(String(right.title || ""), "pt-BR");
      });
    }
    function get(id) {
      var key = String(id);
      var entry = readEntry(key);
      if (entry) return entry;
      var library = read();
      entry = readEntry(key);
      if (entry) return entry;
      var legacy = library.entries && library.entries[key];
      return legacy && Array.isArray(legacy.questions) ? legacy : null;
    }
    function appendPart(info, questions) {
      var key = String(info.libraryId || info.cadernoId || info.code || "");
      if (!key) throw new Error("Não foi possível identificar o caderno para a biblioteca.");
      var old = readEntry(key) || { id: key, questions: [], parts: [] };
      var existing = {};
      (old.questions || []).forEach(function (question) { existing[questionKey(question)] = true; });
      var added = (Array.isArray(questions) ? questions : []).filter(function (question) {
        var qKey = questionKey(question);
        if (!qKey || existing[qKey]) return false;
        existing[qKey] = true;
        return true;
      });
      var previousPart = (old.parts || []).find(function (part) { return part.start === info.start; });
      var parts = (old.parts || []).filter(function (part) { return part.start !== info.start; });
      parts.push({
        start: Number(info.start) || 1,
        count: added.length || Number(previousPart && previousPart.count) || 0,
        savedAt: new Date().toISOString()
      });
      var merged = Object.assign({}, old, info, {
        id: key,
        questions: (old.questions || []).concat(added),
        parts: parts.sort(function (left, right) { return left.start - right.start; }),
        updatedAt: new Date().toISOString()
      });
      writeEntry(key, merged);
      var index = readIndex();
      index.entries[key] = entryMetadata(merged);
      writeIndex(index);
      return merged;
    }
    function remove(id) {
      var key = String(id);
      removeEntry(key);
      var library = readIndex();
      delete library.entries[key];
      writeIndex(library);
    }
    function clear() {
      var library = readIndex();
      Object.keys(library.entries).forEach(removeEntry);
      writeIndex(emptyLibrary());
    }
    return { list: list, get: get, appendPart: appendPart, remove: remove, clear: clear };
  }

  function csvValue(value) {
    return '"' + String(value == null ? "" : value).replace(/"/g, '""') + '"';
  }

  function buildCsv(entry) {
    var columns = ["Número", "Caderno", "Código", "Banca", "Ano", "Vaga", "Órgão", "Cargo", "Matéria", "Assunto", "Questão ID", "URL", "Enunciado", "Alternativa A", "Alternativa B", "Alternativa C", "Alternativa D", "Alternativa E", "Gabarito"];
    var lines = [columns.map(csvValue).join(";")];
    (entry.questions || []).forEach(function (question, index) {
      var alternatives = {};
      (question.options || []).forEach(function (option) { alternatives[option.letter] = option.text; });
      lines.push([
        question.number || index + 1, entry.title, entry.code, question.bank, question.year,
        question.vacancy, question.organization, question.role, question.subject, question.topic,
        question.id, question.url, question.statement, alternatives.A, alternatives.B,
        alternatives.C, alternatives.D, alternatives.E, question.answer || question.gabarito
      ].map(csvValue).join(";"));
    });
    return "\uFEFF" + lines.join("\r\n");
  }

  function xmlEscape(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (character) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[character];
    });
  }

  function columnName(index) {
    var value = index + 1;
    var output = "";
    while (value > 0) {
      var remainder = (value - 1) % 26;
      output = String.fromCharCode(65 + remainder) + output;
      value = Math.floor((value - 1) / 26);
    }
    return output;
  }

  function imageSourcesFromHtml(value) {
    var sources = [];
    var pattern = /<img\b[^>]*\b(?:src|data-src)\s*=\s*(["'])(.*?)\1/gi;
    var match;
    while ((match = pattern.exec(String(value == null ? "" : value)))) {
      var source = String(match[2] || "").trim();
      if (source && sources.indexOf(source) < 0) sources.push(source);
    }
    return sources;
  }

  function questionImageSources(question) {
    var sources = imageSourcesFromHtml(question && question.statementHtml);
    (question && question.options || []).forEach(function (option) {
      imageSourcesFromHtml(option && option.html).forEach(function (source) {
        if (sources.indexOf(source) < 0) sources.push(source);
      });
    });
    return sources;
  }

  function imageSourcesForEntry(entry) {
    return (entry.questions || []).map(questionImageSources);
  }

  function excelRows(entry, questionImages, imageAssets) {
    var imageCount = (questionImages || []).reduce(function (maximum, sources) { return Math.max(maximum, sources.length); }, 0);
    var headers = ["Número", "Caderno", "Código", "Banca", "Ano", "Vaga", "Órgão", "Cargo", "Matéria", "Assunto", "Questão ID", "URL", "Enunciado", "Alternativa A", "Alternativa B", "Alternativa C", "Alternativa D", "Alternativa E", "Gabarito"];
    for (var imageIndex = 0; imageIndex < imageCount; imageIndex += 1) headers.push("Imagem " + String(imageIndex + 1));
    var rows = [headers];
    (entry.questions || []).forEach(function (question, index) {
      var alternatives = {};
      (question.options || []).forEach(function (option) { alternatives[option.letter] = option.text; });
      var row = [question.number || index + 1, entry.title, entry.code, question.bank, question.year, question.vacancy, question.organization, question.role, question.subject, question.topic, question.id, question.url, question.statement, alternatives.A, alternatives.B, alternatives.C, alternatives.D, alternatives.E, question.answer || question.gabarito];
      (questionImages && questionImages[index] || []).forEach(function (source) {
        row.push(imageAssets && imageAssets.has(source) ? "[imagem incorporada]" : source);
      });
      while (row.length < headers.length) row.push("");
      rows.push(row);
    });
    return rows;
  }

  function crc32(bytes) {
    var table = crc32.table || (crc32.table = Array.from({ length: 256 }, function (_, index) {
      var value = index;
      for (var bit = 0; bit < 8; bit += 1) value = (value & 1) ? (0xEDB88320 ^ (value >>> 1)) : (value >>> 1);
      return value >>> 0;
    }));
    var crc = 0 ^ -1;
    for (var i = 0; i < bytes.length; i += 1) crc = (crc >>> 8) ^ table[(crc ^ bytes[i]) & 0xFF];
    return (crc ^ -1) >>> 0;
  }

  function u16(value) { return [value & 255, (value >>> 8) & 255]; }
  function u32(value) { return [value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255]; }

  function zipStore(files) {
    var encoder = new TextEncoder();
    var chunks = [];
    var directory = [];
    var offset = 0;
    files.forEach(function (file) {
      var name = encoder.encode(file.name);
      var content = typeof file.content === "string" ? encoder.encode(file.content) : new Uint8Array(file.content);
      var crc = crc32(content);
      var local = [0x50, 0x4B, 0x03, 0x04].concat(u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(content.length), u32(content.length), u16(name.length), u16(0), Array.from(name), Array.from(content));
      chunks.push(local);
      directory.push([0x50, 0x4B, 0x01, 0x02].concat(u16(20), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(content.length), u32(content.length), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), Array.from(name)));
      offset += local.length;
    });
    var directorySize = directory.reduce(function (total, entry) { return total + entry.length; }, 0);
    var output = chunks.concat(directory);
    output.push([0x50, 0x4B, 0x05, 0x06].concat(u16(0), u16(0), u16(files.length), u16(files.length), u32(directorySize), u32(offset), u16(0)));
    return new Uint8Array(output.flat());
  }

  var MAX_EMBEDDED_IMAGE_BYTES = 8 * 1024 * 1024;

  function decodeBase64(value) {
    if (typeof atob !== "function") return null;
    try {
      var binary = atob(String(value || "").replace(/\s/g, ""));
      var bytes = new Uint8Array(binary.length);
      for (var index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
      return bytes;
    } catch (_) { return null; }
  }

  function imageFormat(bytes, mime) {
    var type = String(mime || "").split(";", 1)[0].toLowerCase();
    if (bytes && bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) return { extension: "png", mime: "image/png" };
    if (bytes && bytes.length >= 3 && bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) return { extension: "jpg", mime: "image/jpeg" };
    if (bytes && bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return { extension: "gif", mime: "image/gif" };
    if (type === "image/jpg") type = "image/jpeg";
    if (type === "image/png") return { extension: "png", mime: type };
    if (type === "image/jpeg") return { extension: "jpg", mime: type };
    if (type === "image/gif") return { extension: "gif", mime: type };
    return null;
  }

  async function readImageAsset(source) {
    var raw = String(source || "").trim();
    if (!raw) return null;
    var bytes = null;
    var mime = "";
    var dataMatch = raw.match(/^data:([^;,]+)(;base64)?,([\s\S]*)$/i);
    if (dataMatch) {
      mime = dataMatch[1];
      if (dataMatch[2]) {
        bytes = decodeBase64(dataMatch[3]);
      } else {
        try { bytes = new TextEncoder().encode(decodeURIComponent(dataMatch[3])); } catch (_) { bytes = null; }
      }
    } else if (/^https?:/i.test(raw) && typeof fetch === "function") {
      try {
        var response = await fetch(raw, { credentials: "include" });
        if (!response || !response.ok) return null;
        mime = response.headers && response.headers.get ? response.headers.get("content-type") || "" : "";
        bytes = new Uint8Array(await response.arrayBuffer());
      } catch (_) { return null; }
    }
    if (!bytes || !bytes.length || bytes.length > MAX_EMBEDDED_IMAGE_BYTES) return null;
    var format = imageFormat(bytes, mime);
    return format ? { source: raw, bytes: bytes, extension: format.extension, mime: format.mime } : null;
  }

  async function loadImageAssets(questionImages) {
    var assets = new Map();
    var embedded = [];
    for (var questionIndex = 0; questionIndex < questionImages.length; questionIndex += 1) {
      for (var imageIndex = 0; imageIndex < questionImages[questionIndex].length; imageIndex += 1) {
        var source = questionImages[questionIndex][imageIndex];
        if (assets.has(source)) continue;
        var asset = await readImageAsset(source);
        if (asset) {
          asset.mediaIndex = embedded.length + 1;
          embedded.push(asset);
          assets.set(source, asset);
        }
      }
    }
    return { assets: assets, embedded: embedded };
  }

  function drawingXml(drawingImages) {
    var xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">';
    drawingImages.forEach(function (image, index) {
      xml += '<xdr:oneCellAnchor><xdr:from><xdr:col>' + String(image.column) + '</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>' + String(image.row) + '</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:ext cx="5000000" cy="2500000"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="' + String(index + 1) + '" name="Imagem ' + String(index + 1) + '"/><xdr:cNvPicPr/></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rId' + String(index + 1) + '"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor>';
    });
    return xml + "</xdr:wsDr>";
  }

  function drawingRelationshipsXml(drawingImages) {
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + drawingImages.map(function (image, index) {
      return '<Relationship Id="rId' + String(index + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image' + String(image.asset.mediaIndex) + '.' + image.asset.extension + '"/>';
    }).join("") + "</Relationships>";
  }

  async function buildXlsxBlob(entry) {
    var questionImages = imageSourcesForEntry(entry);
    var loadedImages = await loadImageAssets(questionImages);
    var rows = excelRows(entry, questionImages, loadedImages.assets);
    var worksheet = rows.map(function (row, rowIndex) {
      var cells = row.map(function (value, columnIndex) {
        var reference = columnName(columnIndex) + String(rowIndex + 1);
        return '<c r="' + reference + '" t="inlineStr"><is><t xml:space="preserve">' + xmlEscape(value) + "</t></is></c>";
      }).join("");
      return '<row r="' + String(rowIndex + 1) + '">' + cells + "</row>";
    }).join("");
    var lastCell = columnName(rows[0].length - 1) + String(rows.length);
    var drawingImages = [];
    questionImages.forEach(function (sources, questionIndex) {
      sources.forEach(function (source, imageIndex) {
        var asset = loadedImages.assets.get(source);
        if (asset) drawingImages.push({ asset: asset, column: 19 + imageIndex * 2, row: questionIndex + 1 });
      });
    });
    var hasImages = drawingImages.length > 0;
    var contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>';
    if (hasImages) {
      var contentTypeByExtension = { png: "image/png", jpg: "image/jpeg", gif: "image/gif" };
      Array.from(new Set(loadedImages.embedded.map(function (image) { return image.extension; }))).forEach(function (extension) {
        contentTypes += '<Default Extension="' + extension + '" ContentType="' + contentTypeByExtension[extension] + '"/>';
      });
      contentTypes += '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>';
    }
    contentTypes += '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>';
    var worksheetXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"' + (hasImages ? ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"' : "") + '><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetData>' + worksheet + '</sheetData><autoFilter ref="A1:' + lastCell + '"/>' + (hasImages ? '<drawing r="rId1"/>' : "") + '</worksheet>';
    var files = [
      { name: "[Content_Types].xml", content: contentTypes },
      { name: "_rels/.rels", content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
      { name: "xl/workbook.xml", content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Questões" sheetId="1" r:id="rId1"/></sheets></workbook>' },
      { name: "xl/_rels/workbook.xml.rels", content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>' },
      { name: "xl/worksheets/sheet1.xml", content: worksheetXml }
    ];
    if (hasImages) {
      files.push({ name: "xl/worksheets/_rels/sheet1.xml.rels", content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>' });
      files.push({ name: "xl/drawings/drawing1.xml", content: drawingXml(drawingImages) });
      files.push({ name: "xl/drawings/_rels/drawing1.xml.rels", content: drawingRelationshipsXml(drawingImages) });
      loadedImages.embedded.forEach(function (image) { files.push({ name: "xl/media/image" + String(image.mediaIndex) + "." + image.extension, content: image.bytes }); });
    }
    return new Blob([zipStore(files)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  }

  function outputBaseName(entry) {
    return safeFilename((entry.group || "Sem grupo") + " - " + (entry.title || entry.code || "Caderno"));
  }

  function downloadBlob(documentNode, filename, blob) {
    var url = URL.createObjectURL(blob);
    var anchor = documentNode.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    documentNode.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
  }

  function jsJson(value) {
    return JSON.stringify(value).replace(/<\/script/gi, "<\\/script");
  }

  function buildInteractiveHtml(entry) {
    var data = Object.assign({}, entry, { questions: entry.questions || [] });
    var initial = { attempts: [{ id: "tentativa-1", createdAt: new Date().toISOString(), answers: {}, eliminated: {} }], activeAttempt: 0 };
    var fileName = safeFilename((entry.title || entry.code || "caderno") + "-interativo.html");
    var runtime = String.raw`(function () {
  "use strict";
  var data = JSON.parse(document.getElementById("tec-caderno-data").textContent);
  var fallback = JSON.parse(document.getElementById("tec-caderno-state").textContent);
  var key = "tecconcursos-html-v1:" + data.id;
  var state = fallback;
  var index = 0;
  var downloadName = ${jsJson(fileName)};
  var darkTheme = document.createElement("style");
  darkTheme.textContent = ":root{color-scheme:dark}body{background:#0b1120;color:#e5e7eb}.card{background:#111827;color:#e5e7eb}.controls button,.controls input,.controls select{background:#1f2937;color:#f9fafb;border-color:#4b5563}.meta{color:#cbd5e1}.tag{background:#172554;color:#bfdbfe}.option{background:#1f2937;color:#f9fafb;border-color:#4b5563;transition:background .2s ease,border-color .2s ease,opacity .3s ease,filter .3s ease}.option:hover{border-color:#60a5fa}.option.selected{background:#172554;border-color:#60a5fa}.option.correct{background:#052e16;border-color:#22c55e}.option.incorrect{background:#450a0a;border-color:#ef4444}.option.eliminated{background:#111827;opacity:.3;filter:grayscale(.8)}.hint,.empty{color:#94a3b8}.feedback{margin:14px 0;padding:12px 14px;border-radius:8px;border:1px solid #475569;background:#1e293b;color:#e2e8f0;font-weight:700}.feedback.correct{border-color:#22c55e;background:#052e16;color:#bbf7d0}.feedback.incorrect{border-color:#ef4444;background:#450a0a;color:#fecaca}.feedback.unavailable{border-color:#f59e0b;background:#451a03;color:#fde68a}.statement img,.option img{display:block;max-width:100%;height:auto;margin:12px auto;border-radius:8px}";
  document.head.appendChild(darkTheme);
  function read() { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch (_) { return fallback; } }
  function write() {
    document.getElementById("tec-caderno-state").textContent = JSON.stringify(state);
    try { localStorage.setItem(key, JSON.stringify(state)); document.getElementById("status").textContent = "Histórico salvo localmente"; }
    catch (_) { document.getElementById("status").textContent = "Histórico apenas nesta sessão; baixe o HTML para preservar"; }
  }
  function currentAttempt() { return state.attempts[state.activeAttempt] || state.attempts[0]; }
  function escapeValue(value) { return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]; }); }
  function answerLetter(value) {
    var raw = String(value == null ? "" : value).trim().toUpperCase();
    if (/^[A-E]$/.test(raw)) return raw;
    var labeled = raw.match(/(?:GABARITO|RESPOSTA|ALTERNATIVA)\s*[:.)-]?\s*([A-E])\b/);
    if (labeled) return labeled[1];
    var prefixed = raw.match(/^([A-E])\s*[:.)-]/);
    return prefixed ? prefixed[1] : "";
  }
  function visibleQuestions() {
    return data.questions.filter(function (question) {
      return (!document.getElementById("bank").value || question.bank === document.getElementById("bank").value) && (!document.getElementById("year").value || String(question.year || "") === document.getElementById("year").value) && (!document.getElementById("vacancy").value || question.vacancy === document.getElementById("vacancy").value);
    });
  }
  function render() {
    var visible = visibleQuestions();
    var question = visible[index];
    document.getElementById("title").textContent = data.title || data.code || "Caderno";
    document.getElementById("summary").textContent = (data.group || "Sem grupo") + " · " + visible.length + " questão(ões) filtrada(s) de " + data.questions.length;
    if (!question) { document.getElementById("question").innerHTML = '<div class="empty">Nenhuma questão para esse filtro.</div>'; return; }
    var attempt = currentAttempt();
    var correctAnswer = answerLetter(question.answer || question.gabarito);
    var selectedAnswer = answerLetter(attempt.answers[question.id]);
    var confirmed = !!(attempt.confirmed || {})[question.id];
    var meta = [question.bank, question.year, question.organization, question.role, question.vacancy, question.subject, question.topic].filter(Boolean).map(function (value) { return '<span class="tag">' + escapeValue(value) + "</span>"; }).join("");
    var body = question.statementHtml || ("<p>" + escapeValue(question.statement) + "</p>");
    var alternatives = (question.options || []).map(function (option) {
      var selected = selectedAnswer === option.letter;
      var correct = confirmed && !!correctAnswer && correctAnswer === option.letter;
      var incorrect = confirmed && selected && !!correctAnswer && selectedAnswer !== correctAnswer;
      var eliminated = !!(attempt.eliminated[question.id] || {})[option.letter];
      return '<button class="option ' + (selected ? "selected " : "") + (correct ? "correct " : "") + (incorrect ? "incorrect " : "") + (eliminated ? "eliminated " : "") + '" aria-pressed="' + (selected ? "true" : "false") + '" data-letter="' + escapeValue(option.letter) + '">' + (option.html || ("<strong>" + escapeValue(option.letter) + ")</strong> " + escapeValue(option.text))) + "</button>";
    }).join("");
    var feedbackClass = "feedback";
    var feedbackText = "Selecione uma alternativa e clique em Responder para confirmar.";
    if (selectedAnswer && correctAnswer && confirmed) {
      feedbackClass += selectedAnswer === correctAnswer ? " correct" : " incorrect";
      feedbackText = selectedAnswer === correctAnswer
        ? "✓ Você acertou! A resposta correta é " + correctAnswer + "."
        : "✕ Você errou. Você marcou " + selectedAnswer + "; a resposta correta é " + correctAnswer + ".";
    } else if (selectedAnswer && confirmed) {
      feedbackClass += " unavailable";
      feedbackText = "Resposta marcada, mas o gabarito desta questão não foi extraído.";
    } else if (selectedAnswer) {
      feedbackText = "Alternativa " + selectedAnswer + " selecionada. Clique em Responder para confirmar.";
    }
    document.getElementById("question").innerHTML = '<div class="meta">' + meta + '</div><div class="statement">' + body + "</div><div>" + alternatives + '</div><div class="answer-row"><button id="respond"' + (selectedAnswer && !confirmed ? "" : " disabled") + '>Responder</button><div id="feedback" class="' + feedbackClass + '">' + escapeValue(feedbackText) + '</div></div><div class="hint">Clique para selecionar uma alternativa e depois em Responder para confirmar. Dê duplo clique para esmaecer (descartar) ou restaurar uma alternativa.</div>';
    document.getElementById("status").textContent = "Questão " + (index + 1) + " de " + visible.length;
    Array.from(document.querySelectorAll(".option")).forEach(function (button) {
      var clickTimer = null;
      button.addEventListener("click", function () {
        if (clickTimer) clearTimeout(clickTimer);
        clickTimer = setTimeout(function () {
          attempt.answers[question.id] = button.dataset.letter;
          if (attempt.confirmed && attempt.confirmed[question.id] !== button.dataset.letter) delete attempt.confirmed[question.id];
          write();
          render();
        }, 220);
      });
      button.addEventListener("dblclick", function (event) { event.preventDefault(); if (clickTimer) clearTimeout(clickTimer); attempt.eliminated[question.id] = attempt.eliminated[question.id] || {}; if (attempt.eliminated[question.id][button.dataset.letter]) delete attempt.eliminated[question.id][button.dataset.letter]; else attempt.eliminated[question.id][button.dataset.letter] = true; write(); render(); });
    });
    var respond = document.getElementById("respond");
    if (respond) respond.addEventListener("click", function () {
      attempt.confirmed = attempt.confirmed || {};
      attempt.confirmed[question.id] = true;
      write();
      render();
    });
  }
  function resetIndex() { index = 0; render(); }
  function fillFilters() {
    Array.from(new Set(data.questions.map(function (question) { return question.bank; }).filter(Boolean))).sort().forEach(function (value) { document.getElementById("bank").insertAdjacentHTML("beforeend", "<option>" + escapeValue(value) + "</option>"); });
    Array.from(new Set(data.questions.map(function (question) { return question.year; }).filter(Boolean))).sort(function (left, right) { return right - left; }).forEach(function (value) { document.getElementById("year").insertAdjacentHTML("beforeend", "<option>" + escapeValue(value) + "</option>"); });
    Array.from(new Set(data.questions.map(function (question) { return question.vacancy; }).filter(Boolean))).sort().forEach(function (value) { document.getElementById("vacancy").insertAdjacentHTML("beforeend", "<option>" + escapeValue(value) + "</option>"); });
  }
  function ensureVacancyControl() {
    var existing = document.getElementById("vacancy");
    if (existing) return existing;
    var year = document.getElementById("year");
    var controls = year && year.parentElement && year.parentElement.parentElement;
    if (!controls) return null;
    var label = document.createElement("label");
    label.textContent = "Vaga ";
    var select = document.createElement("select");
    select.id = "vacancy";
    select.innerHTML = '<option value="">Todas</option>';
    label.appendChild(select);
    controls.appendChild(label);
    return select;
  }
  state = read();
  ensureVacancyControl();
  document.getElementById("prev").onclick = function () { index = Math.max(0, index - 1); render(); };
  document.getElementById("next").onclick = function () { index = Math.min(visibleQuestions().length - 1, index + 1); render(); };
  document.getElementById("go").onclick = function () { var number = Number(document.getElementById("jump").value); if (number > 0) { index = Math.min(visibleQuestions().length - 1, number - 1); render(); } };
  document.getElementById("bank").onchange = resetIndex;
  document.getElementById("year").onchange = resetIndex;
  document.getElementById("vacancy").onchange = resetIndex;
  document.getElementById("newAttempt").onclick = function () { state.attempts.push({ id: "tentativa-" + (state.attempts.length + 1), createdAt: new Date().toISOString(), answers: {}, eliminated: {} }); state.activeAttempt = state.attempts.length - 1; write(); render(); };
  document.getElementById("saveHtml").onclick = function () { write(); var blob = new Blob([document.documentElement.outerHTML], { type: "text/html;charset=utf-8" }); var url = URL.createObjectURL(blob); var anchor = document.createElement("a"); anchor.href = url; anchor.download = downloadName; anchor.click(); setTimeout(function () { URL.revokeObjectURL(url); }, 60000); };
  fillFilters();
  render();
})();`;
    return [
      "<!doctype html><html lang=\"pt-BR\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>", escapeHtml(entry.title || "Caderno"),
      "</title><style>body{margin:0;background:#f3f4f6;color:#182230;font:16px system-ui,-apple-system,Segoe UI,sans-serif}.top{position:sticky;top:0;z-index:2;background:#102a43;color:#fff;padding:14px 20px;box-shadow:0 2px 8px #0003}.top h1{font-size:18px;margin:0 0 7px}.controls{display:flex;flex-wrap:wrap;gap:8px;align-items:center}.controls button,.controls input,.controls select{border:1px solid #aab8c8;border-radius:7px;padding:7px 9px;font:inherit}.controls button{background:#fff;color:#102a43;cursor:pointer;font-weight:700}.summary{font-size:13px;opacity:.9}.main{max-width:900px;margin:24px auto;padding:0 16px}.card{background:#fff;border-radius:12px;box-shadow:0 3px 14px #0b1f3317;padding:22px}.meta{display:flex;gap:6px;flex-wrap:wrap;color:#52606d;font-size:14px;margin-bottom:14px}.tag{background:#e6f6ff;color:#075985;padding:4px 7px;border-radius:999px}.statement{line-height:1.6}.option{display:block;width:100%;text-align:left;margin:10px 0;padding:12px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;cursor:pointer;font:inherit;transition:background .2s ease,border-color .2s ease,opacity .3s ease,filter .3s ease}.option:hover{border-color:#2563eb}.option.selected{border:2px solid #2563eb;background:#eff6ff}.option.eliminated{opacity:.3;filter:grayscale(.8);background:#f1f5f9}.answer-row{display:flex;align-items:center;gap:12px;margin-top:14px}.answer-row #feedback{margin:0;flex:1}#respond{background:#2563eb;color:#fff;border:0;border-radius:8px;padding:11px 18px;font:700 14px system-ui;cursor:pointer;white-space:nowrap}#respond:hover:not(:disabled){background:#1d4ed8}#respond:disabled{background:#9ca3af;cursor:not-allowed}.hint{margin-top:12px;color:#64748b;font-size:13px}.status{margin-left:auto;font-size:13px}.empty{padding:30px;text-align:center;color:#64748b}</style></head><body><header class=\"top\"><h1 id=\"title\"></h1><div class=\"controls\"><button id=\"prev\">← Anterior</button><button id=\"next\">Próxima →</button><label>Ir para <input id=\"jump\" type=\"number\" min=\"1\" style=\"width:78px\"></label><button id=\"go\">Ir</button><label>Banca <select id=\"bank\"><option value=\"\">Todas</option></select></label><label>Ano <select id=\"year\"><option value=\"\">Todos</option></select></label><button id=\"newAttempt\">Nova tentativa</button><button id=\"saveHtml\">Baixar HTML com histórico</button><span class=\"status\" id=\"status\"></span></div><div class=\"summary\" id=\"summary\"></div></header><main class=\"main\"><article class=\"card\" id=\"question\"></article></main><script id=\"tec-caderno-data\" type=\"application/json\">", jsJson(data), "</script><script id=\"tec-caderno-state\" type=\"application/json\">", jsJson(initial), "</script><script>", runtime, "</script></body></html>"
    ].join("");
  }

  return {
    LIBRARY_KEY: LIBRARY_KEY,
    LIBRARY_ENTRY_PREFIX: LIBRARY_ENTRY_PREFIX,
    stripDataUriImages: stripDataUriImages,
    slimEntryForStorage: slimEntryForStorage,
    safeFilename: safeFilename,
    parseHeader: parseHeader,
    parsePrintedQuestion: parsePrintedQuestion,
    extractPrintedQuestions: extractPrintedQuestions,
    extractPrintedQuestionsAsync: extractPrintedQuestionsAsync,
    cadernoIdFromLocation: cadernoIdFromLocation,
    createLibrary: createLibrary,
    buildCsv: buildCsv,
    buildXlsxBlob: buildXlsxBlob,
    buildInteractiveHtml: buildInteractiveHtml,
    outputBaseName: outputBaseName,
    downloadBlob: downloadBlob
  };
});
