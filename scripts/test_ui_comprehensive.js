const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ARTIFACT_DIR = 'C:\\Users\\Admin\\.gemini\\antigravity\\brain\\a1c58217-4552-48d3-ba10-de93e4de9c3e';
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const DEBUG_PORT = 9335;
const HTTP_PORT = 8899;
const BASE_URL = `http://127.0.0.1:${HTTP_PORT}/`;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log('--- 1. Starting local HTTP server for PWA on port', HTTP_PORT);
  const pwaDir = path.resolve(__dirname, '..', 'pwa');
  const serverProc = spawn('python', ['-m', 'http.server', String(HTTP_PORT), '--directory', pwaDir], {
    stdio: 'ignore'
  });

  await sleep(1500);

  console.log('--- 2. Launching headless Chrome on debug port', DEBUG_PORT);
  const chromeProc = spawn(CHROME_PATH, [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    `--remote-debugging-port=${DEBUG_PORT}`,
    '--window-size=1280,900',
    'about:blank'
  ]);

  await sleep(2000);

  try {
    const listRes = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
    const pages = await listRes.json();
    const page = pages.find((p) => p.type === 'page') || pages[0];
    const wsUrl = page.webSocketDebuggerUrl;
    console.log('Connecting to Chrome CDP at:', wsUrl);

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

    async function setViewport(width, height, isMobile = false) {
      await send('Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor: 2,
        mobile: isMobile
      });
      await sleep(400);
    }

    async function capture(filename) {
      const res = await send('Page.captureScreenshot', { format: 'png' });
      const buffer = Buffer.from(res.data, 'base64');
      const fullPath = path.join(ARTIFACT_DIR, filename);
      fs.writeFileSync(fullPath, buffer);
      console.log(`[Screenshot Saved] ${filename} (${Math.round(buffer.length / 1024)} KB)`);
      return fullPath;
    }

    console.log('--- 3. Loading PWA at', BASE_URL);
    await send('Page.navigate', { url: BASE_URL });
    await sleep(2500);

    // =========================================================================
    // 1. SMARTPHONE (390 x 844) - LIGHT MODE
    // =========================================================================
    console.log('\n=== 1. SMARTPHONE (390 x 844) - LIGHT MODE ===');
    await setViewport(390, 844, true);
    // Ensure light mode
    await evalCode(`
      const current = document.documentElement.getAttribute('data-theme');
      if (current === 'dark') document.getElementById('themeToggle').click();
    `);
    await sleep(400);

    // 1.1 Library Screen
    await capture('01_phone_library_light.png');

    // 1.2 Open Practice for Unit 1
    await evalCode(`
      const card = Array.from(document.querySelectorAll('.library-card')).find(c => c.textContent.includes('Unit 1') || c.textContent.includes('Educational Studies'));
      if (card) card.querySelector('.lib-mode-practice').click();
    `);
    await sleep(800);
    await capture('02_phone_practice_light.png');

    // 1.3 Click Topic Test button in Quiz header
    await evalCode(`document.getElementById('inQuizTopicTestBtn').click();`);
    await sleep(800);
    await capture('03_phone_topic_test_setup_light.png');

    // 1.4 Switch to Universal Exam Center tab
    await evalCode(`document.getElementById('pillUniversalTest').click();`);
    await sleep(800);
    await capture('04_phone_universal_test_light.png');

    // 1.5 Switch back to Topic Test tab and start the test
    await evalCode(`
      document.getElementById('pillChapterTest').click();
      const countSel = document.getElementById('chapterQuestionCount');
      if (countSel && countSel.options.length > 1) {
        countSel.selectedIndex = 1;
        countSel.dispatchEvent(new Event('change'));
      }
      document.getElementById('chapterStartBtn').click();
    `);
    await sleep(1000);
    await capture('05_phone_active_test_light.png');

    // 1.6 Select Option and Submit Test for Scorecard
    await evalCode(`
      const firstOpt = document.querySelector('.opt');
      if (firstOpt) firstOpt.click();
      document.getElementById('examSubmitBtn').click();
    `);
    await sleep(1000);
    await capture('06_phone_scorecard_modal_light.png');

    // Close scorecard and return to Library
    await evalCode(`
      document.getElementById('scoreCloseBtn').click();
      document.getElementById('brandLogo').click();
    `);
    await sleep(800);

    // =========================================================================
    // 2. SMARTPHONE (390 x 844) - DARK MODE
    // =========================================================================
    console.log('\n=== 2. SMARTPHONE (390 x 844) - DARK MODE ===');
    // Toggle dark mode via the theme toggle button
    await evalCode(`document.getElementById('themeToggle').click();`);
    await sleep(600);

    // 2.1 Library in Dark Mode
    await capture('07_phone_library_dark.png');

    // 2.2 Click Exam Test on Unit 2: History, Politics & Economics of Education
    await evalCode(`
      const card2 = Array.from(document.querySelectorAll('.library-card')).find(c => c.textContent.includes('Unit 2') || c.textContent.includes('History'));
      if (card2) card2.querySelector('.lib-mode-test').click();
    `);
    await sleep(800);
    await capture('08_phone_topic_test_setup_dark.png');

    // 2.3 Switch to Universal Exam Center in Dark Mode
    await evalCode(`document.getElementById('pillUniversalTest').click();`);
    await sleep(800);
    await capture('09_phone_universal_test_dark.png');

    // 2.4 Start Topic Test in Dark Mode
    await evalCode(`
      document.getElementById('pillChapterTest').click();
      document.getElementById('chapterStartBtn').click();
    `);
    await sleep(1000);
    await capture('10_phone_active_test_dark.png');

    // Return to Library
    await evalCode(`document.getElementById('brandLogo').click();`);
    await sleep(800);

    // =========================================================================
    // 3. TABLET (820 x 1180) - LIGHT & DARK MODE
    // =========================================================================
    console.log('\n=== 3. TABLET (820 x 1180) - RESPONSIVE VERIFICATION ===');
    await setViewport(820, 1180, false);
    // Switch to Light Mode
    await evalCode(`document.getElementById('themeToggle').click();`);
    await sleep(600);

    // 3.1 Tablet Library Light
    await capture('11_tablet_library_light.png');

    // 3.2 Tablet Chapter Test Setup (click Exam Test on CTET CDP: Growth & Development)
    await evalCode(`
      // Switch to CTET tab
      const ctetTab = document.querySelector('.exam-tab-btn[data-exam="ctet"]');
      if (ctetTab) ctetTab.click();
    `);
    await sleep(800);
    await evalCode(`
      const ctetCard = Array.from(document.querySelectorAll('.library-card')).find(c => c.textContent.includes('Growth') || c.textContent.includes('CDP'));
      if (ctetCard) ctetCard.querySelector('.lib-mode-test').click();
    `);
    await sleep(800);
    await capture('12_tablet_topic_test_setup_light.png');

    // 3.3 Tablet Universal Exam Center Light (Mock Cards Grid & Multi-Topic Builder)
    await evalCode(`document.getElementById('pillUniversalTest').click();`);
    await sleep(800);
    await capture('13_tablet_universal_test_light.png');

    // 3.4 Tablet Dark Mode Toggle
    await evalCode(`document.getElementById('themeToggle').click();`);
    await sleep(600);
    await capture('14_tablet_universal_test_dark.png');

    // 3.5 Tablet Topic Test Setup in Dark Mode
    await evalCode(`document.getElementById('pillChapterTest').click();`);
    await sleep(800);
    await capture('15_tablet_topic_test_setup_dark.png');

    console.log('\n✨ ALL 15 RIGOROUS REAL-BROWSER SCREENSHOTS CAPTURED SUCCESSFULLY!');

  } catch (err) {
    console.error('Error during testing:', err);
    process.exitCode = 1;
  } finally {
    try { chromeProc.kill(); } catch (e) {}
    try { serverProc.kill(); } catch (e) {}
  }
}

main();
