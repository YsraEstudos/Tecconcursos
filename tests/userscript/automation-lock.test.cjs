const test = require("node:test");
const assert = require("node:assert/strict");
const lockModule = require("../../src/userscript/automation-lock.cjs");

function storageStub(initial) {
  const values = new Map(Object.entries(initial || {}));
  return {
    read(key, fallback) { return values.has(key) ? values.get(key) : fallback; },
    write(key, value) { values.set(key, value); },
    remove(key) { values.delete(key); },
    values
  };
}

function rootWithOwner(ownerId, BroadcastChannelCtor) {
  const session = new Map([[lockModule.OWNER_SESSION_KEY, ownerId]]);
  const listeners = new Map();
  return {
    location: { href: "https://www.tecconcursos.com.br/questoes/filtrar?idPasta=1" },
    BroadcastChannel: BroadcastChannelCtor,
    addEventListener(type, listener) {
      const current = listeners.get(type) || [];
      current.push(listener);
      listeners.set(type, current);
    },
    removeEventListener(type, listener) {
      listeners.set(type, (listeners.get(type) || []).filter(item => item !== listener));
    },
    dispatchStorage(event) {
      for (const listener of listeners.get("storage") || []) listener(event);
    },
    sessionStorage: {
      getItem(key) { return session.has(key) ? session.get(key) : null; },
      setItem(key, value) { session.set(key, String(value)); }
    }
  };
}

function broadcastChannelCtor() {
  const channels = new Set();
  return class FakeBroadcastChannel {
    constructor(name) {
      this.name = name;
      this.listeners = new Set();
      channels.add(this);
    }
    addEventListener(type, listener) {
      if (type === "message") this.listeners.add(listener);
    }
    removeEventListener(type, listener) {
      if (type === "message") this.listeners.delete(listener);
    }
    postMessage(data) {
      for (const peer of channels) {
        if (peer === this || peer.name !== this.name) continue;
        setTimeout(() => {
          for (const listener of peer.listeners) listener({ data });
          if (typeof peer.onmessage === "function") peer.onmessage({ data });
        }, 0);
      }
    }
    close() {
      channels.delete(this);
      this.listeners.clear();
    }
  };
}

test("mantém o mesmo proprietário durante a navegação da mesma aba", () => {
  const root = rootWithOwner("tab-estavel");
  assert.equal(lockModule.executionOwnerId(root), "tab-estavel");
  assert.equal(lockModule.executionOwnerId(root), "tab-estavel");
});

test("adquire, renova e libera um lease próprio", () => {
  const storage = storageStub();
  const state = { runId: "run-1", running: true };
  const manager = lockModule.createLockManager({ root: rootWithOwner("tab-a"), storage, readState: () => state });

  assert.equal(manager.acquireLease(state, false).acquired, true);
  assert.equal(manager.ensureLease(state), true);
  assert.equal(manager.lockInfo(state).ownsLock, true);
  assert.equal(manager.releaseLease(state), true);
  assert.equal(storage.values.has(lockModule.LOCK_KEY), false);
});

test("não toma um lease ativo de outra aba sem takeover", () => {
  const storage = storageStub({
    [lockModule.LOCK_KEY]: {
      ownerId: "tab-a",
      runId: "run-1",
      expiresAt: Date.now() + lockModule.LOCK_LEASE_MS
    }
  });
  const state = { runId: "run-1", running: true };
  const manager = lockModule.createLockManager({ root: rootWithOwner("tab-b"), storage, readState: () => state });

  const result = manager.acquireLease(state, false);

  assert.equal(result.acquired, false);
  assert.match(manager.lockStatus(result.lock), /Outra aba está executando/);
});

test("permite assumir um lease expirado", () => {
  const storage = storageStub({
    [lockModule.LOCK_KEY]: {
      ownerId: "tab-fechada",
      runId: "run-1",
      expiresAt: Date.now() - 1
    }
  });
  const state = { runId: "run-1", running: true };
  const manager = lockModule.createLockManager({ root: rootWithOwner("tab-b"), storage, readState: () => state });

  assert.equal(manager.acquireLease(state, false).acquired, true);
  assert.equal(storage.values.get(lockModule.LOCK_KEY).ownerId, "tab-b");
});

test("sincroniza um lock remoto recebido pelo evento storage", () => {
  const storage = storageStub();
  const root = rootWithOwner("tab-b");
  const state = { runId: "run-storage", running: true };
  const manager = lockModule.createLockManager({ root, storage, readState: () => state });
  const remote = {
    version: 1,
    claimId: "claim-remote-storage",
    ownerId: "tab-a",
    runId: state.runId,
    heartbeatAt: Date.now(),
    expiresAt: Date.now() + lockModule.LOCK_LEASE_MS
  };

  root.dispatchStorage({ key: lockModule.LOCK_KEY, newValue: JSON.stringify(remote) });

  assert.equal(manager.lockInfo(state).lockedByOtherTab, true);
  assert.equal(manager.lockInfo(state).lockOwnerId, "tab-a");
  assert.match(manager.lockStatus(manager.readLock()), /Outra aba está executando/);
  manager.destroy();
});

test("uma reivindicação remota recebida por BroadcastChannel impede a renovação local", async () => {
  const BroadcastChannelCtor = broadcastChannelCtor();
  const firstStorage = storageStub();
  const secondStorage = storageStub();
  const firstState = { runId: "run-broadcast", running: true };
  const secondState = { runId: "run-broadcast", running: true };
  const first = lockModule.createLockManager({ root: rootWithOwner("tab-a", BroadcastChannelCtor), storage: firstStorage, readState: () => firstState });
  const second = lockModule.createLockManager({ root: rootWithOwner("tab-b", BroadcastChannelCtor), storage: secondStorage, readState: () => secondState });
  const remote = {
    version: 1,
    claimId: "claim-remote-broadcast",
    ownerId: "tab-a",
    runId: secondState.runId,
    heartbeatAt: Date.now(),
    expiresAt: Date.now() + lockModule.LOCK_LEASE_MS
  };

  secondStorage.write(lockModule.LOCK_KEY, remote);
  firstStorage.write(lockModule.LOCK_KEY, remote);
  first.acquireLease(firstState, false);
  await new Promise(resolve => setTimeout(resolve, 10));

  assert.equal(second.lockInfo(secondState).lockedByOtherTab, true);
  assert.equal(second.lockInfo(secondState).lockOwnerId, "tab-a");
  first.destroy();
  second.destroy();
});

test("duas reivindicações simultâneas elegem uma única aba vencedora", async () => {
  const BroadcastChannelCtor = broadcastChannelCtor();
  const firstStorage = storageStub();
  const secondStorage = storageStub();
  const firstState = { runId: "run-race", running: true };
  const secondState = { runId: "run-race", running: true };
  const first = lockModule.createLockManager({ root: rootWithOwner("tab-a", BroadcastChannelCtor), storage: firstStorage, readState: () => firstState });
  const second = lockModule.createLockManager({ root: rootWithOwner("tab-b", BroadcastChannelCtor), storage: secondStorage, readState: () => secondState });

  assert.equal(first.acquireLease(firstState, false).acquired, true);
  assert.equal(second.acquireLease(secondState, false).acquired, true);
  await new Promise(resolve => setTimeout(resolve, 15));

  const firstInfo = first.lockInfo(firstState);
  const secondInfo = second.lockInfo(secondState);
  assert.equal(Number(firstInfo.ownsLock) + Number(secondInfo.ownsLock), 1);
  assert.equal(Number(firstInfo.lockedByOtherTab) + Number(secondInfo.lockedByOtherTab), 1);
  first.destroy();
  second.destroy();
});

test("encaminha uma solicitação de pausa para a aba proprietária", async () => {
  const BroadcastChannelCtor = broadcastChannelCtor();
  const storage = storageStub();
  const ownerState = { runId: "run-pause-request", running: true };
  const requesterState = { runId: "run-pause-request", running: true };
  let received = null;
  const owner = lockModule.createLockManager({
    root: rootWithOwner("tab-owner", BroadcastChannelCtor),
    storage,
    readState: () => ownerState,
    onPauseRequest: request => { received = request; }
  });
  const requester = lockModule.createLockManager({
    root: rootWithOwner("tab-requester", BroadcastChannelCtor),
    storage,
    readState: () => requesterState
  });

  owner.acquireLease(ownerState, false);

  assert.equal(requester.requestPause(requesterState, "tampermonkey-menu"), true);
  await new Promise(resolve => setTimeout(resolve, 10));

  assert.equal(received.targetOwnerId, "tab-owner");
  assert.equal(received.runId, "run-pause-request");
  assert.equal(received.sourceLabel, "tampermonkey-menu");
  owner.destroy();
  requester.destroy();
});
