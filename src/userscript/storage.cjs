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
    // Incident fix from commits 162ed2c-10f8943: Chromium extension messages are
    // capped at 64 MiB. Keep an 8 MiB margin for the Tampermonkey bridge, JSON
    // encoding and message envelope overhead. Revisit only if the bridge limit
    // changes and the aggregate-storage regression tests are updated.
    var gmMessageLimitBytes = 64 * 1024 * 1024;
    var gmTotalSafetyMarginBytes = 8 * 1024 * 1024;
    var maxWriteBytes = hasSet ? 8 * 1024 * 1024 : 40 * 1024 * 1024;
    var maxTotalBytes = hasSet ? gmMessageLimitBytes - gmTotalSafetyMarginBytes : Number.MAX_SAFE_INTEGER;
    var retiredGmKeys = {
      "tecconcursos_caderno_automation_v1": true,
      "tecconcursos_export_library_v1": true
    };

    function serializedByteLength(value) {
      try {
        if (value == null) return 0;
        var serialized = typeof value === "string" || typeof value === "number" || typeof value === "boolean"
          ? String(value)
          : JSON.stringify(value);
        if (serialized == null) return 0;
        if (typeof TextEncoder === "function") return new TextEncoder().encode(serialized).byteLength;
        return unescape(encodeURIComponent(serialized)).length;
      } catch (_) {
        return Number.MAX_SAFE_INTEGER;
      }
    }

    function storageEntryByteLength(key, value) {
      var valueBytes = serializedByteLength(value);
      var keyBytes = serializedByteLength(String(key));
      if (valueBytes >= Number.MAX_SAFE_INTEGER || keyBytes >= Number.MAX_SAFE_INTEGER) return Number.MAX_SAFE_INTEGER;
      return valueBytes + keyBytes;
    }

    function listGmKeys() {
      if (typeof runtime.GM_listValues !== "function") return null;
      try {
        var keys = runtime.GM_listValues();
        return Array.isArray(keys) ? keys : null;
      } catch (_) {
        return null;
      }
    }

    function purgeRetiredGmKeys() {
      if (!hasDelete) return;
      var keys = listGmKeys();
      if (!keys) return;
      keys.forEach(function (key) {
        if (!retiredGmKeys[String(key)]) return;
        try { runtime.GM_deleteValue(key); } catch (_) {}
      });
    }

    function currentGmUsageBytes(replacingKey) {
      if (!hasGet || !hasSet) return null;
      var keys = listGmKeys();
      if (!keys) return null;
      var targetKey = String(replacingKey);
      var total = 0;
      for (var index = 0; index < keys.length; index += 1) {
        var key = String(keys[index]);
        if (key === targetKey) continue;
        if (retiredGmKeys[key]) return maxTotalBytes + 1;
        var value;
        try {
          value = runtime.GM_getValue(key, null);
        } catch (_) {
          return null;
        }
        var entryBytes = storageEntryByteLength(key, value);
        if (entryBytes >= Number.MAX_SAFE_INTEGER || total > maxTotalBytes - entryBytes) return maxTotalBytes + 1;
        total += entryBytes;
      }
      return total;
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
      if (serializedByteLength(value) > maxWriteBytes) return false;
      if (hasSet) {
        var currentBytes = currentGmUsageBytes(key);
        var nextBytes = storageEntryByteLength(key, value);
        if (currentBytes == null || nextBytes >= Number.MAX_SAFE_INTEGER || currentBytes > maxTotalBytes - nextBytes) return false;
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

    purgeRetiredGmKeys();

    return {
      read: read,
      write: write,
      remove: remove,
      list: list,
      usesGM: usesGM
    };
  }

  return { createStorage: createStorage };
});
