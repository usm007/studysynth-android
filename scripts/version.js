/**
 * Single source of truth for StudySynth's version identity.
 * Everything that needs a version (Gradle, web build, update manifest,
 * release scripts) reads it from version.json through this module.
 */
const fs = require('fs');
const path = require('path');

const VERSION_FILE = path.resolve(__dirname, '..', 'version.json');

function readVersion() {
  const raw = fs.readFileSync(VERSION_FILE, 'utf8');
  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    throw new Error(`version.json is not valid JSON: ${err.message}`);
  }
  const required = ['packageId', 'channel', 'versionName', 'versionCode', 'minSupportedVersionCode', 'runtimeVersion'];
  for (const key of required) {
    if (data[key] === undefined || data[key] === null || data[key] === '') {
      throw new Error(`version.json is missing "${key}"`);
    }
  }
  if (!Number.isInteger(data.versionCode) || data.versionCode <= 0) {
    throw new Error('version.json versionCode must be a positive integer');
  }
  if (!Number.isInteger(data.minSupportedVersionCode) || data.minSupportedVersionCode < 1) {
    throw new Error('version.json minSupportedVersionCode must be a positive integer');
  }
  if (data.minSupportedVersionCode > data.versionCode) {
    throw new Error('minSupportedVersionCode cannot be greater than versionCode');
  }
  if (!/^\d+\.\d+\.\d+$/.test(data.versionName)) {
    throw new Error('version.json versionName must look like 2.1.0');
  }
  return data;
}

module.exports = { readVersion, VERSION_FILE };

// `node scripts/version.js --sync` rewrites pwa/version.js from version.json so
// a version bump is one command and cannot drift. Release builds still verify
// the committed stamp independently.
if (require.main === module) {
  const version = readVersion();
  const target = path.resolve(__dirname, '..', 'pwa', 'version.js');
  const stamp = `/*\n` +
    ` * Development-time version stamp.\n` +
    ` *\n` +
    ` * Generated from version.json by "node scripts/version.js --sync".\n` +
    ` * scripts/build-web.js generates www/version.js for release builds and\n` +
    ` * fails if this copy drifts from version.json.\n` +
    ` */\n` +
    `(function (global) {\n` +
    `  'use strict';\n` +
    `  global.STUDYSYNTH_VERSION = {\n` +
    `    versionName: ${JSON.stringify(version.versionName)},\n` +
    `    versionCode: ${version.versionCode},\n` +
    `    minSupportedVersionCode: ${version.minSupportedVersionCode},\n` +
    `    runtimeVersion: ${JSON.stringify(version.runtimeVersion)},\n` +
    `    contentVersion: ${JSON.stringify(version.contentVersion)},\n` +
    `    packageId: ${JSON.stringify(version.packageId)},\n` +
    `    channel: ${JSON.stringify(version.channel)}\n` +
    `  };\n` +
    `})(typeof window !== 'undefined' ? window : globalThis);\n`;
  require('fs').writeFileSync(target, stamp);
  console.log(`pwa/version.js synced to ${version.versionName} (${version.versionCode}).`);
}
