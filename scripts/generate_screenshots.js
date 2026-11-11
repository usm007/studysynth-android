const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ARTIFACT_DIR = 'C:\\Users\\Admin\\.gemini\\antigravity\\brain\\ba542a41-5e7a-4320-bd56-1d5fda23b1c3';
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const DEBUG_PORT = 9888;
const BASE_URL = 'http://127.0.0.1:8199/';
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-capture-'));

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log('Starting Chrome on port', DEBUG_PORT);
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
  ], { shell: false });

  await sleep(1800);

  try {
    const listRes = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
    const pages = await listRes.json();
    const page = pages.find((p) => p.type === 'page') || pages[0];
    const wsUrl = page.webSocketDebuggerUrl;
    console.log('Connecting to page CDP:', wsUrl);

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
            if (m.error) reject(new Error(m.error.message));
            else resolve(m.result);
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
      const targetPath = path.join(ARTIFACT_DIR, filename);
      fs.writeFileSync(targetPath, buf);
      console.log(`Saved screenshot: ${filename} (${buf.length} bytes)`);
      return targetPath;
    }

    console.log('Navigating to', BASE_URL);
    await send('Page.navigate', { url: BASE_URL });
    await sleep(2000);

    // Wait until library cards exist
    for (let i = 0; i < 20; i++) {
      const count = await evaluate(`document.querySelectorAll('.lib-nav-card').length`);
      if (count > 0) {
        console.log(`Ready! Found ${count} syllabus unit cards.`);
        break;
      }
      await sleep(200);
    }

    // 1. Screenshot 1: Library View (All 10 syllabus units)
    await sleep(300);
    await capture('screenshot_1_library_units.png');

    // 2. Click Unit 1: Educational Studies
    console.log('Clicking Unit 1...');
    await evaluate(`
      const card = Array.from(document.querySelectorAll('.lib-nav-card')).find(c => c.textContent.includes('Unit 1'));
      if (card) card.click();
    `);
    await sleep(600);
    await capture('screenshot_2_unit_practice_sets.png');

    // 3. Start Practice on Set 1
    console.log('Opening Practice Mode on Practice Set 1...');
    await evaluate(`
      const btn = document.querySelector('.lib-mode-practice');
      if (btn) btn.click();
    `);
    await sleep(800);
    await capture('screenshot_3_practice_question.png');

    // 4. Select Option D to demonstrate instant feedback & answer checking
    console.log('Selecting answer Option D...');
    await evaluate(`
      const opt = Array.from(document.querySelectorAll('.q-opt')).find(o => o.getAttribute('data-key') === 'D');
      if (opt) opt.click();
    `);
    await sleep(600);
    await capture('screenshot_4_question_feedback.png');

    // 5. Switch to Exam Test Mode
    console.log('Switching to Exam Test Mode...');
    await evaluate(`
      const testTab = document.querySelector('.mode-item[data-mode="test"]');
      if (testTab) testTab.click();
    `);
    await sleep(800);
    // Click start test if test setup is shown
    await evaluate(`
      const startBtn = document.getElementById('testStartBtn');
      if (startBtn && !document.getElementById('testSetup')?.hidden) {
        startBtn.click();
      }
    `);
    await sleep(600);
    await capture('screenshot_5_exam_test_mode.png');

    ws.close();
    console.log('All screenshots completed successfully!');
  } finally {
    try { chrome.kill(); } catch (e) {}
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (e) {}
  }
}

main().catch((err) => {
  console.error('Capture script error:', err);
  process.exit(1);
});

