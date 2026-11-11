/**
 * Packages the built web payload (www/) as a signed OTA bundle.
 *
 * The bundle is a plain ZIP of the same files Capacitor ships in the APK. The
 * Capacitor live-update plugin verifies `signature` (SHA256withRSA over the
 * ZIP bytes) and `checksum` (SHA-256 hex) before extracting anything.
 *
 * Output: dist/updates/web/<bundleId>.zip and .zip.sig, plus a metadata JSON
 * that build-manifest.js consumes.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createZip } = require('./zip');
const { signBytes } = require('./keys');
const { readVersion } = require('../version');

const root = path.resolve(__dirname, '..', '..');
const www = path.join(root, 'www');
const outDir = path.join(root, 'dist', 'updates', 'web');

function collect(dir, base) {
  const entries = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) entries.push(...collect(full, rel));
    else if (entry.isFile()) entries.push({ path: rel, data: fs.readFileSync(full) });
  }
  return entries;
}

function main() {
  if (!fs.existsSync(path.join(www, 'index.html'))) {
    throw new Error('www/ is missing. Run "npm run build:web" first.');
  }
  const version = readVersion();
  const entries = collect(www, '').sort((a, b) => a.path.localeCompare(b.path));
  if (!entries.some((entry) => entry.path === 'version.js')) {
    throw new Error('www/version.js is missing; the OTA bundle would not know its own version.');
  }

  const bytes = createZip(entries, { date: new Date('2026-01-01T00:00:00Z') });
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  const bundleId = `${version.versionName}-${version.versionCode}-${sha256.slice(0, 12)}`;
  const { signature } = signBytes(bytes);

  fs.mkdirSync(outDir, { recursive: true });
  const zipPath = path.join(outDir, `${bundleId}.zip`);
  fs.writeFileSync(zipPath, bytes);
  fs.writeFileSync(`${zipPath}.sig`, signature + '\n');

  const meta = {
    bundleId,
    runtimeVersion: version.runtimeVersion,
    versionName: version.versionName,
    versionCode: version.versionCode,
    minAppVersionCode: version.versionCode,
    sha256,
    size: bytes.length,
    signature,
    fileCount: entries.length,
    generatedAt: new Date().toISOString()
  };
  fs.writeFileSync(path.join(outDir, `${bundleId}.json`), JSON.stringify(meta, null, 2) + '\n');

  console.log(`OTA bundle: ${path.relative(root, zipPath)}`);
  console.log(`Bundle id: ${bundleId}`);
  console.log(`Files: ${entries.length}`);
  console.log(`Size: ${(bytes.length / 1024 / 1024).toFixed(2)} MB`);
  console.log(`SHA-256: ${sha256}`);
  console.log(`Signature: ${signature.slice(0, 24)}… (${signature.length} chars)`);
  return meta;
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

module.exports = { main, collect };
