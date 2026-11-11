/**
 * Minimal in-memory IndexedDB used by the storage tests.
 *
 * Only the surface that pwa/engine/storage.js actually touches is implemented:
 * open/upgrade, object stores with a keyPath, put/get/getAll/delete/clear and
 * transaction completion events. No indexes are queried by the app, so
 * createIndex is recorded but not searchable.
 */
'use strict';

function clone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function createFactory() {
  const databases = new Map();

  function makeRequest() {
    return { result: undefined, onsuccess: null, onerror: null };
  }

  function later(fn) {
    setTimeout(fn, 0);
  }

  function notify(req) {
    if (typeof req.onsuccess === 'function') req.onsuccess({ target: { result: req.result } });
  }

  function storeApi(store) {
    function keyFor(value) {
      if (store.keyPath) return value[store.keyPath];
      return value && value.key;
    }

    return {
      put(value) {
        const req = makeRequest();
        store.data.set(keyFor(value), clone(value));
        req.result = keyFor(value);
        later(() => notify(req));
        return req;
      },
      add(value) {
        return this.put(value);
      },
      get(key) {
        const req = makeRequest();
        later(() => {
          req.result = clone(store.data.get(key));
          notify(req);
        });
        return req;
      },
      getAll() {
        const req = makeRequest();
        later(() => {
          req.result = Array.from(store.data.values()).map(clone);
          notify(req);
        });
        return req;
      },
      delete(key) {
        const req = makeRequest();
        store.data.delete(key);
        later(() => notify(req));
        return req;
      },
      clear() {
        const req = makeRequest();
        store.data.clear();
        later(() => notify(req));
        return req;
      },
      createIndex() { /* indexes are not queried by the app */ }
    };
  }

  function createDatabase(name) {
    const stores = new Map();
    return {
      name,
      version: 0,
      objectStoreNames: {
        contains(storeName) {
          return stores.has(storeName);
        }
      },
      createObjectStore(storeName, options) {
        const store = {
          name: storeName,
          keyPath: options && options.keyPath,
          data: new Map()
        };
        stores.set(storeName, store);
        return {
          createIndex() { /* see storeApi */ }
        };
      },
      transaction(storeNames) {
        const names = Array.isArray(storeNames) ? storeNames : [storeNames];
        const tx = {
          error: null,
          oncomplete: null,
          onerror: null,
          onabort: null,
          objectStore(storeName) {
            if (names.indexOf(storeName) === -1) {
              throw new Error('Store "' + storeName + '" is not part of this transaction');
            }
            const store = stores.get(storeName);
            if (!store) throw new Error('No object store named "' + storeName + '"');
            return storeApi(store);
          }
        };
        later(() => {
          if (typeof tx.oncomplete === 'function') tx.oncomplete();
        });
        return tx;
      },
      close() { /* connections are not tracked */ },
      onversionchange: null
    };
  }

  return {
    open(name, version) {
      const req = makeRequest();
      later(() => {
        let db = databases.get(name);
        if (!db) {
          db = createDatabase(name);
          databases.set(name, db);
        }
        req.result = db;
        const nextVersion = Number(version) || 1;
        if (nextVersion > db.version) {
          const previous = db.version;
          db.version = nextVersion;
          if (previous === 0 && typeof req.onupgradeneeded === 'function') {
            req.onupgradeneeded({ target: { result: db } });
          }
        }
        notify(req);
      });
      return req;
    },
    deleteDatabase(name) {
      const req = makeRequest();
      databases.delete(name);
      later(() => notify(req));
      return req;
    }
  };
}

module.exports = { createFactory };
