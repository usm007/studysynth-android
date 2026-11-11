#!/usr/bin/env node
/**
 * Asserts a built APK is exactly the release we intend to publish.
 *
 * Checks package identity, version numbers, the signing certificate digest and
 * the presence of a modern signature scheme. A mismatch here means the APK
 * would either fail to install over an existing copy or fail the app's own
 * update verification, so the release must stop.
 *
 * Usage: node scripts/updates/check-apk.js <apk> [--expect-cert <sha256>]
 * Env: EXPECTED_CERT_SHA256
 */
const path = require('path');
const { readApkInfo } = require('./apk-info');
const { readVersion } = require('../version');

function parseArgs(argv) {
  const args = { apk: null, expectCert: process.env.EXPECTED_CERT_SHA256 || '' };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--expect-cert') args.expectCert = String(argv[++i] || '').toLowerCase();
    else if (!args.apk) args.apk = arg;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!args.apk) throw new Error('Usage: node scripts/updates/check-apk.js <apk> [--expect-cert <sha256>]');
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const version = readVersion();
  const info = readApkInfo(path.resolve(args.apk));
  const problems = [];

  if (info.packageId !== version.packageId) {
    problems.push(`packageId is ${info.packageId}, expected ${version.packageId}`);
  }
  if (info.versionCode !== version.versionCode) {
    problems.push(`versionCode is ${info.versionCode}, expected ${version.versionCode}`);
  }
  if (info.versionName !== version.versionName) {
    problems.push(`versionName is ${info.versionName}, expected ${version.versionName}`);
  }
  if (!args.expectCert) {
    problems.push('No expected certificate digest supplied (--expect-cert or EXPECTED_CERT_SHA256).');
  } else if (!info.certSha256All.includes(args.expectCert)) {
    problems.push(`signing certificate ${info.certSha256} does not match the expected identity ${args.expectCert}`);
  }
  if (!info.signatureSchemes.v2) {
    problems.push('APK Signature Scheme v2 is missing; Android 11+ will refuse or warn on install.');
  }

  if (problems.length) {
    console.error(`APK check failed for ${info.file}:`);
    problems.forEach((problem) => console.error('  - ' + problem));
    process.exit(1);
  }

  console.log(
    `APK OK: ${info.packageId} ${info.versionName} (${info.versionCode}) ` +
    `cert=${info.certSha256} v2=${info.signatureSchemes.v2} size=${info.size}`
  );
}

try {
  main();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
