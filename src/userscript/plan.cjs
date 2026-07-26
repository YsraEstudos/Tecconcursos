(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) {
    root.TecConcursosModules = root.TecConcursosModules || {};
    root.TecConcursosModules.plan = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var DEFAULT_BANKS = [
    "FCC", "Fundatec", "Vunesp", "Cesgranrio", "FGV", "Legalle",
    "Fundação La Salle", "Instituto AOCP", "Objetiva"
  ];
  var DEFAULT_YEARS = [2023, 2020, 2022, 2018, 2025, 2021, 2017, 2024, 2019, 2026, 2016];

  function text(value) {
    return String(value == null ? "" : value).replace(/\u00a0/g, " ").trim();
  }

  function unique(values) {
    return (Array.isArray(values) ? values : []).filter(function (value, index, list) {
      return value !== "" && value != null && list.indexOf(value) === index;
    });
  }

  function normalizeMatter(item, group) {
    var source = item || {};
    var subjects = Array.isArray(source.subjects) ? source.subjects : [];
    var ids = unique((source.subjectIds || []).concat(subjects.map(function (subject) {
      return subject && subject.id != null ? String(subject.id) : "";
    })).map(String));
    var paths = unique((source.subjectPaths || []).concat(subjects.map(function (subject) {
      return subject && subject.path ? subject.path : "";
    })).map(text));
    return {
      code: text(source.code),
      title: text(source.title),
      group: text(source.group || group || "Sem grupo"),
      subjectIds: ids,
      subjectPaths: paths
    };
  }

  function normalizePlan(value) {
    var source = value || {};
    var matters = (Array.isArray(source.matters) ? source.matters : []).map(function (matter) {
      return normalizeMatter(matter, matter && matter.group);
    }).filter(function (matter) {
      return matter.code && matter.title;
    });
    return {
      version: 1,
      name: text(source.name || "Plano TecConcursos"),
      banks: unique((source.banks || DEFAULT_BANKS).map(text)),
      years: unique((source.years || DEFAULT_YEARS).map(function (year) { return Number(year); })).filter(function (year) {
        return Number.isFinite(year) && year >= 1900 && year <= 2100;
      }),
      removeCancelled: source.removeCancelled !== false,
      removeOutdated: source.removeOutdated !== false,
      matters: matters
    };
  }

  function parseConsolidatedMarkdown(markdown) {
    var currentGroup = "Sem grupo";
    var currentMatter = null;
    var matters = [];
    String(markdown || "").replace(/\r/g, "").split("\n").forEach(function (line) {
      var clean = text(line);
      var groupMatch = clean.match(/^(?:#{1,6}\s*)?(\d+\.\s+.+|Práticas complementares)$/i);
      if (groupMatch && !/^MAT-|^PRAT-/i.test(clean)) {
        currentGroup = clean.replace(/^#{1,6}\s*/, "");
        return;
      }
      var matterMatch = clean.match(/^(MAT-\d{3}|PRAT-\d{2})\s*[—–-]\s*(.+)$/i);
      if (matterMatch) {
        currentMatter = {
          code: matterMatch[1].toUpperCase(),
          title: text(matterMatch[2]),
          group: currentGroup,
          subjectIds: [],
          subjectPaths: []
        };
        matters.push(currentMatter);
        return;
      }
      var subjectMatch = clean.match(/^TecConcursos:\s*(\d+)\s*[—–-]\s*(.+)$/i);
      if (subjectMatch && currentMatter) {
        currentMatter.subjectIds.push(subjectMatch[1]);
        currentMatter.subjectPaths.push(text(subjectMatch[2]));
      }
    });
    return normalizePlan({ matters: matters });
  }

  function parsePlanText(value) {
    var raw = text(value);
    if (!raw) return normalizePlan({});
    if (/^[\[{]/.test(raw)) {
      try {
        return normalizePlan(JSON.parse(raw));
      } catch (error) {
        throw new Error("O JSON do plano não é válido: " + error.message);
      }
    }
    var plan = parseConsolidatedMarkdown(raw);
    if (!plan.matters.length) {
      throw new Error("Não encontrei códigos MAT-xxx ou PRAT-xx no arquivo do plano.");
    }
    return plan;
  }

  function displayName(matter) {
    var item = normalizeMatter(matter);
    return item.code + " — " + item.title;
  }

  function lastPathSegment(path) {
    var parts = text(path).split(">").map(text).filter(Boolean);
    return parts.length ? parts[parts.length - 1] : "";
  }

  return {
    DEFAULT_BANKS: DEFAULT_BANKS,
    DEFAULT_YEARS: DEFAULT_YEARS,
    normalizePlan: normalizePlan,
    parseConsolidatedMarkdown: parseConsolidatedMarkdown,
    parsePlanText: parsePlanText,
    normalizeMatter: normalizeMatter,
    displayName: displayName,
    lastPathSegment: lastPathSegment
  };
});
