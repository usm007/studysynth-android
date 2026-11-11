/**
 * Verifies every element id the controller looks up exists in the shell.
 *
 * A missing id is a silent feature break: the binding becomes null and the
 * control does nothing. This check makes that a build failure.
 */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'pwa', 'app.js'), 'utf8');
const htmlFile = process.argv[2] || path.join(root, 'pwa', 'index.html');
const html = fs.readFileSync(htmlFile, 'utf8');

const ids = new Set();
for (const m of app.matchAll(/getElementById\('([^']+)'\)/g)) ids.add(m[1]);

const missing = [...ids].filter((id) => !html.includes('id="' + id + '"'));

console.log(`ids used: ${ids.size}`);
console.log(`missing: ${missing.length}`);
if (missing.length) {
  console.error(missing.join('\n'));
  process.exit(1);
}
