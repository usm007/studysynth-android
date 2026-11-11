const { spawn } = require('child_process');

async function test() {
  const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--remote-debugging-port=9445', 'about:blank'
  ]);
  await new Promise((r) => setTimeout(r, 1500));
  const res = await fetch('http://127.0.0.1:9445/json/list');
  const pages = await res.json();
  const ws = new WebSocket(pages[0].webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));

  let id = 1;
  function send(method, params = {}) {
    return new Promise((res) => {
      const cur = id++;
      const handler = (e) => {
        const m = JSON.parse(e.data);
        if (m.id === cur) {
          ws.removeEventListener('message', handler);
          res(m.result);
        }
      };
      ws.addEventListener('message', handler);
      ws.send(JSON.stringify({ id: cur, method, params }));
    });
  }

  await send('Page.enable');
  await send('Runtime.enable');

  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.method === 'Runtime.consoleAPICalled') {
      console.log('CONSOLE:', m.params.args.map((a) => a.value || a.description).join(' '));
    }
    if (m.method === 'Runtime.exceptionThrown') {
      console.error('EXCEPTION:', m.params.exceptionDetails.text, m.params.exceptionDetails.exception?.description);
    }
  });

  console.log('Navigating...');
  await send('Page.navigate', { url: 'http://127.0.0.1:8199/' });
  
  // Wait for loadEventFired
  await new Promise((resolve) => {
    const handler = (e) => {
      const m = JSON.parse(e.data);
      if (m.method === 'Page.loadEventFired') {
        ws.removeEventListener('message', handler);
        resolve();
      }
    };
    ws.addEventListener('message', handler);
  });
  console.log('Page load event fired!');

  await new Promise((r) => setTimeout(r, 1500));

  const state = await send('Runtime.evaluate', {
    expression: `(() => ({
      href: location.href,
      bodyMode: document.body.getAttribute('data-mode'),
      quizDisplay: document.getElementById('quizView')?.style.display,
      libDisplay: document.getElementById('libraryView')?.style.display,
      cardsCount: document.querySelectorAll('.lib-nav-card').length,
      chapterCards: document.querySelectorAll('.library-card').length,
      libraryContainerHTML: document.getElementById('libraryContainer')?.innerHTML?.substring(0, 300)
    }))()`,
    returnByValue: true
  });

  console.log('STATE:', state.result.value);
  chrome.kill();
}

test().catch(console.error);
