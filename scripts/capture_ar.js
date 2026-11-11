const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ARTIFACT_DIR = 'C:\\Users\\Admin\\.gemini\\antigravity\\brain\\ba542a41-5e7a-4320-bd56-1d5fda23b1c3';
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const DEBUG_PORT = 9899;
const BASE_URL = 'http://127.0.0.1:8199/';
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-capture2-'));

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const chrome = spawn(CHROME_PATH, [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${tempDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1280,900',
    'about:blank'
  ]);

  await sleep(1500);

  try {
    const listRes = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
    const pages = await listRes.json();
    const wsUrl = pages[0].webSocketDebuggerUrl;

    const ws = new WebSocket(wsUrl);
    await new Promise((resolve) => ws.addEventListener('open', resolve, { once: true }));

    let id = 1;
    function send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const cur = id++;
        const handler = (e) => {
          const m = JSON.parse(e.data);
          if (m.id === cur) {
            ws.removeEventListener('message', handler);
            resolve(m.result);
          }
        };
        ws.addEventListener('message', handler);
        ws.send(JSON.stringify({ id: cur, method, params }));
      });
    }

    await send('Page.enable');
    await send('Runtime.enable');

    async function evaluate(code) {
      const res = await send('Runtime.evaluate', { expression: code, returnByValue: true, awaitPromise: true });
      return res.result ? res.result.value : null;
    }

    async function capture(filename) {
      const res = await send('Page.captureScreenshot', { format: 'png' });
      const buf = Buffer.from(res.data, 'base64');
      fs.writeFileSync(path.join(ARTIFACT_DIR, filename), buf);
      console.log(`Saved screenshot: ${filename} (${buf.length} bytes)`);
    }

    await send('Page.navigate', { url: BASE_URL });
    await sleep(2000);

    // Open Unit 1 -> Set 1
    await evaluate(`
      const card = Array.from(document.querySelectorAll('.lib-nav-card')).find(c => c.textContent.includes('Unit 1'));
      if (card) card.click();
    `);
    await sleep(600);
    await evaluate(`
      const btn = document.querySelector('.lib-mode-practice');
      if (btn) btn.click();
    `);
    await sleep(800);

    // Click Question 19 in Palette
    await evaluate(`
      const palBtns = document.querySelectorAll('.palette-btn');
      if (palBtns.length >= 19) palBtns[18].click();
    `);
    await sleep(700);

    // Select correct option B
    await evaluate(`
      const optB = Array.from(document.querySelectorAll('.q-opt')).find(o => o.getAttribute('data-key') === 'B');
      if (optB) optB.click();
    `);
    await sleep(600);

    await capture('screenshot_4_assertion_reason.png');
    ws.close();
  } finally {
    try { chrome.kill(); } catch (e) {}
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (e) {}
  }
}

main().catch(console.error);

