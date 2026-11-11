/**
 * Reads an APK's identity without Android Studio.
 *
 * Uses aapt2 (package id, version) and apksigner (signing certificate digest)
 * from the Android SDK build-tools. Both ship with the SDK; if they are
 * missing this reports exactly what it could not read instead of guessing.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, execSync } = require('child_process');

function sdkCandidates() {
  const fromEnv = [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT].filter(Boolean);
  const home = os.homedir();
  return fromEnv.concat([
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk') : '',
    path.join(home, 'Android', 'Sdk'),
    path.join(home, 'Library', 'Android', 'sdk')
  ]).filter(Boolean);
}

function findBuildTools() {
  const sdk = sdkCandidates().find((dir) => fs.existsSync(path.join(dir, 'build-tools')));
  if (!sdk) return null;
  const dir = path.join(sdk, 'build-tools');
  const versions = fs.readdirSync(dir)
    .filter((name) => /^\d+\.\d+\.\d+$/.test(name))
    .sort((a, b) => {
      const pa = a.split('.').map(Number);
      const pb = b.split('.').map(Number);
      for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pb[i] - pa[i];
      return 0;
    });
  if (!versions.length) return null;
  return path.join(dir, versions[0]);
}

function run(file, args) {
  try {
    // Windows batch wrappers (apksigner.bat) cannot be spawned directly by
    // Node; they need cmd.exe and quoted arguments.
    if (process.platform === 'win32' && /\.(bat|cmd)$/i.test(file)) {
      const command = [file].concat(args).map((part) => `"${part}"`).join(' ');
      return execSync(command, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    }
    return execFileSync(file, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (err) {
    const stderr = err.stderr ? String(err.stderr) : '';
    throw new Error(`${path.basename(file)} failed: ${stderr.trim() || err.message}`);
  }
}

function readApkInfo(apkPath) {
  const file = path.resolve(apkPath);
  if (!fs.existsSync(file)) throw new Error(`APK not found: ${file}`);
  const buildTools = findBuildTools();
  if (!buildTools) throw new Error('Android build-tools not found. Set ANDROID_HOME.');

  const aapt = process.platform === 'win32' ? 'aapt2.exe' : 'aapt2';
  const apksigner = process.platform === 'win32' ? 'apksigner.bat' : 'apksigner';
  const badging = run(path.join(buildTools, aapt), ['dump', 'badging', file]);
  const packageLine = badging.split(/\r?\n/).find((line) => line.startsWith('package:')) || '';
  const packageId = (packageLine.match(/name='([^']+)'/) || [])[1] || '';
  const versionCode = Number((packageLine.match(/versionCode='(\d+)'/) || [])[1]) || 0;
  const versionName = (packageLine.match(/versionName='([^']+)'/) || [])[1] || '';

  const certs = run(path.join(buildTools, apksigner), ['verify', '-v', '--print-certs', file]);
  const digests = Array.from(certs.matchAll(/certificate SHA-256 digest:\s*([0-9a-fA-F]+)/g))
    .map((match) => match[1].toLowerCase());
  const schemes = Array.from(certs.matchAll(/Verified using v(\d+) scheme[^:]*:\s*(true|false)/g))
    .reduce((acc, match) => {
      acc['v' + match[1]] = match[2] === 'true';
      return acc;
    }, {});

  if (!packageId) throw new Error('Could not read the package id from the APK.');
  if (!digests.length) throw new Error('Could not read the signing certificate from the APK.');

  return {
    file,
    packageId,
    versionCode,
    versionName,
    certSha256: digests[0],
    certSha256All: digests,
    signatureSchemes: schemes,
    size: fs.statSync(file).size
  };
}

if (require.main === module) {
  try {
    const info = readApkInfo(process.argv[2]);
    console.log(JSON.stringify(info, null, 2));
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

module.exports = { readApkInfo, findBuildTools };
