/**
 * Builds and signs the static update manifest that every installed app reads.
 *
 * The manifest is the single document that describes the current release:
 * APK, OTA web bundle and content package. It is signed over its canonical
 * JSON (signature field removed) so a compromised host cannot point the app at
 * a different artifact.
 *
 * Output: updates-site/updates/<channel>/manifest.json (+ manifest.json.sig)
 * and a copy under dist/updates/manifest.json for release attachments.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { canonicalize } = require('./canonical');
const { signBytes } = require('./keys');
const { readVersion } = require('../version');
const { readApkInfo } = require('./apk-info');
const manifestApi = require('../../pwa/updates/UpdateManifest.js');

const root = path.resolve(__dirname, '..', '..');
const dist = path.join(root, 'dist', 'updates');

function parseArgs(argv) {
  const args = {
    apk: null,
    web: null,
    content: null,
    baseUrl: 'https://usm007.github.io/studysynth-android/updates',
    notes: null,
    mandatory: false,
    skipApk: false
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--apk') args.apk = argv[++i];
    else if (arg === '--web') args.web = argv[++i];
    else if (arg === '--content') args.content = argv[++i];
    else if (arg === '--base-url') args.baseUrl = String(argv[++i] || '').replace(/\/+$/, '');
    else if (arg === '--notes') args.notes = argv[++i];
    else if (arg === '--mandatory') args.mandatory = true;
    else if (arg === '--skip-apk') args.skipApk = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!/^https:\/\//.test(args.baseUrl)) throw new Error('--base-url must be https');
  return args;
}

function latestJson(dir, suffix) {
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir)
    .filter((name) => name.endsWith(suffix))
    .map((name) => ({ name, at: fs.statSync(path.join(dir, name)).mtimeMs }))
    .sort((a, b) => b.at - a.at);
  return files.length ? path.join(dir, files[0].name) : null;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
}

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const version = readVersion();
  const channel = version.channel;

  let apkBlock = null;
  let apkFile = null;
  if (!args.skipApk) {
    const apkPath = args.apk || path.join(root, 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
    const info = readApkInfo(apkPath);
    apkFile = info.file;
    if (info.packageId !== version.packageId) {
      throw new Error(`APK package ${info.packageId} does not match version.json (${version.packageId})`);
    }
    if (info.versionCode !== version.versionCode) {
      throw new Error(`APK versionCode ${info.versionCode} does not match version.json (${version.versionCode})`);
    }
    if (info.versionName !== version.versionName) {
      throw new Error(`APK versionName ${info.versionName} does not match version.json (${version.versionName})`);
    }
    apkBlock = {
      url: `${args.baseUrl}/${channel}/apk/studysynth-${version.versionName}.apk`,
      sha256: sha256File(info.file),
      size: info.size,
      certSha256: info.certSha256
    };
  }

  const webMetaPath = args.web || latestJson(path.join(dist, 'web'), '.json');
  let webBlock = null;
  if (webMetaPath) {
    const web = readJson(webMetaPath);
    if (web.runtimeVersion !== version.runtimeVersion) {
      throw new Error(`Web bundle targets ${web.runtimeVersion}, version.json says ${version.runtimeVersion}`);
    }
    webBlock = {
      bundleId: web.bundleId,
      runtimeVersion: web.runtimeVersion,
      url: `${args.baseUrl}/${channel}/web/${web.bundleId}.zip`,
      sha256: web.sha256,
      size: web.size,
      signature: web.signature,
      minAppVersionCode: web.minAppVersionCode || version.versionCode
    };
  }

  const contentMetaPath = args.content || latestJson(path.join(dist, 'content'), '.meta.json');
  let contentBlock = null;
  if (contentMetaPath) {
    const content = readJson(contentMetaPath);
    contentBlock = {
      version: content.version,
      url: `${args.baseUrl}/${channel}/content/content-${content.version}.json`,
      sha256: content.sha256,
      size: content.size,
      signature: content.signature,
      minAppVersionCode: content.minAppVersionCode || version.versionCode
    };
  }

  let releaseNotes = '';
  if (args.notes) {
    releaseNotes = fs.readFileSync(path.resolve(args.notes), 'utf8').trim();
  } else {
    const notesFile = path.join(root, 'docs', 'release-notes', `${version.versionName}.md`);
    if (fs.existsSync(notesFile)) releaseNotes = fs.readFileSync(notesFile, 'utf8').trim();
  }

  const payload = {
    schemaVersion: 1,
    packageId: version.packageId,
    channel,
    generatedAt: new Date().toISOString(),
    release: {
      versionName: version.versionName,
      versionCode: version.versionCode,
      minSupportedVersionCode: version.minSupportedVersionCode,
      mandatory: args.mandatory,
      releaseNotes
    },
    apk: apkBlock || undefined,
    web: webBlock || undefined,
    content: contentBlock || undefined
  };
  if (!payload.apk) delete payload.apk;
  if (!payload.web) delete payload.web;
  if (!payload.content) delete payload.content;

  const check = manifestApi.validate(Object.assign({}, payload, { signature: 'A'.repeat(512) }), {
    packageId: version.packageId,
    channel
  });
  if (!check.ok) {
    console.error('Manifest failed validation:');
    check.errors.forEach((error) => console.error('  - ' + error));
    process.exit(1);
  }

  const { signature } = signBytes(Buffer.from(canonicalize(payload), 'utf8'));
  const manifest = Object.assign({}, payload, { signature });
  const text = JSON.stringify(manifest, null, 2) + '\n';

  const siteDir = path.join(root, 'updates-site', 'updates', channel);
  fs.mkdirSync(siteDir, { recursive: true });
  fs.mkdirSync(dist, { recursive: true });

  // Stage the artifacts next to the manifest so the published site is
  // self-contained. The manifest is written last: a reader can never see a
  // manifest that points at an artifact which is not there yet.
  function stage(from, folder, asName) {
    if (!fs.existsSync(from)) throw new Error(`Artifact missing: ${from}`);
    const targetDir = path.join(siteDir, folder);
    fs.mkdirSync(targetDir, { recursive: true });
    const target = path.join(targetDir, asName || path.basename(from));
    if (path.resolve(from) !== path.resolve(target)) fs.copyFileSync(from, target);
    return target;
  }

  if (apkBlock) {
    stage(apkFile, 'apk', `studysynth-${version.versionName}.apk`);
  }
  if (webBlock) {
    const zip = path.join(dist, 'web', `${webBlock.bundleId}.zip`);
    stage(zip, 'web');
    if (fs.existsSync(zip + '.sig')) stage(zip + '.sig', 'web');
  }
  if (contentBlock) {
    const json = path.join(dist, 'content', `content-${contentBlock.version}.json`);
    stage(json, 'content');
    if (fs.existsSync(json + '.sig')) stage(json + '.sig', 'content');
  }

  const siteFile = path.join(siteDir, 'manifest.json');
  fs.writeFileSync(siteFile, text);
  fs.writeFileSync(path.join(siteFile + '.sig'), signature + '\n');
  fs.writeFileSync(path.join(dist, 'manifest.json'), text);

  // Publish the artifacts next to the manifest so the site is self-contained.
  const artifactDir = path.join(siteDir, 'artifacts.json');
  fs.writeFileSync(artifactDir, JSON.stringify({
    apk: payload.apk || null,
    web: payload.web || null,
    content: payload.content || null,
    generatedAt: payload.generatedAt
  }, null, 2) + '\n');

  console.log(`Manifest: ${path.relative(root, siteFile)}`);
  console.log(`Version: ${version.versionName} (${version.versionCode}) channel=${channel}`);
  console.log(`APK: ${payload.apk ? payload.apk.url : 'not included'}`);
  console.log(`Web: ${payload.web ? payload.web.bundleId : 'not included'}`);
  console.log(`Content: ${payload.content ? payload.content.version : 'not included'}`);
  console.log(`Signature: ${signature.slice(0, 24)}… (${signature.length} chars)`);
  return manifest;
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
