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
    var local = runtime.localStorage;

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

    return { read: read, write: write, remove: remove };
  }

  return { createStorage: createStorage };
});
