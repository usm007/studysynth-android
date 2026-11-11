/**
 * Signs a release artifact.
 *
 * Two modes:
 *   node scripts/updates/sign.js <file>              raw bytes  -> <file>.sig
 *   node scripts/updates/sign.js --manifest <file>   canonical JSON without "signature"
 *
 * Raw-byte signatures are used for ZIP bundles and content packages (the
 * Android plugin and WebCrypto verify exactly those bytes). Manifest
 * signatures cover the canonical JSON with the signature removed.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { canonicalize } = require('./canonical');
const { signBytes } = require('./keys');

function sha256Hex(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function signFile(file) {
  const bytes = fs.readFileSync(file);
  const { signature, publicKey } = signBytes(bytes);
  const out = `${file}.sig`;
  fs.writeFileSync(out, signature + '\n');
  return { file, out, signature, publicKey, sha256: sha256Hex(bytes), size: bytes.length };
}

function signManifest(file) {
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  const payload = Object.assign({}, manifest);
  delete payload.signature;
  const { signature, publicKey } = signBytes(Buffer.from(canonicalize(payload), 'utf8'));
  const signed = Object.assign({}, payload, { signature });
  fs.writeFileSync(file, JSON.stringify(signed, null, 2) + '\n');
  return { file, signature, publicKey };
}

function main(argv) {
  const args = argv.slice(2);
  if (!args.length) {
    console.error('Usage: node scripts/updates/sign.js <file> | --manifest <file>');
    process.exit(1);
  }
  try {
    if (args[0] === '--manifest') {
      const result = signManifest(path.resolve(args[1]));
      console.log(`Signed manifest: ${result.file}`);
      console.log(`Public key: ${result.publicKey}`);
      return;
    }
    const result = signFile(path.resolve(args[0]));
    console.log(`Signed: ${result.file}`);
    console.log(`SHA-256: ${result.sha256}`);
    console.log(`Size: ${result.size}`);
    console.log(`Signature: ${result.out}`);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

if (require.main === module) main(process.argv);

module.exports = { signFile, signManifest, sha256Hex };
