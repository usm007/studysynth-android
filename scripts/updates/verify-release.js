/**
 * Verifies a published update set the same way the app does.
 *
 * Checks, in order:
 *   1. Manifest schema and RSA signature against the embedded public key.
 *   2. Every artifact's SHA-256 and size against the manifest.
 *   3. Web bundle and content package signatures (raw bytes).
 *   4. APK package id, versionCode/versionName and signing certificate digest.
 *
 * Exits non-zero on the first category that fails, printing every problem it
 * found so a release can be fixed instead of shipped.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { canonicalize } = require('./canonical');
const { verifyBytes } = require('./keys');
const { readApkInfo } = require('./apk-info');
const manifestApi = require('../../pwa/updates/UpdateManifest.js');
const keys = require('../../pwa/updates/keys.js');
const { readVersion } = require('../version');

const root = path.resolve(__dirname, '..', '..');

function parseArgs(argv) {
  const args = {
    manifest: null,
    site: path.join(root, 'updates-site'),
    baseUrl: null
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--manifest') args.manifest = argv[++i];
    else if (arg === '--site') args.site = path.resolve(argv[++i]);
    else if (arg === '--base-url') args.baseUrl = String(argv[++i] || '').replace(/\/+$/, '');
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!args.manifest) {
    args.manifest = path.join(args.site, 'updates', 'stable', 'manifest.json');
  }
  return args;
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function localPathFor(url, site, baseUrl) {
  const parsed = new URL(url);
  const pathname = decodeURIComponent(parsed.pathname);
  const marker = '/updates/';
  const at = pathname.indexOf(marker);
  if (at === -1) return null;
  if (baseUrl) {
    const expected = new URL(baseUrl).pathname.replace(/\/+$/, '');
    if (!pathname.startsWith(expected)) return null;
  }
  const relative = pathname.slice(at + marker.length);
  return path.join(site, 'updates', relative.split('/').join(path.sep));
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const manifestFile = path.resolve(args.manifest);
  const problems = [];
  const notes = [];

  if (!fs.existsSync(manifestFile)) {
    console.error(`Manifest not found: ${manifestFile}`);
    process.exit(1);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));

  const check = manifestApi.validate(manifest, {
    packageId: manifest.packageId,
    channel: manifest.channel
  });
  if (!check.ok) {
    check.errors.forEach((error) => problems.push('schema: ' + error));
  }

  const payload = Object.assign({}, manifest);
  const signature = payload.signature;
  delete payload.signature;
  if (!verifyBytes(keys.publicKey, Buffer.from(canonicalize(payload), 'utf8'), signature)) {
    problems.push('signature: manifest signature does not verify with the embedded public key');
  } else {
    notes.push('manifest signature verified');
  }

  const release = manifest.release || {};
  notes.push(`release ${release.versionName} (${release.versionCode}), min supported ${release.minSupportedVersionCode}`);

  // The APK bundles the dataset named in version.json. Publishing an older
  // content package would offer a downgrade to every fresh install.
  const version = readVersion();
  if (manifest.content && version.contentVersion) {
    if (manifestApi.compareVersions(manifest.content.version, version.contentVersion) < 0) {
      problems.push(`content: manifest version ${manifest.content.version} is older than the bundled ${version.contentVersion}`);
    } else {
      notes.push(`content: manifest ${manifest.content.version} is not older than the bundled ${version.contentVersion}`);
    }
  }

  const artifacts = [];
  if (manifest.apk) artifacts.push({ kind: 'apk', block: manifest.apk });
  if (manifest.web) artifacts.push({ kind: 'web', block: manifest.web });
  if (manifest.content) artifacts.push({ kind: 'content', block: manifest.content });

  for (const artifact of artifacts) {
    const file = localPathFor(artifact.block.url, args.site, args.baseUrl);
    if (!file || !fs.existsSync(file)) {
      problems.push(`${artifact.kind}: local artifact missing for ${artifact.block.url}`);
      continue;
    }
    const bytes = fs.readFileSync(file);
    if (bytes.length !== artifact.block.size) {
      problems.push(`${artifact.kind}: size ${bytes.length} does not match manifest ${artifact.block.size}`);
    }
    if (sha256(bytes) !== artifact.block.sha256) {
      problems.push(`${artifact.kind}: SHA-256 does not match the manifest`);
    } else {
      notes.push(`${artifact.kind}: SHA-256 verified (${(bytes.length / 1024 / 1024).toFixed(2)} MB)`);
    }
    if (artifact.kind === 'web' || artifact.kind === 'content') {
      if (!verifyBytes(keys.publicKey, bytes, artifact.block.signature)) {
        problems.push(`${artifact.kind}: artifact signature does not verify`);
      } else {
        notes.push(`${artifact.kind}: artifact signature verified`);
      }
    }
    if (artifact.kind === 'apk') {
      try {
        const info = readApkInfo(file);
        if (info.packageId !== manifest.packageId) {
          problems.push(`apk: package ${info.packageId} does not match manifest ${manifest.packageId}`);
        }
        if (info.versionCode !== release.versionCode) {
          problems.push(`apk: versionCode ${info.versionCode} does not match release ${release.versionCode}`);
        }
        if (info.versionName !== release.versionName) {
          problems.push(`apk: versionName ${info.versionName} does not match release ${release.versionName}`);
        }
        if (info.certSha256 !== String(artifact.block.certSha256).toLowerCase()) {
          problems.push('apk: signing certificate does not match the manifest');
        }
        const schemes = info.signatureSchemes || {};
        const hasSchemeInfo = Object.keys(schemes).length > 0;
        if (hasSchemeInfo && !schemes.v2 && !schemes.v3) {
          problems.push('apk: no APK Signature Scheme v2/v3 signature found (Android 7+ refuses such installs)');
        }
        notes.push(`apk: ${info.packageId} ${info.versionName} (${info.versionCode}), cert ${info.certSha256.slice(0, 16)}…`);
      } catch (err) {
        problems.push('apk: could not be inspected: ' + err.message);
      }
    }
  }

  notes.forEach((line) => console.log('OK   ' + line));
  if (problems.length) {
    problems.forEach((line) => console.error('FAIL ' + line));
    process.exit(1);
  }
  console.log('\nAll checks passed.');
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

module.exports = { main };
