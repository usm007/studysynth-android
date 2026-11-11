const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ARTIFACT_DIR = 'C:\\Users\\Admin\\.gemini\\antigravity\\brain\\ba542a41-5e7a-4320-bd56-1d5fda23b1c3';
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const DEBUG_PORT = 9555;
const BASE_URL = 'http://127.0.0.1:8199/';
const TEMP_USER_DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-ss-'));

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log('Launching headless Chrome on port', DEBUG_PORT);
  const chromeProc = spawn(CHROME_PATH, [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    `--user-data-dir=${TEMP_USER_DATA}`,
    '--no-first-run',
    '--no-default-browser-check',
    `--remote-debugging-port=${DEBUG_PORT}`,
    '--window-size=1280,920',
    BASE_URL
  ]);

  await sleep(2500);

  try {
    const listRes = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
    const pages = await listRes.json();
    const page = pages.find((p) => p.url.includes('8199')) || pages[0];
    const wsUrl = page.webSocketDebuggerUrl;
    console.log('Connecting to page WebSocket:', wsUrl);

    const ws = new WebSocket(wsUrl);
    await new Promise((resolve) => ws.addEventListener('open', resolve, { once: true }));

    let idCounter = 1;
    const callbacks = new Map();

    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && callbacks.has(msg.id)) {
        callbacks.get(msg.id)(msg);
        callbacks.delete(msg.id);
      }
    });

    function send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const id = idCounter++;
        callbacks.set(id, (msg) => {
          if (msg.error) reject(new Error(`${method} failed: ${msg.error.message}`));
          else resolve(msg.result);
        });
        ws.send(JSON.stringify({ id, method, params }));
      });
    }

    await send('Page.enable');
    await send('Runtime.enable');

    async function evalCode(expression) {
      const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      return res.result ? res.result.value : null;
    }

    async function capture(filename) {
      const res = await send('Page.captureScreenshot', { format: 'png' });
      const buffer = Buffer.from(res.data, 'base64');
      const fullPath = path.join(ARTIFACT_DIR, filename);
      fs.writeFileSync(fullPath, buffer);
      console.log(`Saved screenshot: ${filename} (${buffer.length} bytes)`);
      return fullPath;
    }

    // Wait until library cards render
    console.log('Waiting for syllabus cards to render...');
    for (let i = 0; i < 30; i++) {
      const count = await evalCode(`document.querySelectorAll('.lib-nav-card').length`);
      if (count > 0) {
        console.log(`Ready! Found ${count} syllabus unit cards.`);
        break;
      }
      await sleep(200);
    }

    // 1. Library Overview (Syllabus Units)
    await sleep(500);
    await capture('screenshot_1_library_units.png');

    // 2. Click into Unit 1: Educational Studies
    console.log('Opening Unit 1...');
    await evalCode(`
      const card = Array.from(document.querySelectorAll('.lib-nav-card')).find(c => c.textContent.includes('Unit 1'));
      if (card) card.click();
    `);
    await sleep(800);
    await capture('screenshot_2_unit_practice_sets.png');

    // 3. Click Practice on Practice Set 1
    console.log('Launching Practice Mode on Set 1...');
    await evalCode(`
      const btn = document.querySelector('.lib-mode-practice');
      if (btn) btn.click();
    `);
    await sleep(800);
    await capture('screenshot_3_practice_question.png');

    // 4. Click Option D (Positive relativism)
    console.log('Answering Question 1...');
    await evalCode(`
      const optD = Array.from(document.querySelectorAll('.q-opt')).find(o => o.getAttribute('data-key') === 'D');
      if (optD) optD.click();
    `);
    await sleep(600);
    await capture('screenshot_4_question_feedback.png');

    // 5. Switch to Exam Test Mode
    console.log('Switching to Exam Test Mode...');
    await evalCode(`
      const testTab = document.querySelector('.mode-item[data-mode="test"]');
      if (testTab) testTab.click();
    `);
    await sleep(800);
    await capture('screenshot_5_exam_test_mode.png');

    ws.close();
    console.log('Done capturing all screenshots!');
  } finally {
    try { chromeProc.kill(); } catch (e) {}
    try { fs.rmSync(TEMP_USER_DATA, { recursive: true, force: true }); } catch (e) {}
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

