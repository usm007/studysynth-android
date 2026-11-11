/**
 * StudySynth update-system tests.
 *
 * Covers the trust boundary (manifest validation + signature verification),
 * update selection (downgrade/runtime rejection), the 12-hour check interval,
 * and the coordinator's promise that a running exam is never interrupted.
 *
 * Every signature test uses a throwaway key generated in this process; the
 * embedded production key is only checked for shape.
 */
'use strict';

const assert = require('assert');
const crypto = require('crypto');

const Manifest = require('../updates/UpdateManifest.js');
const Crypto = require('../updates/UpdateCrypto.js');
const Keys = require('../updates/keys.js');
const UpdateStorage = require('../updates/UpdateStorage.js');
const Coordinator = require('../updates/UpdateCoordinator.js');

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

function makeKeyPair() {
  const pair = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const publicB64 = pair.publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
  return { privateKey: pair.privateKey, publicKey: publicB64 };
}

function signValue(privateKey, value) {
  const bytes = Buffer.from(Crypto.canonicalize(value), 'utf8');
  return crypto.sign('sha256', bytes, privateKey).toString('base64');
}

function baseManifest(overrides) {
  return Object.assign({
    schemaVersion: 1,
    packageId: 'com.usm007.studysynth',
    channel: 'stable',
    generatedAt: '2026-11-11T10:00:00.000Z',
    release: {
      versionName: '2.1.0',
      versionCode: 4,
      minSupportedVersionCode: 3,
      mandatory: false,
      releaseNotes: 'Redesigned app with automatic updates.'
    },
    apk: {
      url: 'https://example.com/stable/apk/studysynth-2.1.0.apk',
      sha256: 'a'.repeat(64),
      size: 26500000,
      certSha256: 'b'.repeat(64)
    },
    web: {
      bundleId: 'bundle-4',
      runtimeVersion: 'capacitor-8',
      url: 'https://example.com/stable/web/bundle-4.zip',
      sha256: 'c'.repeat(64),
      size: 30000000,
      signature: 'A'.repeat(512),
      minAppVersionCode: 3
    },
    content: {
      version: '2026.11.1',
      url: 'https://example.com/stable/content/content-2026.11.1.json',
      sha256: 'd'.repeat(64),
      size: 17000000,
      signature: 'A'.repeat(512),
      minAppVersionCode: 3
    },
    signature: 'A'.repeat(512)
  }, overrides || {});
}

async function run() {
  console.log('--- Update manifest validation ---');

  await test('accepts a well-formed manifest', () => {
    const result = Manifest.validate(baseManifest(), {
      packageId: 'com.usm007.studysynth',
      channel: 'stable'
    });
    assert.deepStrictEqual(result.errors, []);
    assert.strictEqual(result.ok, true);
  });

  await test('rejects a manifest for another package', () => {
    const result = Manifest.validate(baseManifest(), { packageId: 'com.other.app' });
    assert.strictEqual(result.ok, false);
    assert.ok(result.errors.some((e) => /packageId mismatch/.test(e)));
  });

  await test('rejects a malformed SHA-256 digest', () => {
    const manifest = baseManifest();
    manifest.apk.sha256 = 'not-a-digest';
    const result = Manifest.validate(manifest);
    assert.strictEqual(result.ok, false);
    assert.ok(result.errors.some((e) => /apk\.sha256/.test(e)));
  });

  await test('rejects plain-HTTP artifact URLs', () => {
    const manifest = baseManifest();
    manifest.web.url = 'http://example.com/bundle.zip';
    const result = Manifest.validate(manifest);
    assert.strictEqual(result.ok, false);
    assert.ok(result.errors.some((e) => /web\.url must be https/.test(e)));
  });

  await test('rejects a missing manifest signature', () => {
    const manifest = baseManifest();
    delete manifest.signature;
    const result = Manifest.validate(manifest);
    assert.strictEqual(result.ok, false);
    assert.ok(result.errors.some((e) => /signature is malformed/.test(e)));
  });

  await test('rejects a manifest that describes no artifacts', () => {
    const manifest = baseManifest();
    delete manifest.apk;
    delete manifest.web;
    delete manifest.content;
    const result = Manifest.validate(manifest);
    assert.strictEqual(result.ok, false);
    assert.ok(result.errors.some((e) => /no artifacts/.test(e)));
  });

  await test('accepts a content-only manifest (no APK, no web bundle)', () => {
    const manifest = baseManifest();
    delete manifest.apk;
    delete manifest.web;
    const result = Manifest.validate(manifest);
    assert.deepStrictEqual(result.errors, []);
    assert.strictEqual(result.ok, true);
  });

  await test('rejects an unsupported schema version', () => {
    const result = Manifest.validate(baseManifest({ schemaVersion: 2 }));
    assert.strictEqual(result.ok, false);
    assert.ok(result.errors.some((e) => /schemaVersion/.test(e)));
  });

  await test('rejects minSupportedVersionCode above versionCode', () => {
    const manifest = baseManifest();
    manifest.release.minSupportedVersionCode = 9;
    const result = Manifest.validate(manifest);
    assert.strictEqual(result.ok, false);
    assert.ok(result.errors.some((e) => /cannot exceed/.test(e)));
  });

  console.log('--- Update selection ---');

  await test('offers nothing when everything is already installed', () => {
    const plan = Manifest.selectUpdates(baseManifest(), {
      versionCode: 4,
      runtimeVersion: 'capacitor-8',
      webBundleId: 'bundle-4',
      contentVersion: '2026.11.1'
    });
    assert.strictEqual(plan.apk, null);
    assert.strictEqual(plan.web, null);
    assert.strictEqual(plan.content, null);
    assert.deepStrictEqual(plan.blocked, []);
  });

  await test('offers the APK, web bundle and content package to an older install', () => {
    const plan = Manifest.selectUpdates(baseManifest(), {
      versionCode: 3,
      runtimeVersion: 'capacitor-8',
      webBundleId: '',
      contentVersion: '2026.01.1'
    });
    assert.strictEqual(plan.apk.versionCode, 4);
    assert.strictEqual(plan.web.bundleId, 'bundle-4');
    assert.strictEqual(plan.content.version, '2026.11.1');
  });

  await test('rejects a downgrade', () => {
    const plan = Manifest.selectUpdates(baseManifest(), { versionCode: 5 });
    assert.strictEqual(plan.apk, null);
    assert.strictEqual(plan.web, null);
    assert.ok(plan.blocked.some((e) => /downgrade/.test(e)));
  });

  await test('blocks a web bundle built for another runtime', () => {
    const manifest = baseManifest();
    manifest.web.runtimeVersion = 'capacitor-9';
    const plan = Manifest.selectUpdates(manifest, {
      versionCode: 3,
      runtimeVersion: 'capacitor-8'
    });
    assert.strictEqual(plan.web, null);
    assert.ok(plan.blocked.some((e) => /runtime/.test(e)));
    assert.strictEqual(plan.apk.versionCode, 4);
  });

  await test('blocks artifacts that need a newer APK first', () => {
    const manifest = baseManifest();
    manifest.web.minAppVersionCode = 5;
    const plan = Manifest.selectUpdates(manifest, { versionCode: 4, runtimeVersion: 'capacitor-8' });
    assert.strictEqual(plan.web, null);
    assert.ok(plan.blocked.some((e) => /needs app version code 5/.test(e)));
  });

  console.log('--- Cryptography ---');

  await test('SHA-256 matches the published test vector', async () => {
    const digest = await Crypto.sha256Hex(new TextEncoder().encode('abc'));
    assert.strictEqual(digest, 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  await test('hex comparison is case-insensitive and rejects malformed input', () => {
    const upper = 'A'.repeat(64);
    const lower = 'a'.repeat(64);
    assert.strictEqual(Crypto.timingSafeEqualHex(upper, lower), true);
    assert.strictEqual(Crypto.timingSafeEqualHex(lower, 'b'.repeat(64)), false);
    assert.strictEqual(Crypto.timingSafeEqualHex(lower, 'abc'), false);
  });

  await test('accepts a valid signature and rejects tampering', async () => {
    const { privateKey, publicKey } = makeKeyPair();
    const payload = { release: { versionCode: 4 }, channel: 'stable' };
    const signature = signValue(privateKey, payload);
    assert.strictEqual(await Crypto.verifySignature(publicKey, payload, signature), true);

    const tampered = { release: { versionCode: 5 }, channel: 'stable' };
    assert.strictEqual(await Crypto.verifySignature(publicKey, tampered, signature), false);
  });

  await test('returns false instead of throwing on a malformed signature', async () => {
    const { publicKey } = makeKeyPair();
    assert.strictEqual(await Crypto.verifySignature(publicKey, { a: 1 }, 'not base64!!'), false);
    assert.strictEqual(await Crypto.verifySignature(publicKey, { a: 1 }, ''), false);
    assert.strictEqual(await Crypto.verifySignature('', { a: 1 }, 'A'.repeat(512)), false);
  });

  await test('embedded production key is an RSA-3072 SPKI public key', () => {
    const key = crypto.createPublicKey({
      key: Buffer.from(Keys.publicKey, 'base64'),
      format: 'der',
      type: 'spki'
    });
    assert.strictEqual(key.asymmetricKeyType, 'rsa');
    assert.strictEqual(key.asymmetricKeyDetails.modulusLength, 3072);
  });

  console.log('--- Check interval ---');

  await test('a fresh install is due immediately', () => {
    global.localStorage = memoryStorage();
    const state = UpdateStorage.read();
    assert.strictEqual(state.lastCheckAt, 0);
    assert.strictEqual(UpdateStorage.isDue(state), true);
  });

  await test('a recent check is not due again before 12 hours', () => {
    const state = UpdateStorage.read();
    state.lastCheckAt = Date.now();
    assert.strictEqual(UpdateStorage.isDue(state), false);
    assert.strictEqual(UpdateStorage.isDue(state, Date.now() + 11 * 60 * 60 * 1000), false);
    assert.strictEqual(UpdateStorage.isDue(state, Date.now() + 13 * 60 * 60 * 1000), true);
  });

  await test('automatic checks can be switched off', () => {
    const state = UpdateStorage.read();
    state.lastCheckAt = 0;
    state.settings.auto = false;
    assert.strictEqual(UpdateStorage.isDue(state), false);
  });

  await test('settings patch merges instead of replacing', () => {
    const next = UpdateStorage.patch({ settings: { wifiOnly: false } });
    assert.strictEqual(next.settings.wifiOnly, false);
    assert.strictEqual(next.settings.auto, true);
    assert.strictEqual(next.settings.intervalMs, UpdateStorage.DEFAULT_INTERVAL_MS);
  });

  await test('corrupt stored state falls back to defaults', () => {
    global.localStorage.setItem(UpdateStorage.KEY, '{not json');
    const state = UpdateStorage.read();
    assert.strictEqual(state.lastCheckAt, 0);
    assert.strictEqual(state.settings.auto, true);
  });

  await test('a too-small interval is ignored', () => {
    global.localStorage.setItem(UpdateStorage.KEY, JSON.stringify({
      settings: { intervalMs: 1000 }
    }));
    const state = UpdateStorage.read();
    assert.strictEqual(state.settings.intervalMs, UpdateStorage.DEFAULT_INTERVAL_MS);
  });

  console.log('--- Coordinator policy ---');

  const { privateKey, publicKey } = makeKeyPair();

  function installRuntime() {
    global.localStorage = memoryStorage();
    global.STUDYSYNTH_VERSION = {
      packageId: 'com.usm007.studysynth',
      versionName: '2.1.0',
      versionCode: 4,
      runtimeVersion: 'capacitor-8',
      contentVersion: '2026.11.1',
      channel: 'stable'
    };
    global.STUDYSYNTH_UPDATE_PUBLIC_KEY = publicKey;
    global.UpdateStorage = UpdateStorage;
    global.LiveUpdateService = { isAvailable: () => false };
    Object.defineProperty(global, 'navigator', {
      value: { connection: { type: 'wifi', saveData: false } },
      configurable: true,
      writable: true
    });
    UpdateStorage.write({
      lastCheckAt: Date.now(),
      settings: { auto: true, wifiOnly: true, intervalMs: UpdateStorage.DEFAULT_INTERVAL_MS }
    });
    // Reset the coordinator's private "busy" hook between tests without
    // leaving a scheduled interval behind.
    Coordinator.start({ isBusy: () => false });
    Coordinator.stop();
  }

  function signedManifest() {
    const manifest = baseManifest();
    manifest.release.versionCode = 4;
    manifest.content.version = '2026.11.2';
    delete manifest.apk; // same versionCode: no APK to offer
    delete manifest.web;
    const payload = Object.assign({}, manifest);
    delete payload.signature;
    manifest.signature = signValue(privateKey, payload);
    return manifest;
  }

  function stubFetch(manifest) {
    global.fetch = async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(manifest)
    });
  }

  await test('a forged manifest is rejected before anything is applied', async () => {
    installRuntime();
    const manifest = signedManifest();
    manifest.signature = 'A'.repeat(512);
    stubFetch(manifest);
    let downloads = 0;
    global.ContentUpdateService = {
      getState: async () => ({ active: null }),
      download: async () => { downloads += 1; return { version: '2026.11.2', packId: 'x' }; }
    };

    const result = await Coordinator.checkNow({ manual: true });
    assert.strictEqual(result.ok, false);
    assert.ok(/signature is invalid/.test(result.error));
    assert.strictEqual(downloads, 0);
  });

  await test('a valid manifest applies a content package automatically', async () => {
    installRuntime();
    stubFetch(signedManifest());
    const seen = [];
    global.ContentUpdateService = {
      getState: async () => ({ active: null }),
      download: async (options) => {
        seen.push(options);
        return { version: options.version, packId: 'content-2026.11.2' };
      }
    };

    const result = await Coordinator.checkNow({ manual: true });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.applied.content, true);
    assert.strictEqual(seen.length, 1);
    assert.strictEqual(seen[0].version, '2026.11.2');
    assert.strictEqual(UpdateStorage.read().available, null);
  });

  await test('a scheduled check is skipped during a timed exam', async () => {
    installRuntime();
    stubFetch(signedManifest());
    let downloads = 0;
    global.ContentUpdateService = {
      getState: async () => ({ active: null }),
      download: async () => { downloads += 1; return { version: '2026.11.2', packId: 'x' }; }
    };

    await Coordinator.start({ isBusy: () => true });
    try {
      const result = await Coordinator.checkNow({ manual: false });
      assert.strictEqual(result.skipped, true);
      assert.strictEqual(downloads, 0);
    } finally {
      Coordinator.stop();
    }
  });

  await test('a manual check during an exam downloads nothing', async () => {
    installRuntime();
    stubFetch(signedManifest());
    let downloads = 0;
    global.ContentUpdateService = {
      getState: async () => ({ active: null }),
      download: async () => { downloads += 1; return { version: '2026.11.2', packId: 'x' }; }
    };

    await Coordinator.start({ isBusy: () => true });
    try {
      const result = await Coordinator.checkNow({ manual: true });
      assert.strictEqual(result.ok, true);
      assert.strictEqual(result.applied.content, false);
      assert.strictEqual(downloads, 0);
    } finally {
      Coordinator.stop();
    }
  });

  await test('metered connections defer large downloads when Wi-Fi only is set', async () => {
    installRuntime();
    stubFetch(signedManifest());
    Object.defineProperty(global, 'navigator', {
      value: { connection: { type: 'cellular', saveData: false } },
      configurable: true,
      writable: true
    });
    let downloads = 0;
    global.ContentUpdateService = {
      getState: async () => ({ active: null }),
      download: async () => { downloads += 1; return { version: '2026.11.2', packId: 'x' }; }
    };

    const result = await Coordinator.checkNow({ manual: true });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.applied.content, false);
    assert.strictEqual(downloads, 0);
  });

  await test('save-data connections never download', async () => {
    installRuntime();
    stubFetch(signedManifest());
    global.navigator.connection = { type: 'wifi', saveData: true };
    let downloads = 0;
    global.ContentUpdateService = {
      getState: async () => ({ active: null }),
      download: async () => { downloads += 1; return { version: '2026.11.2', packId: 'x' }; }
    };

    await Coordinator.checkNow({ manual: true });
    assert.strictEqual(downloads, 0);
  });

  await test('a network failure leaves the last good state intact', async () => {
    installRuntime();
    global.fetch = async () => { throw new Error('offline'); };
    global.ContentUpdateService = { getState: async () => ({ active: null }) };

    const result = await Coordinator.checkNow({ manual: true });
    assert.strictEqual(result.ok, false);
    assert.ok(/offline/.test(result.error));
    const state = UpdateStorage.read();
    assert.strictEqual(state.lastCheckOk, false);
    assert.strictEqual(state.available, null);
  });
}

run().then(() => {
  console.log('');
  console.log(`Update tests: ${results.passed} passed, ${results.failed} failed`);
  if (results.failed > 0) process.exit(1);
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
