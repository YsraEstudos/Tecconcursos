(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) {
    root.TecConcursosModules = root.TecConcursosModules || {};
    root.TecConcursosModules.printBlocker = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var OUTPUT_PATH = /\/questoes\/cadernos\/\d+\/imprimir(?:\/|$)/i;
  var IMAGE_PLACEHOLDER = "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";
  var PRINT_TARGETS = [];
  var GUARD_RECORDS = [];
  var PROTOTYPE_PATCHES = [];
  var BRIDGE_DOCUMENTS = [];
  var IMAGE_GUARD_RECORDS = [];

  function locationBase(target) {
    var location = target && target.location;
    if (location && location.href) return String(location.href);
    return "https://www.tecconcursos.com.br" + String(location && location.pathname || "/");
  }

  function routePath(value, target) {
    if (value == null || value === "") return "";
    try {
      return new URL(String(value), locationBase(target)).pathname;
    } catch (_) {
      return String(value).split(/[?#]/)[0];
    }
  }

  function isPrintRoute(value, target) {
    return OUTPUT_PATH.test(routePath(value, target));
  }

  function imageSource(value, target) {
    var raw = String(value == null ? "" : value).trim();
    if (!raw || raw === IMAGE_PLACEHOLDER) return "";
    try { return new URL(raw, locationBase(target)).href; } catch (_) { return raw; }
  }

  function deferImageLoading(image, target) {
    if (!image || typeof image.getAttribute !== "function" || typeof image.setAttribute !== "function") return false;
    if (image.getAttribute("data-tec-image-deferred") === "1") return false;
    var source = image.getAttribute("data-tec-original-src") || image.getAttribute("src") || image.getAttribute("data-src") || "";
    var sourceSet = image.getAttribute("data-tec-original-srcset") || image.getAttribute("srcset") || "";
    if (!source && !sourceSet) return false;
    if (source) image.setAttribute("data-tec-original-src", imageSource(source, target));
    if (sourceSet) {
      image.setAttribute("data-tec-original-srcset", sourceSet);
      if (typeof image.removeAttribute === "function") image.removeAttribute("srcset");
    }
    image.setAttribute("loading", "lazy");
    image.setAttribute("decoding", "async");
    if (source && source !== IMAGE_PLACEHOLDER) image.setAttribute("src", IMAGE_PLACEHOLDER);
    image.setAttribute("data-tec-image-deferred", "1");
    return true;
  }

  function installImageGuard(target, documentNode) {
    if (!documentNode) return false;
    var existing = IMAGE_GUARD_RECORDS.find(function (item) { return item.target === target && item.document === documentNode; });
    if (existing) return true;
    var scan = function (rootNode) {
      if (!rootNode) return;
      if (String(rootNode.tagName || "").toUpperCase() === "IMG") deferImageLoading(rootNode, target);
      if (typeof rootNode.querySelectorAll === "function") Array.from(rootNode.querySelectorAll("img")).forEach(function (image) { deferImageLoading(image, target); });
    };
    scan(documentNode);
    var Observer = target && target.MutationObserver;
    if (!Observer && documentNode.defaultView) Observer = documentNode.defaultView.MutationObserver;
    var observer = null;
    if (typeof Observer === "function") {
      try {
        observer = new Observer(function (mutations) {
          mutations.forEach(function (mutation) {
            Array.from(mutation.addedNodes || []).forEach(scan);
          });
        });
        observer.observe(documentNode.documentElement || documentNode, { childList: true, subtree: true });
      } catch (_) { observer = null; }
    }
    IMAGE_GUARD_RECORDS.push({ target: target, document: documentNode, observer: observer });
    return true;
  }

  function formAction(form) {
    if (!form) return "";
    if (typeof form.getAttribute === "function") {
      var attribute = form.getAttribute("action");
      if (attribute) return attribute;
    }
    return form.action || "";
  }

  function isPrintForm(form, target) {
    return isPrintRoute(formAction(form), target);
  }

  function installPrintBlock(target) {
    if (!target) return false;
    if (PRINT_TARGETS.indexOf(target) >= 0) return true;
    var blocked = function () { return undefined; };
    try {
      Object.defineProperty(target, "print", {
        configurable: false,
        enumerable: true,
        get: function () { return blocked; },
        set: function () {}
      });
      PRINT_TARGETS.push(target);
      return true;
    } catch (_) {
      try {
        target.print = blocked;
        if (target.print !== blocked) return false;
        PRINT_TARGETS.push(target);
        return true;
      } catch (_) {
        return false;
      }
    }
  }

  function replaceFunction(target, name, replacement) {
    if (!target || typeof target[name] !== "function") return false;
    var descriptor;
    try { descriptor = Object.getOwnPropertyDescriptor(target, name); } catch (_) {}
    try {
      if (descriptor) {
        Object.defineProperty(target, name, Object.assign({}, descriptor, { value: replacement }));
      } else {
        target[name] = replacement;
      }
      return target[name] === replacement;
    } catch (_) {
      try {
        target[name] = replacement;
        return target[name] === replacement;
      } catch (_) {
        return false;
      }
    }
  }

  function patchFormMethod(target, methodName, windowLike) {
    var constructor = target && target.HTMLFormElement;
    var prototype = constructor && constructor.prototype;
    if (!prototype || typeof prototype[methodName] !== "function") return false;
    if (PROTOTYPE_PATCHES.some(function (item) { return item.prototype === prototype && item.method === methodName; })) return true;
    var original = prototype[methodName];
    var replacement = function () {
      if (isPrintForm(this, windowLike)) return undefined;
      return original.apply(this, arguments);
    };
    if (!replaceFunction(prototype, methodName, replacement)) return false;
    PROTOTYPE_PATCHES.push({ prototype: prototype, method: methodName });
    return true;
  }

  function elementFromEvent(event) {
    var node = event && event.target;
    if (!node) return null;
    if (typeof node.closest === "function") {
      return node.closest("a,button,input,form") || node;
    }
    return node;
  }

  function formFromElement(node) {
    if (!node) return null;
    if (String(node.tagName || "").toUpperCase() === "FORM") return node;
    if (node.form) return node.form;
    var current = node.parentNode;
    while (current) {
      if (String(current.tagName || "").toUpperCase() === "FORM") return current;
      current = current.parentNode;
    }
    return null;
  }

  function eventTargetsPrint(event, windowLike, eventType) {
    var node = elementFromEvent(event);
    if (!node) return false;
    if (String(node.tagName || "").toUpperCase() === "FORM") return isPrintForm(node, windowLike);
    if (isPrintRoute(node.href || (typeof node.getAttribute === "function" && node.getAttribute("href")), windowLike)) return true;
    var explicitFormAction = typeof node.getAttribute === "function" ? node.getAttribute("formaction") : "";
    if (explicitFormAction && isPrintRoute(explicitFormAction, windowLike)) return true;
    var form = formFromElement(node);
    if (eventType === "submit") return isPrintForm(form || node, windowLike);
    if (eventType === "click" && form && isPrintForm(form, windowLike)) {
      var tagName = String(node.tagName || "").toUpperCase();
      var type = String(node.type || "").toLowerCase();
      return tagName === "BUTTON" || tagName === "INPUT" || type === "submit";
    }
    return false;
  }

  function cancelEvent(event) {
    if (!event) return;
    if (typeof event.preventDefault === "function") event.preventDefault();
    if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
    if (typeof event.stopPropagation === "function") event.stopPropagation();
  }

  function installDomGuards(target, documentNode) {
    if (!documentNode || typeof documentNode.addEventListener !== "function") return false;
    var record = GUARD_RECORDS.find(function (item) { return item.target === target && item.document === documentNode; });
    if (record) return true;
    var clickHandler = function (event) {
      if (eventTargetsPrint(event, target, "click")) cancelEvent(event);
    };
    var submitHandler = function (event) {
      if (eventTargetsPrint(event, target, "submit")) cancelEvent(event);
    };
    documentNode.addEventListener("click", clickHandler, true);
    documentNode.addEventListener("submit", submitHandler, true);
    GUARD_RECORDS.push({ target: target, document: documentNode, click: clickHandler, submit: submitHandler });
    return true;
  }

  function installOpenGuard(target) {
    if (!target || typeof target.open !== "function") return false;
    var record = GUARD_RECORDS.find(function (item) { return item.target === target && item.open; });
    if (record) return true;
    var original = target.open;
    var replacement = function (url) {
      if (isPrintRoute(url, target)) return null;
      return original.apply(this, arguments);
    };
    if (!replaceFunction(target, "open", replacement)) return false;
    GUARD_RECORDS.push({ target: target, open: replacement });
    return true;
  }

  function installPrintGuards(target, documentNode) {
    if (!target) return false;
    installPrintBlock(target);
    installOpenGuard(target);
    patchFormMethod(target, "submit", target);
    patchFormMethod(target, "requestSubmit", target);
    installDomGuards(target, documentNode);
    return true;
  }

  function pageWorldSource() {
    return String.raw`(function(){if(window.__tecConcursosPrintGuard)return;var route=/\/questoes\/cadernos\/\d+\/imprimir(?:\/|$)/i.test(String(location&&location.pathname||''));if(!route)return;var placeholder='${IMAGE_PLACEHOLDER}';var isPrint=function(value){if(value==null||value==='')return false;try{return /\/questoes\/cadernos\/\d+\/imprimir(?:\/|$)/i.test(new URL(String(value),location.href).pathname);}catch(_){return /\/questoes\/cadernos\/\d+\/imprimir/i.test(String(value));}};var defer=function(image){if(!image||!image.getAttribute||!image.setAttribute||image.getAttribute('data-tec-image-deferred')==='1')return;var source=image.getAttribute('data-tec-original-src')||image.getAttribute('src')||image.getAttribute('data-src')||'';var sourceSet=image.getAttribute('data-tec-original-srcset')||image.getAttribute('srcset')||'';if(!source&&!sourceSet)return;if(source&&source!==placeholder)image.setAttribute('data-tec-original-src',source);if(sourceSet){image.setAttribute('data-tec-original-srcset',sourceSet);image.removeAttribute&&image.removeAttribute('srcset');}image.setAttribute('loading','lazy');image.setAttribute('decoding','async');if(source&&source!==placeholder)image.setAttribute('src',placeholder);image.setAttribute('data-tec-image-deferred','1');};var scan=function(node){if(!node)return;if(String(node.tagName||'').toUpperCase()==='IMG')defer(node);if(node.querySelectorAll)Array.prototype.forEach.call(node.querySelectorAll('img'),defer);};scan(document);var Observer=window.MutationObserver;if(typeof Observer==='function'&&!window.__tecConcursosImageObserver){try{var observer=new Observer(function(mutations){mutations.forEach(function(mutation){Array.prototype.forEach.call(mutation.addedNodes||[],scan);});});observer.observe(document.documentElement||document,{childList:true,subtree:true});window.__tecConcursosImageObserver=observer;}catch(_){}}var imageProto=window.HTMLImageElement&&window.HTMLImageElement.prototype;var srcDescriptor=imageProto&&Object.getOwnPropertyDescriptor(imageProto,'src');if(srcDescriptor&&srcDescriptor.set){try{Object.defineProperty(imageProto,'src',{configurable:srcDescriptor.configurable,enumerable:srcDescriptor.enumerable,get:srcDescriptor.get,set:function(value){var source=String(value==null?'':value);if(source&&source!==placeholder){this.setAttribute('data-tec-original-src',source);this.setAttribute('loading','lazy');this.setAttribute('decoding','async');this.setAttribute('data-tec-image-deferred','1');return srcDescriptor.set.call(this,placeholder);}return srcDescriptor.set.call(this,value);}});}catch(_){}}var blocked=function(){return undefined;};try{Object.defineProperty(window,'print',{configurable:false,enumerable:true,get:function(){return blocked;},set:function(){}});}catch(_){try{window.print=blocked;}catch(__){}}var originalOpen=window.open;if(typeof originalOpen==='function'){try{Object.defineProperty(window,'open',{configurable:true,writable:true,value:function(url){if(isPrint(url))return null;return originalOpen.apply(this,arguments);}});}catch(_){}}var proto=window.HTMLFormElement&&window.HTMLFormElement.prototype;['submit','requestSubmit'].forEach(function(name){if(!proto||typeof proto[name]!=='function')return;var original=proto[name];try{Object.defineProperty(proto,name,{configurable:true,writable:true,value:function(){var action=this.getAttribute&&this.getAttribute('action')||this.action||'';if(isPrint(action))return undefined;return original.apply(this,arguments);}});}catch(_){}});var cancel=function(event){var node=event&&event.target;var form=node&&(node.form||node);var action=form&&(form.getAttribute&&form.getAttribute('action')||form.action||'');var href=node&&(node.href||(node.getAttribute&&node.getAttribute('href')));if(isPrint(action)||isPrint(href)){event.preventDefault&&event.preventDefault();event.stopImmediatePropagation&&event.stopImmediatePropagation();event.stopPropagation&&event.stopPropagation();}};document.addEventListener('click',cancel,true);document.addEventListener('submit',cancel,true);try{Object.defineProperty(window,'__tecConcursosPrintGuard',{configurable:false,value:true});}catch(_){window.__tecConcursosPrintGuard=true;}})();`;
  }

  function installPageWorldBridge(documentNode, options) {
    if (!documentNode) return false;
    if (BRIDGE_DOCUMENTS.indexOf(documentNode) >= 0) return true;
    var source = pageWorldSource();
    var addElement = options && options.addElement;
    if (typeof addElement === "function") {
      try {
        var added = addElement("script", { textContent: source });
        if (added && typeof added.remove === "function") added.remove();
        if (added) BRIDGE_DOCUMENTS.push(documentNode);
        return Boolean(added);
      } catch (_) {}
    }
    if (typeof documentNode.createElement !== "function") return false;
    var parent = documentNode.documentElement || documentNode.head || documentNode.body;
    if (!parent || typeof parent.appendChild !== "function") return false;
    try {
      var bridge = documentNode.createElement("script");
      bridge.textContent = source;
      parent.appendChild(bridge);
      if (typeof bridge.remove === "function") bridge.remove();
      BRIDGE_DOCUMENTS.push(documentNode);
      return true;
    } catch (_) {
      return false;
    }
  }

  function suppressNativePrintOnOutputPage(rootNode, options) {
    var path = String(rootNode && rootNode.location && rootNode.location.pathname || "");
    if (!OUTPUT_PATH.test(path)) return false;
    var config = options || {};
    if (config.enabled === false) return true;
    var pageWindow = config.pageWindow || (typeof unsafeWindow !== "undefined" ? unsafeWindow : rootNode);
    installPrintGuards(pageWindow, rootNode && rootNode.document);
    installImageGuard(pageWindow, rootNode && rootNode.document);
    var addElement = config.addElement;
    if (typeof addElement !== "function") {
      try { addElement = typeof GM_addElement === "function" ? GM_addElement : null; } catch (_) { addElement = null; }
    }
    installPageWorldBridge(rootNode && rootNode.document, { addElement: addElement });
    return true;
  }

  return {
    OUTPUT_PATH: OUTPUT_PATH,
    installPrintBlock: installPrintBlock,
    installPrintGuards: installPrintGuards,
    installPageWorldBridge: installPageWorldBridge,
    installImageGuard: installImageGuard,
    deferImageLoading: deferImageLoading,
    IMAGE_PLACEHOLDER: IMAGE_PLACEHOLDER,
    isPrintRoute: isPrintRoute,
    suppressNativePrintOnOutputPage: suppressNativePrintOnOutputPage
  };
});
