(function (root, factory) {
  var api = factory(root);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) {
    root.TecConcursosModules = root.TecConcursosModules || {};
    root.TecConcursosModules.storage = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  function createStorage(host) {
    var runtime = host || root;
    var hasGet = typeof runtime.GM_getValue === "function";
    var hasSet = typeof runtime.GM_setValue === "function";
    var hasDelete = typeof runtime.GM_deleteValue === "function";
    var usesGM = hasGet || hasSet || hasDelete || typeof runtime.GM_listValues === "function";
    var local = runtime.localStorage;
    var maxWriteChars = 40 * 1024 * 1024;

    function serializedLength(value) {
      try {
        if (value == null) return 0;
        if (typeof value === "string") return value.length;
        if (typeof value === "number" || typeof value === "boolean") return String(value).length;
        return JSON.stringify(value).length;
      } catch (_) {
        return 0;
      }
    }

    function read(key, fallback) {
      if (hasGet) {
        try {
          return runtime.GM_getValue(key, fallback);
        } catch (_) {
          return fallback;
        }
      }
      try {
        var raw = local && local.getItem ? local.getItem(key) : null;
        return raw == null ? fallback : JSON.parse(raw);
      } catch (_) {
        return fallback;
      }
    }

    function write(key, value) {
      if (serializedLength(value) > maxWriteChars) return false;
      if (hasSet) {
        try {
          runtime.GM_setValue(key, value);
          return true;
        } catch (_) {
          return false;
        }
      }
      if (local && local.setItem) {
        try {
          local.setItem(key, JSON.stringify(value));
          return true;
        } catch (_) {
          return false;
        }
      }
      return false;
    }

    function remove(key) {
      if (hasDelete) {
        try {
          runtime.GM_deleteValue(key);
          return;
        } catch (_) {
          return;
        }
      }
      if (local && local.removeItem) {
        try {
          local.removeItem(key);
        } catch (_) {}
      }
    }

    function list() {
      if (typeof runtime.GM_listValues === "function") {
        try {
          return runtime.GM_listValues();
        } catch (_) {}
      }
      var keys = [];
      try {
        if (local && local.length) {
          for (var index = 0; index < local.length; index += 1) {
            keys.push(local.key(index));
          }
        }
      } catch (_) {}
      return keys;
    }

    return { read: read, write: write, remove: remove, list: list, usesGM: usesGM };
  }

  return { createStorage: createStorage };
});
