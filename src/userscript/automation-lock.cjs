(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) {
    root.TecConcursosModules = root.TecConcursosModules || {};
    root.TecConcursosModules.automationLock = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var LOCK_KEY = "tecconcursos_caderno_automation_lock_v1";
  var OWNER_SESSION_KEY = "tecconcursos_caderno_automation_owner_v1";
  var SYNC_CHANNEL_NAME = "tecconcursos_caderno_automation_sync_v1";
  var LOCK_LEASE_MS = 30000;
  var LOCK_HEARTBEAT_MS = 5000;

  function clean(value) {
    return String(value == null ? "" : value).replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  }

  function uniqueId(prefix) {
    var random = Math.random().toString(36).slice(2, 10);
    return String(prefix || "id") + "-" + Date.now().toString(36) + "-" + random;
  }

  function executionOwnerId(rootNode) {
    if (rootNode && rootNode.__tecConcursosAutomationOwnerId) return rootNode.__tecConcursosAutomationOwnerId;
    var session = null;
    try { session = rootNode && rootNode.sessionStorage; } catch (_) {}
    if (session && typeof session.getItem === "function") {
      try {
        var current = session.getItem(OWNER_SESSION_KEY);
        if (current) {
          if (rootNode) rootNode.__tecConcursosAutomationOwnerId = current;
          return current;
        }
        var created = uniqueId("tab");
        session.setItem(OWNER_SESSION_KEY, created);
        if (rootNode) rootNode.__tecConcursosAutomationOwnerId = created;
        return created;
      } catch (_) {}
    }
    var fallback = uniqueId("tab");
    if (rootNode) rootNode.__tecConcursosAutomationOwnerId = fallback;
    return fallback;
  }

  function claimKey(lock) {
    if (!lock || typeof lock !== "object") return "";
    if (lock.claimId) return String(lock.claimId);
    return String(lock.acquiredAt || 0) + "|" + String(lock.ownerId || "") + "|" + String(lock.runId || "");
  }

  function compareClaims(left, right) {
    var leftKey = claimKey(left);
    var rightKey = claimKey(right);
    if (leftKey === rightKey) return 0;
    return leftKey > rightKey ? 1 : -1;
  }

  function sameClaim(left, right) {
    return Boolean(left && right && left.ownerId === right.ownerId && left.runId === right.runId && claimKey(left) === claimKey(right));
  }

  function parseLock(value) {
    if (!value) return null;
    if (typeof value === "object") return value;
    try {
      var parsed = JSON.parse(String(value));
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch (_) {
      return null;
    }
  }

  function createLockManager(options) {
    var config = options || {};
    var rootNode = config.root;
    var storage = config.storage;
    var readState = typeof config.readState === "function" ? config.readState : function () { return null; };
    var ownerId = clean(config.ownerId || executionOwnerId(rootNode));
    var heartbeatTimer = null;
    var channel = null;
    var remoteConflict = null;
    var localClaim = null;

    function broadcast(message) {
      if (!channel || typeof channel.postMessage !== "function") return;
      try {
        channel.postMessage(Object.assign({ version: 1, source: ownerId, sentAt: Date.now() }, message || {}));
      } catch (_) {}
    }

    function readLock() {
      var lock = storage.read(LOCK_KEY, null);
      return lock && typeof lock === "object" ? lock : null;
    }

    function lockIsActive(lock, now) {
      return Boolean(lock && Number(lock.expiresAt) > (Number(now) || Date.now()));
    }

    function claimWasLost(lock) {
      return Boolean(lock && remoteConflict && lockIsActive(remoteConflict) && remoteConflict.ownerId !== ownerId && compareClaims(remoteConflict, lock) > 0);
    }

    function ownsLock(lock, state) {
      return Boolean(lock && state && lock.ownerId === ownerId && lock.runId === state.runId && lockIsActive(lock) && !claimWasLost(lock));
    }

    function effectiveLock(lock) {
      var current = lock || readLock();
      if (remoteConflict && lockIsActive(remoteConflict) && (!current || compareClaims(remoteConflict, current) >= 0 || current.ownerId === ownerId && claimWasLost(current))) return remoteConflict;
      return current;
    }

    function lockStatus(lock) {
      var current = effectiveLock(lock);
      if (!current || !lockIsActive(current)) return "";
      return "Outra aba está executando esta automação (aba " + String(current.ownerId || "desconhecida") + ").";
    }

    function lockError(lock) {
      var error = new Error(lockStatus(lock) || "A automação não possui uma aba proprietária ativa.");
      error.code = "AUTOMATION_LOCKED";
      error.lock = lock || null;
      return error;
    }

    function reconcileRemoteLock(remoteLock) {
      if (!remoteLock || remoteLock.ownerId === ownerId || !lockIsActive(remoteLock)) return;
      var current = readLock();
      var local = current && current.ownerId === ownerId ? current : localClaim;
      if (local && local.ownerId === ownerId && compareClaims(local, remoteLock) > 0) {
        remoteConflict = null;
        if (!sameClaim(current, local)) {
          storage.write(LOCK_KEY, local);
          broadcast({ type: "lock-reassert", lock: local });
        }
        return;
      }
      remoteConflict = remoteLock;
      stopHeartbeat();
    }

    function handleSyncMessage(event) {
      var message = event && event.data ? event.data : event;
      if (!message || message.source === ownerId) return;
      if (message.type === "lock-claim" || message.type === "lock-renew" || message.type === "lock-reassert") {
        reconcileRemoteLock(parseLock(message.lock));
      } else if (message.type === "lock-release" && remoteConflict && sameClaim(remoteConflict, parseLock(message.lock))) {
        remoteConflict = null;
      }
    }

    function handleStorageEvent(event) {
      if (!event || event.key !== LOCK_KEY) return;
      if (!event.newValue) {
        remoteConflict = null;
        return;
      }
      reconcileRemoteLock(parseLock(event.newValue));
    }

    function startSynchronization() {
      if (rootNode && typeof rootNode.addEventListener === "function") {
        try { rootNode.addEventListener("storage", handleStorageEvent); } catch (_) {}
      }
      var BroadcastChannelCtor = rootNode && rootNode.BroadcastChannel;
      if (typeof BroadcastChannelCtor !== "function") return;
      try {
        channel = new BroadcastChannelCtor(SYNC_CHANNEL_NAME);
        if (typeof channel.addEventListener === "function") channel.addEventListener("message", handleSyncMessage);
        else channel.onmessage = handleSyncMessage;
      } catch (_) {
        channel = null;
      }
    }

    function stopSynchronization() {
      if (rootNode && typeof rootNode.removeEventListener === "function") {
        try { rootNode.removeEventListener("storage", handleStorageEvent); } catch (_) {}
      }
      if (channel && typeof channel.close === "function") {
        try { channel.close(); } catch (_) {}
      }
      channel = null;
    }

    function stopHeartbeat() {
      if (heartbeatTimer != null) {
        var clear = rootNode && rootNode.clearInterval || (typeof clearInterval === "function" ? clearInterval : null);
        if (clear) clear(heartbeatTimer);
        heartbeatTimer = null;
      }
    }

    function renewLease(state) {
      if (!state || !state.runId) return true;
      var current = readLock();
      if (!ownsLock(current, state)) return false;
      var now = Date.now();
      var next = Object.assign({}, current, {
        ownerId: ownerId,
        runId: state.runId,
        heartbeatAt: now,
        expiresAt: now + LOCK_LEASE_MS,
        href: String(rootNode && rootNode.location && rootNode.location.href || "")
      });
      storage.write(LOCK_KEY, next);
      localClaim = next;
      broadcast({ type: "lock-renew", lock: next });
      var confirmed = readLock();
      if (!ownsLock(confirmed, state)) return false;
      state.lockOwnerId = ownerId;
      state.leaseExpiresAt = Number(confirmed.expiresAt) || next.expiresAt;
      return true;
    }

    function startHeartbeat(state) {
      if (heartbeatTimer != null) return;
      var set = rootNode && rootNode.setInterval || (typeof setInterval === "function" ? setInterval : null);
      if (!set) return;
      heartbeatTimer = set(function () {
        var current = readState();
        if (!current.running || !current.runId || current.runId !== state.runId || !renewLease(current)) stopHeartbeat();
      }, LOCK_HEARTBEAT_MS);
      if (heartbeatTimer && typeof heartbeatTimer.unref === "function") heartbeatTimer.unref();
    }

    function acquireLease(state, force) {
      if (!state || typeof state !== "object") throw new Error("Não há estado de automação para assumir.");
      if (!state.runId) state.runId = uniqueId("run");
      var current = readLock();
      if (!force && lockIsActive(current) && current.ownerId !== ownerId) return { acquired: false, lock: current };
      if (!force && remoteConflict && lockIsActive(remoteConflict) && remoteConflict.ownerId !== ownerId) return { acquired: false, lock: remoteConflict };
      var now = Date.now();
      var candidate = {
        version: 1,
        claimId: uniqueId("claim"),
        ownerId: ownerId,
        runId: state.runId,
        acquiredAt: current && current.ownerId === ownerId ? Number(current.acquiredAt) || now : now,
        heartbeatAt: now,
        expiresAt: now + LOCK_LEASE_MS,
        href: String(rootNode && rootNode.location && rootNode.location.href || "")
      };
      localClaim = candidate;
      remoteConflict = null;
      storage.write(LOCK_KEY, candidate);
      broadcast({ type: "lock-claim", lock: candidate });
      var confirmed = readLock();
      if (!confirmed || confirmed.ownerId !== ownerId || confirmed.runId !== state.runId || !lockIsActive(confirmed) || claimWasLost(candidate)) {
        return { acquired: false, lock: confirmed || current };
      }
      state.ownerId = ownerId;
      state.lockOwnerId = ownerId;
      state.leaseExpiresAt = Number(confirmed.expiresAt) || candidate.expiresAt;
      startHeartbeat(state);
      return { acquired: true, lock: confirmed };
    }

    function ensureLease(state) {
      if (!state || !state.runId) return true;
      if (renewLease(state)) return true;
      var acquired = acquireLease(state, false);
      if (acquired.acquired) return true;
      throw lockError(acquired.lock);
    }

    function releaseLease(state) {
      stopHeartbeat();
      var current = readLock();
      if (!state || !ownsLock(current, state)) return false;
      if (typeof storage.remove === "function") storage.remove(LOCK_KEY);
      else storage.write(LOCK_KEY, Object.assign({}, current, { expiresAt: 0, releasedAt: Date.now() }));
      broadcast({ type: "lock-release", lock: current });
      localClaim = null;
      remoteConflict = null;
      return true;
    }

    function lockInfo(state) {
      var lock = effectiveLock(readLock());
      return {
        key: LOCK_KEY,
        ownerId: ownerId,
        ownsLock: ownsLock(lock, state),
        active: lockIsActive(lock),
        lockedByOtherTab: Boolean(lockIsActive(lock) && lock.ownerId !== ownerId),
        runId: lock && lock.runId || null,
        lockOwnerId: lock && lock.ownerId || null,
        acquiredAt: lock && lock.acquiredAt || null,
        heartbeatAt: lock && lock.heartbeatAt || null,
        expiresAt: lock && lock.expiresAt || null,
        href: lock && lock.href || null
      };
    }

    startSynchronization();

    return {
      ownerId: ownerId,
      createRunId: function () { return uniqueId("run"); },
      readLock: readLock,
      ownsLock: ownsLock,
      lockStatus: lockStatus,
      lockError: lockError,
      acquireLease: acquireLease,
      ensureLease: ensureLease,
      releaseLease: releaseLease,
      lockInfo: lockInfo,
      stopHeartbeat: stopHeartbeat,
      destroy: function () { stopHeartbeat(); stopSynchronization(); }
    };
  }

  return {
    LOCK_KEY: LOCK_KEY,
    OWNER_SESSION_KEY: OWNER_SESSION_KEY,
    SYNC_CHANNEL_NAME: SYNC_CHANNEL_NAME,
    LOCK_LEASE_MS: LOCK_LEASE_MS,
    LOCK_HEARTBEAT_MS: LOCK_HEARTBEAT_MS,
    executionOwnerId: executionOwnerId,
    createLockManager: createLockManager
  };
});
