(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) {
    root.TecConcursosModules = root.TecConcursosModules || {};
    root.TecConcursosModules.timing = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function randomInt(min, max, random) {
    var lower = Math.ceil(Number(min) || 0);
    var upper = Math.floor(Number(max) || 0);
    if (upper < lower) {
      var swap = lower;
      lower = upper;
      upper = swap;
    }
    if (upper === lower) return lower;
    var source = typeof random === "function" ? random : Math.random;
    var value = Number(source());
    if (!Number.isFinite(value)) value = 0;
    value = Math.max(0, Math.min(0.999999999, value));
    return Math.floor(value * (upper - lower + 1)) + lower;
  }

  function sleep(ms, isCancelled) {
    var duration = Math.max(0, Math.floor(Number(ms) || 0));
    var cancelled = typeof isCancelled === "function" ? isCancelled : function () { return false; };
    if (!duration || cancelled()) return Promise.resolve(!cancelled());

    return new Promise(function (resolve) {
      var timer = setTimeout(function () {
        clearInterval(cancelTimer);
        resolve(true);
      }, duration);
      var cancelTimer = setInterval(function () {
        if (cancelled()) {
          clearInterval(cancelTimer);
          clearTimeout(timer);
          resolve(false);
        }
      }, 500);
    });
  }

  return { randomInt: randomInt, sleep: sleep };
});
