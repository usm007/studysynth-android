/**
 * StudySynth content-update tests.
 *
 * A content package is the only way educational material changes between APK
 * releases. These tests prove that:
 *   - malformed or hostile packages are rejected before anything is written;
 *   - activation is atomic and the previous package survives for rollback;
 *   - bookmarks, attempts and revision data are never touched;
 *   - an overlay body wins over the bundled copy without a network request.
 *
 * IndexedDB is provided by tests/helpers/fake-idb.js so the suite stays
 * dependency-free and runs on Node.
 */
'use strict';

const assert = require('assert');
const crypto = require('crypto');
const { createFactory } = require('./helpers/fake-idb');

const results = { passed: 0, failed: 0 };

async function test(name, fn) {
  try {
    await fn();
    results.passed += 1;
    console.log('  ok   ' + name);
  } catch (err) {
    results.failed += 1;
    console.error('  FAIL ' + name);
    console.error('       ' + (err && err.stack ? err.stack.split('\n').slice(0, 3).join('\n       ') : err));
  }
}

function memoryStorage() {
  const map = new Map();
  return {
    getItem(key) { return map.has(key) ? map.get(key) : null; },
    setItem(key, value) { map.set(key, String(value)); },
    removeItem(key) { map.delete(key); },
    clear() { map.clear(); },
    get length() { return map.size; }
  };
}

/** Loads a fresh storage module bound to a fresh in-memory database. */
function loadStorage() {
  delete require.cache[require.resolve('../engine/storage.js')];
  global.indexedDB = createFactory();
  global.localStorage = memoryStorage();
  global.window = global;
  return require('../engine/storage.js');
}

function question(id, answer) {
  return {
    id,
    stem: 'Question ' + id,
    options: [
      { key: 'A', text: 'First option' },
      { key: 'B', text: 'Second option' }
    ],
    answer_key: answer || 'A',
    explanation: 'Explained answer for ' + id
  };
}

function moduleBody(id, ids) {
  return {
    id,
    title: 'Set ' + id,
    questions: ids.map((questionId) => question(questionId))
  };
}

function contentPackage(overrides) {
  return Object.assign({
    schemaVersion: 1,
    contentVersion: '2026.11.1',
    mode: 'full',
    index: [{ id: 'm1', title: 'Set m1', count: 1 }],
    modules: { m1: moduleBody('m1', ['q1']) }
  }, overrides || {});
}

function makeKeyPair() {
  const pair = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const publicB64 = pair.publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
  return { privateKey: pair.privateKey, publicKey: publicB64 };
}

function signBytes(privateKey, bytes) {
  return crypto.sign('sha256', bytes, privateKey).toString('base64');
}

async function run() {
  const ContentUpdateService = require('../updates/ContentUpdateService.js');
  const UpdateCrypto = require('../updates/UpdateCrypto.js');

  console.log('--- Content package validation ---');

  await test('accepts a well-formed full package', () => {
    const check = ContentUpdateService.validatePackage(contentPackage());
    assert.deepStrictEqual(check.errors, []);
    assert.strictEqual(check.ok, true);
  });

  await test('accepts a delta package that only replaces some modules', () => {
    const check = ContentUpdateService.validatePackage(contentPackage({
      mode: 'delta',
      index: [{ id: 'm1' }, { id: 'm2' }],
      modules: { m2: moduleBody('m2', ['q7']) },
      removedModuleIds: ['m3']
    }));
    assert.deepStrictEqual(check.errors, []);
    assert.strictEqual(check.ok, true);
  });

  await test('rejects an answer key that matches no option', () => {
    const pkg = contentPackage();
    pkg.modules.m1.questions[0].answer_key = 'Z';
    const check = ContentUpdateService.validatePackage(pkg);
    assert.strictEqual(check.ok, false);
    assert.ok(check.errors.some((e) => /answer_key/.test(e)));
  });

  await test('rejects duplicate question ids inside a module', () => {
    const pkg = contentPackage();
    pkg.modules.m1.questions = [question('q1'), question('q1')];
    const check = ContentUpdateService.validatePackage(pkg);
    assert.strictEqual(check.ok, false);
    assert.ok(check.errors.some((e) => /duplicate question id/.test(e)));
  });

  await test('rejects duplicate index ids', () => {
    const pkg = contentPackage({ index: [{ id: 'm1' }, { id: 'm1' }] });
    const check = ContentUpdateService.validatePackage(pkg);
    assert.strictEqual(check.ok, false);
    assert.ok(check.errors.some((e) => /duplicate id/.test(e)));
  });

  await test('rejects a module whose id disagrees with its key', () => {
    const pkg = contentPackage({ modules: { m1: moduleBody('m9', ['q1']) } });
    const check = ContentUpdateService.validatePackage(pkg);
    assert.strictEqual(check.ok, false);
    assert.ok(check.errors.some((e) => /does not match its key/.test(e)));
  });

  await test('rejects an empty index', () => {
    const check = ContentUpdateService.validatePackage(contentPackage({ index: [] }));
    assert.strictEqual(check.ok, false);
    assert.ok(check.errors.some((e) => /index is empty/.test(e)));
  });

  await test('rejects a version that disagrees with the manifest', () => {
    const check = ContentUpdateService.validatePackage(contentPackage(), {
      expectedVersion: '2026.12.1'
    });
    assert.strictEqual(check.ok, false);
    assert.ok(check.errors.some((e) => /does not match the manifest/.test(e)));
  });

  console.log('--- Atomic activation and rollback ---');

  await test('activates a package and serves its bodies', async () => {
    const Storage = loadStorage();
    const state = await Storage.applyContentPack({
      packId: 'pack-a',
      version: '2026.11.1',
      index: [{ id: 'm1', title: 'Set m1' }],
      modules: { m1: moduleBody('m1', ['q1']) }
    });
    assert.strictEqual(state.active.packId, 'pack-a');
    assert.strictEqual(state.previous, null);

    const body = await Storage.getContentModule('m1');
    assert.strictEqual(body.id, 'm1');
    assert.strictEqual(body.questions.length, 1);
  });

  await test('keeps the previous package after a second activation', async () => {
    const Storage = loadStorage();
    await Storage.applyContentPack({
      packId: 'pack-a',
      version: '2026.11.1',
      index: [{ id: 'm1' }],
      modules: { m1: moduleBody('m1', ['q1']) }
    });
    const state = await Storage.applyContentPack({
      packId: 'pack-b',
      version: '2026.11.2',
      index: [{ id: 'm1' }, { id: 'm2' }],
      modules: {
        m1: moduleBody('m1', ['q1', 'q2']),
        m2: moduleBody('m2', ['q9'])
      }
    });
    assert.strictEqual(state.active.packId, 'pack-b');
    assert.strictEqual(state.previous.packId, 'pack-a');

    const body = await Storage.getContentModule('m1');
    assert.strictEqual(body.questions.length, 2);
  });

  await test('rollback restores the previous package', async () => {
    const Storage = loadStorage();
    await Storage.applyContentPack({
      packId: 'pack-a',
      version: '2026.11.1',
      index: [{ id: 'm1' }],
      modules: { m1: moduleBody('m1', ['q1']) }
    });
    await Storage.applyContentPack({
      packId: 'pack-b',
      version: '2026.11.2',
      index: [{ id: 'm1' }],
      modules: { m1: moduleBody('m1', ['q1', 'q2']) }
    });

    const state = await Storage.rollbackContentPack();
    assert.strictEqual(state.active.packId, 'pack-a');
    assert.strictEqual(state.previous, null);
    const body = await Storage.getContentModule('m1');
    assert.strictEqual(body.questions.length, 1);
  });

  await test('rollback fails loudly when there is nothing to restore', async () => {
    const Storage = loadStorage();
    await Storage.applyContentPack({
      packId: 'pack-a',
      version: '2026.11.1',
      index: [{ id: 'm1' }],
      modules: { m1: moduleBody('m1', ['q1']) }
    });
    await assert.rejects(() => Storage.rollbackContentPack(), /no previous content package/);
  });

  await test('bookmarks and attempts survive content activation and rollback', async () => {
    const Storage = loadStorage();
    await Storage.saveAttempt({ id: 'attempt-1', moduleId: 'm1', score: 7 });
    Storage.toggleBookmark('q1', { stem: 'Question q1' });

    await Storage.applyContentPack({
      packId: 'pack-a',
      version: '2026.11.1',
      index: [{ id: 'm1' }],
      modules: { m1: moduleBody('m1', ['q1']) }
    });
    await Storage.applyContentPack({
      packId: 'pack-b',
      version: '2026.11.2',
      index: [{ id: 'm1' }],
      modules: { m1: moduleBody('m1', ['q1', 'q2']) }
    });
    await Storage.rollbackContentPack();

    const attempts = await Storage.getAttempts();
    assert.strictEqual(attempts.length, 1);
    assert.strictEqual(attempts[0].score, 7);
    assert.ok(Storage.getBookmarks().q1);
  });

  await test('the overlay wins over the bundled copy without a network fetch', async () => {
    const Storage = loadStorage();
    global.CTET_INDEX = [{ id: 'm1', title: 'Bundled m1' }];
    let fetched = 0;
    global.fetch = async () => {
      fetched += 1;
      throw new Error('The bundled body must not be fetched while an overlay body exists.');
    };

    await Storage.applyContentPack({
      packId: 'pack-a',
      version: '2026.11.1',
      index: [{ id: 'm1', title: 'Updated m1' }],
      modules: { m1: moduleBody('m1', ['q1', 'q2']) }
    });

    const body = await Storage.getModule('m1');
    assert.strictEqual(body.questions.length, 2);
    assert.strictEqual(fetched, 0);
  });

  await test('clearing content packs returns the app to bundled content', async () => {
    const Storage = loadStorage();
    await Storage.applyContentPack({
      packId: 'pack-a',
      version: '2026.11.1',
      index: [{ id: 'm1' }],
      modules: { m1: moduleBody('m1', ['q1']) }
    });
    await Storage.clearContentPacks();
    const state = await Storage.getContentPackState();
    assert.strictEqual(state.active, null);
    assert.strictEqual(state.previous, null);
  });

  console.log('--- Signed download pipeline ---');

  await test('verifies, validates and activates a signed package', async () => {
    const Storage = loadStorage();
    global.OfflineStorage = Storage;
    global.UpdateCrypto = UpdateCrypto;
    global.ContentUpdateService = ContentUpdateService;

    const { privateKey, publicKey } = makeKeyPair();
    global.STUDYSYNTH_UPDATE_PUBLIC_KEY = publicKey;

    const pkg = contentPackage({ contentVersion: '2026.11.3' });
    const bytes = Buffer.from(JSON.stringify(pkg), 'utf8');
    const digest = crypto.createHash('sha256').update(bytes).digest('hex');
    const signature = signBytes(privateKey, bytes);

    global.fetch = async () => ({
      ok: true,
      status: 200,
      body: null,
      headers: { get: () => String(bytes.length) },
      arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
    });

    const result = await ContentUpdateService.download({
      url: 'https://example.com/stable/content/content-2026.11.3.json',
      sha256: digest,
      size: bytes.length,
      signature,
      version: '2026.11.3'
    });

    assert.strictEqual(result.version, '2026.11.3');
    assert.ok(/^content-2026\.11\.3-/.test(result.packId));
    const state = await ContentUpdateService.getState();
    assert.strictEqual(state.active.version, '2026.11.3');
  });

  await test('a checksum mismatch is rejected and the active package is untouched', async () => {
    const Storage = loadStorage();
    global.OfflineStorage = Storage;
    global.UpdateCrypto = UpdateCrypto;
    global.ContentUpdateService = ContentUpdateService;

    const { privateKey, publicKey } = makeKeyPair();
    global.STUDYSYNTH_UPDATE_PUBLIC_KEY = publicKey;

    await Storage.applyContentPack({
      packId: 'pack-safe',
      version: '2026.11.1',
      index: [{ id: 'm1' }],
      modules: { m1: moduleBody('m1', ['q1']) }
    });

    const pkg = contentPackage({ contentVersion: '2026.11.4' });
    const bytes = Buffer.from(JSON.stringify(pkg), 'utf8');
    const signature = signBytes(privateKey, bytes);

    global.fetch = async () => ({
      ok: true,
      status: 200,
      body: null,
      headers: { get: () => String(bytes.length) },
      arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
    });

    await assert.rejects(() => ContentUpdateService.download({
      url: 'https://example.com/stable/content/content-2026.11.4.json',
      sha256: 'e'.repeat(64),
      size: bytes.length,
      signature,
      version: '2026.11.4'
    }), /checksum/);

    const state = await Storage.getContentPackState();
    assert.strictEqual(state.active.packId, 'pack-safe');
  });

  await test('a validly signed but hostile package is rejected before activation', async () => {
    const Storage = loadStorage();
    global.OfflineStorage = Storage;
    global.UpdateCrypto = UpdateCrypto;
    global.ContentUpdateService = ContentUpdateService;

    const { privateKey, publicKey } = makeKeyPair();
    global.STUDYSYNTH_UPDATE_PUBLIC_KEY = publicKey;

    await Storage.applyContentPack({
      packId: 'pack-safe',
      version: '2026.11.1',
      index: [{ id: 'm1' }],
      modules: { m1: moduleBody('m1', ['q1']) }
    });

    const pkg = contentPackage({ contentVersion: '2026.11.5' });
    pkg.modules.m1.questions[0].answer_key = 'Z';
    const bytes = Buffer.from(JSON.stringify(pkg), 'utf8');
    const digest = crypto.createHash('sha256').update(bytes).digest('hex');
    const signature = signBytes(privateKey, bytes);

    global.fetch = async () => ({
      ok: true,
      status: 200,
      body: null,
      headers: { get: () => String(bytes.length) },
      arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
    });

    await assert.rejects(() => ContentUpdateService.download({
      url: 'https://example.com/stable/content/content-2026.11.5.json',
      sha256: digest,
      size: bytes.length,
      signature,
      version: '2026.11.5'
    }), /rejected/);

    const state = await Storage.getContentPackState();
    assert.strictEqual(state.active.packId, 'pack-safe');
  });

  await test('a package signed by the wrong key is rejected', async () => {
    const Storage = loadStorage();
    global.OfflineStorage = Storage;
    global.UpdateCrypto = UpdateCrypto;
    global.ContentUpdateService = ContentUpdateService;

    const trusted = makeKeyPair();
    const attacker = makeKeyPair();
    global.STUDYSYNTH_UPDATE_PUBLIC_KEY = trusted.publicKey;

    const pkg = contentPackage({ contentVersion: '2026.11.6' });
    const bytes = Buffer.from(JSON.stringify(pkg), 'utf8');
    const digest = crypto.createHash('sha256').update(bytes).digest('hex');
    const signature = signBytes(attacker.privateKey, bytes);

    global.fetch = async () => ({
      ok: true,
      status: 200,
      body: null,
      headers: { get: () => String(bytes.length) },
      arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
    });

    await assert.rejects(() => ContentUpdateService.download({
      url: 'https://example.com/stable/content/content-2026.11.6.json',
      sha256: digest,
      size: bytes.length,
      signature,
      version: '2026.11.6'
    }), /signature is invalid/);

    const state = await Storage.getContentPackState();
    assert.strictEqual(state.active, null);
  });
}

run().then(() => {
  console.log('');
  console.log(`Content tests: ${results.passed} passed, ${results.failed} failed`);
  if (results.failed > 0) process.exit(1);
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
