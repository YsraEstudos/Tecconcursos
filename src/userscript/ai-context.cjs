(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) {
    root.TecConcursosModules = root.TecConcursosModules || {};
    root.TecConcursosModules.aiContext = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var embeddedContent = "__TEC_AI_CONTEXT__";
  var content = embeddedContent;
  if (embeddedContent === "__TEC_AI_CONTEXT__" && typeof module !== "undefined" && module.exports) {
    try {
      content = require("node:fs").readFileSync(require("node:path").join(__dirname, "AI_CONTEXT.md"), "utf8");
    } catch (_) {}
  }

  return {
    getText: function () { return content; }
  };
});
