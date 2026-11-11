const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cr-'));
const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new',
  '--no-sandbox',
  '--disable-gpu',
  '--remote-debugging-port=9876',
  `--user-data-dir=${tempDir}`,
  '--no-first-run',
  'about:blank'
], { shell: false });

setTimeout(async () => {
  try {
    const res = await fetch('http://127.0.0.1:9876/json/version');
    const json = await res.json();
    console.log('SUCCESS! Browser:', json.Browser);
  } catch (e) {
    console.error('FAIL:', e.message);
  } finally {
    try { chrome.kill(); } catch (e) {}
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (e) {}
  }
}, 2000);

