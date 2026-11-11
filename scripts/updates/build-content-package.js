/**
 * Builds a signed educational-content package.
 *
 * A package is a single JSON document:
 *   { schemaVersion, contentVersion, mode, index: [...], modules: { id: body } }
 *
 * Full packages contain every module. Delta packages start from a previously
 * built package (--base) and replace only the modules you list, so the result
 * is still complete: a module that is not included can never silently fall
 * back to an older copy on the device.
 *
 * Output: dist/updates/content/content-<version>.json (+ .sig) and a metadata
 * JSON consumed by build-manifest.js.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { signBytes } = require('./keys');
const { readVersion } = require('../version');
const contentService = require('../../pwa/updates/ContentUpdateService.js');

const root = path.resolve(__dirname, '..', '..');
const pwa = path.join(root, 'pwa');
const outDir = path.join(root, 'dist', 'updates', 'content');

function parseArgs(argv) {
  const args = { modules: null, base: null, version: null, mode: 'full', remove: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--modules') args.modules = String(argv[++i] || '').split(',').map((s) => s.trim()).filter(Boolean);
    else if (arg === '--remove') args.remove = String(argv[++i] || '').split(',').map((s) => s.trim()).filter(Boolean);
    else if (arg === '--base') args.base = argv[++i];
    else if (arg === '--version') args.version = argv[++i];
    else if (arg === '--mode') args.mode = argv[++i];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (args.mode !== 'full' && args.mode !== 'delta') throw new Error('--mode must be "full" or "delta"');
  if (args.mode === 'delta' && !args.base) throw new Error('--mode delta requires --base <package.json>');
  return args;
}

function loadIndex() {
  const file = path.join(pwa, 'ctet_index.js');
  const sandbox = { window: {}, globalThis: {} };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(file, 'utf8'), sandbox, { filename: file });
  const index = sandbox.CTET_INDEX || sandbox.window.CTET_INDEX;
  if (!Array.isArray(index) || !index.length) throw new Error('ctet_index.js did not expose CTET_INDEX');
  return index;
}

function readModuleBody(moduleId) {
  const file = path.join(pwa, 'ctet', `${moduleId}.json`);
  if (!fs.existsSync(file)) throw new Error(`Missing module body: pwa/ctet/${moduleId}.json`);
  const body = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!body || body.id !== moduleId) throw new Error(`Module ${moduleId} has a mismatched id inside its body`);
  return body;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const version = readVersion();
  const contentVersion = args.version || version.contentVersion;
  if (!contentVersion) throw new Error('version.json has no contentVersion');

  const repoIndex = loadIndex();
  const repoIds = repoIndex.map((entry) => entry.id);

  let index = repoIndex;
  const modules = {};
  let removed = [];

  if (args.base) {
    const base = JSON.parse(fs.readFileSync(path.resolve(args.base), 'utf8'));
    if (!base || !Array.isArray(base.index) || !base.modules) {
      throw new Error('--base file is not a content package');
    }
    index = base.index.slice();
    Object.keys(base.modules).forEach((id) => { modules[id] = base.modules[id]; });
    const baseIds = new Set(index.map((entry) => entry.id));
    const repoById = new Map(repoIndex.map((entry) => [entry.id, entry]));

    // New modules that appear in the repository are always added.
    repoIndex.forEach((entry) => {
      if (!baseIds.has(entry.id)) {
        index.push(entry);
        modules[entry.id] = readModuleBody(entry.id);
      }
    });
    // Index metadata always follows the repository (titles, counts).
    index = index.map((entry) => repoById.get(entry.id) || entry);

    const changed = args.modules && args.modules.length ? args.modules : repoIds;
    changed.forEach((id) => {
      if (!repoById.has(id)) throw new Error(`--modules refers to unknown module: ${id}`);
      modules[id] = readModuleBody(id);
    });
    if (args.remove.length) {
      args.remove.forEach((id) => {
        delete modules[id];
        index = index.filter((entry) => entry.id !== id);
      });
      removed = args.remove.slice();
    }
  } else {
    repoIndex.forEach((entry) => { modules[entry.id] = readModuleBody(entry.id); });
  }

  const pkg = {
    schemaVersion: 1,
    contentVersion,
    mode: args.base ? 'delta' : 'full',
    generatedAt: new Date().toISOString(),
    index,
    modules
  };
  if (removed.length) pkg.removedModuleIds = removed;

  const check = contentService.validatePackage(pkg, { expectedVersion: contentVersion });
  if (!check.ok) {
    console.error('Content package failed validation:');
    check.errors.slice(0, 20).forEach((error) => console.error('  - ' + error));
    process.exit(1);
  }

  const questionCount = index.reduce((sum, entry) => sum + (Number(entry.questionCount) || 0), 0);
  const bytes = Buffer.from(JSON.stringify(pkg), 'utf8');
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  const { signature } = signBytes(bytes);

  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, `content-${contentVersion}.json`);
  fs.writeFileSync(file, bytes);
  fs.writeFileSync(`${file}.sig`, signature + '\n');

  const meta = {
    version: contentVersion,
    mode: pkg.mode,
    minAppVersionCode: version.versionCode,
    sha256,
    size: bytes.length,
    signature,
    moduleCount: Object.keys(modules).length,
    questionCount,
    generatedAt: pkg.generatedAt
  };
  fs.writeFileSync(path.join(outDir, `content-${contentVersion}.meta.json`), JSON.stringify(meta, null, 2) + '\n');

  console.log(`Content package: ${path.relative(root, file)}`);
  console.log(`Mode: ${meta.mode}`);
  console.log(`Modules: ${meta.moduleCount}, questions: ${meta.questionCount}`);
  console.log(`Size: ${(bytes.length / 1024 / 1024).toFixed(2)} MB`);
  console.log(`SHA-256: ${sha256}`);
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

module.exports = { main };
