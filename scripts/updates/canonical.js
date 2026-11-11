/**
 * Deterministic JSON serialization.
 *
 * The same rules are implemented in pwa/updates/UpdateCrypto.js. If one side
 * changes, signatures stop verifying — keep them identical.
 *
 * Rules: object keys sorted, no insignificant whitespace, arrays in order,
 * `undefined` object members dropped, `undefined` array members become null.
 */
function canonicalize(value) {
  if (value === undefined) return undefined;
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return '[' + value.map((item) => (item === undefined ? 'null' : canonicalize(item))).join(',') + ']';
  }
  const keys = Object.keys(value).filter((key) => value[key] !== undefined).sort();
  return '{' + keys.map((key) => JSON.stringify(key) + ':' + canonicalize(value[key])).join(',') + '}';
}

module.exports = { canonicalize };
