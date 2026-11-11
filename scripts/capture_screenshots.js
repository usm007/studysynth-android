const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ARTIFACT_DIR = 'C:\\Users\\Admin\\.gemini\\antigravity\\brain\\ba542a41-5e7a-4320-bd56-1d5fda23b1c3';
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const DEBUG_PORT = 9333;
const BASE_URL = 'http://127.0.0.1:8199/';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log('Launching headless Chrome on port', DEBUG_PORT);
  const chromeProc = spawn(CHROME_PATH, [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    `--remote-debugging-port=${DEBUG_PORT}`,
    '--window-size=1280,920',
    'about:blank'
  ]);

  await sleep(1500);

  try {
    // Query page target
    const listRes = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
    const pages = await listRes.json();
    const page = pages.find((p) => p.type === 'page') || pages[0];
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

    console.log('Navigating to', BASE_URL);
    await send('Page.navigate', { url: BASE_URL });
    await sleep(2000);

    // Wait for library cards to render
    for (let i = 0; i < 30; i++) {
      const count = await evalCode(`document.querySelectorAll('.lib-nav-card').length`);
      if (count > 0) {
        console.log(`Found ${count} syllabus unit cards!`);
        break;
      }
      await sleep(200);
    }

    // Screenshot 1: Library View (All 10 syllabus topics)
    await capture('screenshot_1_library_units.png');

    // Screenshot 2: Click into Unit 1 (Educational Studies)
    await evalCode(`
      const card = Array.from(document.querySelectorAll('.lib-nav-card')).find(c => c.textContent.includes('Unit 1'));
      if (card) card.click();
    `);
    await sleep(800);
    await capture('screenshot_2_unit_practice_sets.png');

    // Screenshot 3: Start Practice on Set 1
    await evalCode(`
      const practiceBtn = document.querySelector('.lib-mode-practice');
      if (practiceBtn) practiceBtn.click();
    `);
    await sleep(800);
    await capture('screenshot_3_practice_question.png');

    // Screenshot 4: Select Option D on Question 1 to see answer checking
    await evalCode(`
      const optD = Array.from(document.querySelectorAll('.q-opt')).find(o => o.textContent.includes('Positive relativism') || o.getAttribute('data-key') === 'D');
      if (optD) optD.click();
    `);
    await sleep(600);
    await capture('screenshot_4_question_feedback.png');

    // Screenshot 5: Switch to Exam Test Mode
    await evalCode(`
      const testModeBtn = document.querySelector('.mode-item[data-mode="test"]');
      if (testModeBtn) testModeBtn.click();
    `);
    await sleep(600);
    await capture('screenshot_5_exam_test_mode.png');

    ws.close();
    console.log('All screenshots captured successfully!');
  } finally {
    try { chromeProc.kill(); } catch (e) {}
  }
}

main().catch((err) => {
  console.error('Error running screenshot capture:', err);
  process.exit(1);
});
