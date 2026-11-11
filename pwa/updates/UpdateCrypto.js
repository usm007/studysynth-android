/**
 * StudySynth update cryptography.
 *
 * - SHA-256 digests via crypto.subtle (available in every supported WebView).
 * - RSASSA-PKCS1-v1_5 / SHA-256 signatures. RSA is required because the
 *   Capacitor live-update plugin verifies bundle signatures natively with
 *   `SHA256withRSA`; the same key signs manifests and content packages.
 * - Canonical JSON identical to scripts/updates/canonical.js.
 *
 * Every function fails closed: malformed input returns false / null instead of
 * throwing, because these run against data downloaded from the network.
 */
(function (global) {
  'use strict';

  function canonicalize(value) {
    if (value === undefined) return undefined;
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) {
      return '[' + value.map(function (item) { return item === undefined ? 'null' : canonicalize(item); }).join(',') + ']';
    }
    var keys = Object.keys(value).filter(function (key) { return value[key] !== undefined; }).sort();
    return '{' + keys.map(function (key) { return JSON.stringify(key) + ':' + canonicalize(value[key]); }).join(',') + '}';
  }

  function canonicalBytes(value) {
    var text = canonicalize(value);
    if (text === undefined) return null;
    return new TextEncoder().encode(text);
  }

  function base64ToBytes(b64) {
    try {
      var normalised = String(b64 || '').replace(/\s+/g, '');
      var binary = atob(normalised);
      var bytes = new Uint8Array(binary.length);
      for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return bytes;
    } catch (err) {
      return null;
    }
  }

  function bytesToHex(buffer) {
    var bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    var out = '';
    for (var i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, '0');
    return out;
  }

  function getSubtle() {
    var cryptoObj = global.crypto || (typeof crypto !== 'undefined' ? crypto : null);
    return cryptoObj && cryptoObj.subtle ? cryptoObj.subtle : null;
  }

  async function sha256Hex(buffer) {
    var subtle = getSubtle();
    if (!subtle) return null;
    try {
      var digest = await subtle.digest('SHA-256', buffer);
      return bytesToHex(digest);
    } catch (err) {
      return null;
    }
  }

  async function sha256BytesHex(bytes) {
    return sha256Hex(bytes);
  }

  var keyCache = Object.create(null);

  async function importPublicKey(publicKeyB64) {
    if (keyCache[publicKeyB64]) return keyCache[publicKeyB64];
    var subtle = getSubtle();
    if (!subtle) return null;
    var spki = base64ToBytes(publicKeyB64);
    if (!spki) return null;
    try {
      var key = await subtle.importKey(
        'spki',
        spki,
        { name: 'RSASSA-PKCS1-v1_5', hash: { name: 'SHA-256' } },
        false,
        ['verify']
      );
      keyCache[publicKeyB64] = key;
      return key;
    } catch (err) {
      return null;
    }
  }

  /**
   * Verifies an RSASSA-PKCS1-v1_5 / SHA-256 signature over raw bytes.
   * @returns {Promise<boolean>} false for any malformed input.
   */
  async function verifyBytes(publicKeyB64, bytes, signatureB64) {
    if (!publicKeyB64 || !bytes || !signatureB64) return false;
    var key = await importPublicKey(publicKeyB64);
    if (!key) return false;
    var signature = base64ToBytes(signatureB64);
    // RSA-2048 is the smallest key this app accepts (256-byte signature).
    if (!signature || signature.length < 256) return false;
    try {
      return await getSubtle().verify({ name: 'RSASSA-PKCS1-v1_5' }, key, signature, bytes);
    } catch (err) {
      return false;
    }
  }

  async function verifySignature(publicKeyB64, value, signatureB64) {
    var bytes = canonicalBytes(value);
    if (!bytes) return false;
    return verifyBytes(publicKeyB64, bytes, signatureB64);
  }

  function isHex64(value) {
    return typeof value === 'string' && /^[0-9a-f]{64}$/i.test(value);
  }

  function timingSafeEqualHex(a, b) {
    if (!isHex64(a) || !isHex64(b)) return false;
    var left = a.toLowerCase();
    var right = b.toLowerCase();
    var diff = 0;
    for (var i = 0; i < 64; i++) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
    return diff === 0;
  }

  var api = {
    canonicalize: canonicalize,
    canonicalBytes: canonicalBytes,
    base64ToBytes: base64ToBytes,
    bytesToHex: bytesToHex,
    sha256Hex: sha256Hex,
    sha256BytesHex: sha256BytesHex,
    verifyBytes: verifyBytes,
    verifySignature: verifySignature,
    isHex64: isHex64,
    timingSafeEqualHex: timingSafeEqualHex
  };

  global.UpdateCrypto = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
