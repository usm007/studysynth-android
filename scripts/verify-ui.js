#!/usr/bin/env node
/**
 * Headless browser verification for the mobile shell.
 *
 * Serves the built `www/` folder, loads it in Chrome, and checks the things
 * unit tests cannot: real layout, tab navigation, sheets, console cleanliness,
 * and service-worker activation. Screenshots land in `output/ui/`.
 *
 * Usage: node scripts/verify-ui.js [--keep-open]
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const ROOT = path.resolve(__dirname, '..');
const WEB_ROOT = path.join(ROOT, 'www');
const SHOT_DIR = path.join(ROOT, 'output', 'ui');

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.wasm': 'application/wasm',
};

const failures = [];
const notes = [];

function pass(label, detail) {
  console.log(`  PASS  ${label}${detail ? ` — ${detail}` : ''}`);
}

function fail(label, detail) {
  console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  failures.push(`${label}${detail ? `: ${detail}` : ''}`);
}

function check(label, condition, detail) {
  if (condition) pass(label, detail);
  else fail(label, detail);
}

function findChrome() {
  for (const candidate of CHROME_CANDIDATES) {
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch (_) {}
  }
  throw new Error('Chrome not found. Set CHROME_PATH to a Chrome executable.');
}

function startServer() {
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    let filePath = path.join(WEB_ROOT, urlPath);

    // Directory requests resolve to index.html, like GitHub Pages.
    if (urlPath.endsWith('/')) filePath = path.join(filePath, 'index.html');

    if (!filePath.startsWith(WEB_ROOT)) {
      res.writeHead(403).end('Forbidden');
      return;
    }

    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
        return;
      }
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-cache',
        'Service-Worker-Allowed': '/',
      });
      res.end(data);
    });
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, port, origin: `http://127.0.0.1:${port}` });
    });
  });
}

const VIEWPORTS = [
  { name: '360', width: 360, height: 800, deviceScaleFactor: 2 },
  { name: '412', width: 412, height: 915, deviceScaleFactor: 2 },
];

const THEMES = ['light', 'dark'];

async function collectErrors(page, bucket, origin) {
  page.on('console', (message) => {
    if (message.type() !== 'error' && message.type() !== 'warning') return;
    const text = message.text();
    // Update checks reach the real GitHub Pages manifest. Offline sandboxes and
    // CI have no reason to succeed there; the app already handles that path.
    if (/usm007\.github\.io|net::ERR_(FAILED|INTERNET_DISCONNECTED|NAME_NOT_RESOLVED|ABORTED)/.test(text)) {
      bucket.expectedOffline.push(text);
      return;
    }
    if (message.type() === 'error') bucket.console.push(text);
    else bucket.warnings.push(text);
  });

  page.on('pageerror', (error) => bucket.pageErrors.push(String(error && error.message ? error.message : error)));

  page.on('requestfailed', (request) => {
    const url = request.url();
    if (!url.startsWith(origin)) {
      bucket.expectedOffline.push(`${url} ${request.failure() ? request.failure().errorText : ''}`.trim());
      return;
    }
    bucket.requestFailures.push(`${url} ${request.failure() ? request.failure().errorText : ''}`.trim());
  });
}

async function waitForHome(page) {
  await page.waitForFunction(
    () => {
      const host = document.getElementById('homeContainer');
      return !!host && !/Loading your workspace/.test(host.textContent || '');
    },
    { timeout: 20000 }
  );
}

async function activeView(page) {
  return page.evaluate(() => {
    const ids = ['homeView', 'libraryView', 'revisionView', 'analysisView', 'quizView'];
    const visible = ids.filter((id) => {
      const el = document.getElementById(id);
      return el && getComputedStyle(el).display !== 'none';
    });
    return { mode: document.body.getAttribute('data-mode'), visible };
  });
}

async function clickTab(page, mode) {
  await page.click(`#tabbar .tab-item[data-mode="${mode}"]`);
  await page.waitForFunction(
    (expected) => document.body.getAttribute('data-mode') === expected,
    { timeout: 8000 },
    mode
  );
  // Rendering happens synchronously after the mode flips; give layout a frame.
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function runViewport(browser, origin, viewport, theme) {
  // A fresh context keeps each screenshot honest: no saved theme or study
  // history from the previous pass leaks into the next one.
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  const bucket = { console: [], pageErrors: [], requestFailures: [], warnings: [], expectedOffline: [] };
  await collectErrors(page, bucket, origin);

  await page.setViewport({
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: viewport.deviceScaleFactor,
    isMobile: true,
    hasTouch: true,
  });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: theme }]);

  const label = `${viewport.name}px ${theme}`;
  console.log(`\n[${label}]`);

  await page.goto(`${origin}/index.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await waitForHome(page);

  const home = await activeView(page);
  check(`${label}: lands on Home`, home.mode === 'home' && home.visible.includes('homeView'), JSON.stringify(home));

  const tabCount = await page.$$eval('#tabbar .tab-item', (items) => items.length);
  check(`${label}: four primary destinations`, tabCount === 4, `${tabCount} tabs`);

  const homeCards = await page.$$eval('#homeContainer [data-action], #homeContainer .home-card, #homeContainer button', (els) => els.length);
  check(`${label}: home renders actionable content`, homeCards > 0, `${homeCards} interactive elements`);

  await page.screenshot({ path: path.join(SHOT_DIR, `home-${viewport.name}-${theme}.png`) });

  // Tab round trip. Each destination must show exactly one primary view.
  for (const mode of ['library', 'revision', 'analysis', 'home']) {
    await clickTab(page, mode);
    const view = await activeView(page);
    const expectedView = mode === 'analysis' ? 'analysisView' : `${mode}View`;
    const ok = view.mode === mode && view.visible.length === 1 && view.visible[0] === expectedView;
    check(`${label}: tab → ${mode}`, ok, JSON.stringify(view));
    if (mode !== 'home') {
      await page.screenshot({ path: path.join(SHOT_DIR, `${mode}-${viewport.name}-${theme}.png`) });
    }
  }

  // Update Centre opens, reports state, and closes.
  await page.click('#updateBadge');
  await page.waitForFunction(
    () => {
      const sheet = document.getElementById('updateSheet');
      return sheet && sheet.classList.contains('open');
    },
    { timeout: 8000 }
  );
  await page.waitForFunction(
    () => {
      const body = document.getElementById('updateSheetBody');
      return body && !/Reading update status/.test(body.textContent || '');
    },
    { timeout: 10000 }
  );
  const updateText = await page.$eval('#updateSheetBody', (el) => (el.textContent || '').replace(/\s+/g, ' ').trim());
  check(`${label}: Update Centre shows status`, updateText.length > 20, updateText.slice(0, 90));
  await page.screenshot({ path: path.join(SHOT_DIR, `updates-${viewport.name}-${theme}.png`) });

  // A downloaded installer and a retained previous content package must each
  // produce a usable button, not a hidden or dead one.
  await page.evaluate(() => {
    window.UpdateCoordinator.getStatus = async () => ({
      installed: {
        versionName: '2.1.0',
        versionCode: 4,
        contentVersion: '2026.11.2',
        contentSource: 'pack',
        contentPreviousVersion: '2026.11.1',
        webBundleId: 'bundle-4'
      },
      native: true,
      liveUpdate: true,
      apkUpdate: true,
      lastCheckAt: Date.now(),
      lastCheckOk: true,
      lastError: '',
      available: { versionName: '2.1.1', apk: true, web: true, content: true, blocked: [] },
      settings: { auto: true, wifiOnly: true },
      apkState: { status: 'downloaded', versionCode: 5 }
    });
    return window.UpdateUI.refresh();
  });
  const updateActions = await page.$$eval('#updateSheetBody [data-update-action]', (buttons) => buttons.map((button) => ({
    action: button.getAttribute('data-update-action'),
    hidden: button.hidden,
    disabled: button.disabled
  })));
  const usableAction = (action) => updateActions.some((item) => item.action === action && !item.hidden && !item.disabled);
  check(`${label}: Update Centre offers the downloaded install`, usableAction('install'), JSON.stringify(updateActions));
  check(`${label}: Update Centre offers content rollback`, usableAction('content-rollback'), JSON.stringify(updateActions));

  await page.click('#updateSheetClose');
  await page.waitForFunction(
    () => !document.getElementById('updateSheet').classList.contains('open'),
    { timeout: 8000 }
  );
  pass(`${label}: Update Centre closes`);

  // No horizontal overflow at phone widths.
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth };
  });
  check(
    `${label}: no horizontal overflow`,
    overflow.scrollWidth <= overflow.clientWidth + 1,
    `${overflow.scrollWidth} <= ${overflow.clientWidth}`
  );

  check(`${label}: no page errors`, bucket.pageErrors.length === 0, bucket.pageErrors.join(' | ') || 'none');
  check(`${label}: no console errors`, bucket.console.length === 0, bucket.console.join(' | ') || 'none');
  check(`${label}: no failed local requests`, bucket.requestFailures.length === 0, bucket.requestFailures.join(' | ') || 'none');

  if (bucket.warnings.length) {
    notes.push(`${label} warnings: ${bucket.warnings.join(' | ')}`);
  }
  if (bucket.expectedOffline.length) {
    notes.push(`${label}: ${bucket.expectedOffline.length} offline update request(s) ignored`);
  }

  // Service worker: only worth asserting once, on the first page.
  page.__context = context;
  return page;
}

async function verifyServiceWorker(page) {
  console.log('\n[service worker]');
  const result = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return { supported: false };
    const registration = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((resolve) => setTimeout(() => resolve(null), 15000)),
    ]);
    if (!registration) return { supported: true, ready: false };
    const names = await caches.keys();
    return { supported: true, ready: true, active: !!registration.active, caches: names };
  });

  check('service worker is supported', result.supported === true);
  check('service worker activates', result.ready === true && result.active === true, JSON.stringify(result));
  const cacheCount = Array.isArray(result.caches) ? result.caches.length : 0;
  check('exactly one versioned cache', cacheCount === 1, JSON.stringify(result.caches || []));
}

async function verifyQuizFlow(page) {
  console.log('\n[exam shell]');
  // Library → first module → timed test. This exercises the real content path
  // plus the exam-only controls (timer, palette, mark-for-review, submit).
  await clickTab(page, 'library');
  const moduleSelector = '#libraryContainer .lib-mode-test:not([disabled])';
  const hasModules = await page.$(moduleSelector);
  if (!hasModules) {
    fail('library exposes study modules');
    return;
  }
  await page.click(moduleSelector);
  await page.waitForFunction(
    () => document.body.getAttribute('data-mode') === 'test',
    { timeout: 15000 }
  );

  const setupVisible = await page.evaluate(() => {
    const setup = document.getElementById('testSetup');
    return !!setup && !setup.hidden;
  });
  check('test opens on the setup screen', setupVisible === true);

  await page.click('#chapterStartBtn');
  await page.waitForFunction(
    () => {
      const q = document.getElementById('questionContainer');
      return document.body.getAttribute('data-test-setup') === 'false' && !!q && (q.textContent || '').trim().length > 20;
    },
    { timeout: 15000 }
  );

  const exam = await page.evaluate(() => ({
    mode: document.body.getAttribute('data-mode'),
    question: (document.getElementById('questionContainer') || {}).textContent || '',
    palette: !!document.getElementById('paletteToggle'),
    mark: !!document.getElementById('markReviewBtn') && !document.getElementById('markReviewBtn').hidden,
    timer: (document.getElementById('examTimer') || {}).textContent || '',
  }));

  check('starts a timed exam', exam.mode === 'test', exam.mode);
  check('question content is rendered', exam.question.trim().length > 20, `${exam.question.trim().length} chars`);
  check('exam timer is running', /^\d{1,3}:\d{2}$/.test(exam.timer), exam.timer);
  check('exam palette control present', exam.palette === true);
  check('mark-for-review control present', exam.mark === true);

  // Mark the current question, then confirm it shows up in the palette.
  await page.click('#markReviewBtn');
  const markedState = await page.$eval('#markReviewBtn', (btn) => ({
    pressed: btn.getAttribute('aria-pressed'),
    label: (btn.textContent || '').trim(),
  }));
  check('mark-for-review toggles on', markedState.pressed === 'true', markedState.label);

  await page.click('#paletteToggle');
  await page.waitForFunction(
    () => document.getElementById('paletteSheet').classList.contains('open'),
    { timeout: 8000 }
  );
  const palette = await page.evaluate(() => {
    const cells = Array.from(document.querySelectorAll('#mobilePalette button'));
    return {
      count: cells.length,
      marked: cells.filter((cell) => cell.classList.contains('marked')).length,
      currentMarked: !!document.querySelector('#mobilePalette button.current.marked'),
    };
  });
  check('palette sheet lists questions', palette.count > 0, `${palette.count} cells`);
  check('palette flags the marked question', palette.marked === 1 && palette.currentMarked === true, JSON.stringify(palette));
  await page.screenshot({ path: path.join(SHOT_DIR, 'exam-palette-412-light.png') });
  await page.click('#paletteSheetClose');
  await page.waitForFunction(
    () => !document.getElementById('paletteSheet').classList.contains('open'),
    { timeout: 8000 }
  );
  check('palette sheet closes without leaving the session', (await page.evaluate(() => document.body.getAttribute('data-mode'))) === 'test');

  // Submitting asks for confirmation first, then shows the scorecard.
  let dialogMessage = '';
  let dismissed = false;
  const dismissPromise = new Promise((resolve) => {
    page.once('dialog', async (dialog) => {
      dialogMessage = dialog.message();
      dismissed = true;
      await dialog.dismiss();
      resolve();
    });
  });
  await page.click('#examSubmitBtn');
  await dismissPromise;
  await page.waitForFunction(() => true);
  const stillRunning = await page.evaluate(() => document.body.getAttribute('data-mode'));
  const scoreHiddenAfterCancel = await page.evaluate(() => {
    const modal = document.getElementById('scoreModal');
    return !modal || !modal.classList.contains('open');
  });
  check('submit asks for confirmation', dismissed && /Submit this test now/i.test(dialogMessage), dialogMessage.split('\n')[0]);
  check('cancelling submit keeps the exam running', stillRunning === 'test' && scoreHiddenAfterCancel, stillRunning);

  const acceptPromise = new Promise((resolve) => {
    page.once('dialog', async (dialog) => {
      await dialog.accept();
      resolve();
    });
  });
  await page.click('#examSubmitBtn');
  await acceptPromise;
  await page.waitForFunction(
    () => {
      const modal = document.getElementById('scoreModal');
      return !!modal && modal.classList.contains('open');
    },
    { timeout: 10000 }
  );
  const score = await page.evaluate(() => ({
    title: (document.getElementById('scoreTitle') || {}).textContent || '',
    max: (document.getElementById('scoreMax') || {}).textContent || '',
    correct: (document.getElementById('scoreCorrect') || {}).textContent || '',
  }));
  check('results scorecard appears after submit', score.max.length > 0, `${score.title} ${score.max}`);
  await page.screenshot({ path: path.join(SHOT_DIR, 'exam-results-412-light.png') });

  await page.click('#scoreCloseBtn');
  await clickTab(page, 'home');
  pass('bottom navigation returns to Home after an exam');
}

async function main() {
  if (!fs.existsSync(path.join(WEB_ROOT, 'index.html'))) {
    throw new Error('www/index.html is missing. Run `node scripts/build-web.js` first.');
  }
  fs.mkdirSync(SHOT_DIR, { recursive: true });

  const executablePath = findChrome();
  const { server, origin } = await startServer();
  console.log(`Serving ${WEB_ROOT} at ${origin}`);

  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--font-render-hinting=none'],
  });

  let firstPage = null;
  try {
    for (const viewport of VIEWPORTS) {
      for (const theme of THEMES) {
        const page = await runViewport(browser, origin, viewport, theme);
        if (!firstPage) firstPage = page;
        else await page.__context.close();
      }
    }

    if (firstPage) {
      await verifyServiceWorker(firstPage);
      await verifyQuizFlow(firstPage);
    }
  } finally {
    await browser.close();
    server.close();
  }

  if (notes.length) {
    console.log('\nNotes');
    for (const note of notes) console.log(`  - ${note}`);
  }

  console.log(`\nScreenshots: ${SHOT_DIR}`);
  if (failures.length) {
    console.error(`\n${failures.length} check(s) failed:`);
    for (const item of failures) console.error(`  - ${item}`);
    process.exitCode = 1;
  } else {
    console.log('\nAll UI checks passed.');
  }
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
