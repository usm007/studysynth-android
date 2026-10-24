/**
 * Builds the Capacitor web payload from the zero-LLM PWA sources.
 * Only runtime files are copied, so development dependencies and test
 * fixtures never end up inside the Android APK.
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const src = path.join(root, 'pwa');
const out = path.join(root, 'www');

const files = [
  'index.html',
  'styles.css',
  'app.js',
  'sample_data.js',
  'ctet_index.js',
  'ctet_manifest.js',
  'manifest.webmanifest',
  'sw.js'
];
const dirs = ['assets', 'engine', 'vendor', 'ctet'];

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

for (const file of files) {
  const from = path.join(src, file);
  if (!fs.existsSync(from)) throw new Error(`Missing PWA runtime file: ${file}`);
  fs.copyFileSync(from, path.join(out, file));
}

for (const dir of dirs) {
  const from = path.join(src, dir);
  if (!fs.existsSync(from)) throw new Error(`Missing PWA runtime directory: ${dir}`);
  fs.cpSync(from, path.join(out, dir), { recursive: true });
}

const total = (function walk(p) {
  let bytes = 0;
  for (const entry of fs.readdirSync(p, { withFileTypes: true })) {
    const child = path.join(p, entry.name);
    bytes += entry.isDirectory() ? walk(child) : fs.statSync(child).size;
  }
  return bytes;
})(out);

console.log(`PWA web payload ready: ${path.relative(root, out)} (${(total / 1024 / 1024).toFixed(1)} MB)`);
