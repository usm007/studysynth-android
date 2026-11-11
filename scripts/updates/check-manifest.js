#!/usr/bin/env node
/**
 * Schema + signature check for the published update manifest.
 *
 * This is the CI-safe subset of verify-release.js: it does not need the
 * artifacts to be present, so it can run on every pull request. It proves the
 * committed manifest is well-formed, matches the current package identity, and
 * was signed by the key embedded in the app.
 *
 * Usage: node scripts/updates/check-manifest.js [path/to/manifest.json]
 */
const fs = require('fs');
const path = require('path');
const { canonicalize } = require('./canonical');
const { verifyBytes } = require('./keys');
const manifestApi = require('../../pwa/updates/UpdateManifest.js');
const keys = require('../../pwa/updates/keys.js');

const root = path.resolve(__dirname, '..', '..');
const manifestFile = path.resolve(
  process.argv[2] || path.join(root, 'updates-site', 'updates', 'stable', 'manifest.json')
);

function main() {
  if (!fs.existsSync(manifestFile)) {
    throw new Error(`Manifest not found: ${manifestFile}`);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));

  const check = manifestApi.validate(manifest, {
    packageId: manifest.packageId,
    channel: manifest.channel,
  });
  if (!check.ok) {
    console.error('Manifest schema errors:');
    check.errors.forEach((error) => console.error('  - ' + error));
    process.exit(1);
  }

  const payload = Object.assign({}, manifest);
  const signature = payload.signature;
  delete payload.signature;

  const publicKey = keys.publicKey;
  if (!publicKey) throw new Error('No update public key found in pwa/updates/keys.js.');
  if (!verifyBytes(publicKey, Buffer.from(canonicalize(payload), 'utf8'), signature)) {
    console.error('Manifest signature does not match the embedded update public key.');
    process.exit(1);
  }

  const artifacts = ['apk', 'web', 'content'].filter((name) => manifest[name]);
  console.log(
    `Manifest OK: ${manifest.packageId} ${manifest.release.versionName} ` +
    `(${manifest.release.versionCode}) channel=${manifest.channel} ` +
    `artifacts=${artifacts.join(',') || 'none'}`
  );
}

try {
  main();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
