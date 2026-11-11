/**
 * Signing key handling for update artifacts.
 *
 * The private key never lives in the repository. CI supplies it as the
 * OTA_SIGNING_KEY secret (base64 PKCS#8 DER); local builds read it from
 * OTA_SIGNING_KEY_FILE or ~/.studysynth/update-signing-key.pem.
 *
 * Algorithm: RSA-3072 with SHA-256 (PKCS#1 v1.5), required by the Capacitor
 * live-update plugin's native `SHA256withRSA` verification.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_KEY_FILE = path.join(os.homedir(), '.studysynth', 'update-signing-key.pem');

function loadPrivateKey() {
  const inline = process.env.OTA_SIGNING_KEY;
  if (inline && inline.trim()) {
    const normalised = inline.trim().replace(/\\n/g, '\n');
    if (normalised.includes('BEGIN')) return crypto.createPrivateKey(normalised);
    return crypto.createPrivateKey({ key: Buffer.from(normalised, 'base64'), format: 'der', type: 'pkcs8' });
  }
  const file = process.env.OTA_SIGNING_KEY_FILE || DEFAULT_KEY_FILE;
  if (!fs.existsSync(file)) {
    throw new Error(
      `No signing key found. Set OTA_SIGNING_KEY (base64 PKCS#8) or place the key at ${file}.\n` +
      'Generate one with: node scripts/updates/keygen.js'
    );
  }
  return crypto.createPrivateKey(fs.readFileSync(file));
}

function publicKeyBase64(privateKey) {
  const spki = crypto.createPublicKey(privateKey).export({ type: 'spki', format: 'der' });
  return spki.toString('base64');
}

// RSA PKCS#1 v1.5 signatures: no dsaEncoding option, Node uses PKCS#1 v1.5
// by default for RSA keys, which is exactly what WebCrypto and the Android
// live-update plugin both verify.
function signBytes(buffer) {
  const key = loadPrivateKey();
  const signature = crypto.sign('sha256', buffer, key);
  return { signature: signature.toString('base64'), publicKey: publicKeyBase64(key) };
}

function verifyBytes(publicKeyB64, buffer, signatureB64) {
  const key = crypto.createPublicKey({ key: Buffer.from(publicKeyB64, 'base64'), format: 'der', type: 'spki' });
  return crypto.verify('sha256', buffer, key, Buffer.from(signatureB64, 'base64'));
}

module.exports = { loadPrivateKey, publicKeyBase64, signBytes, verifyBytes, DEFAULT_KEY_FILE };
