
  // Fisher-Yates true random shuffle for exam test mode
  function shuffleArray(array) {
    if (!Array.isArray(array)) return [];
    const arr = array.slice();
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = arr[i];
      arr[i] = arr[j];
      arr[j] = temp;
    }
    return arr;
  }

/**
 * StudySynth — Client Application Controller
 * Adaptive, offline-first workspace for phones, tablets, and desktops.
 */

(function () {
  'use strict';

  const MODE_LABELS = {
    practice: 'Practice',
    test: 'Exam Test',
    revision: 'Revision',
    generator: 'Generator',
    library: 'Library',
    analysis: 'Analysis'
  };

  const MARKS_CORRECT = 2;
  const MARKS_WRONG = 0.66;

  const State = {
    activeMode: 'library',
    libraryClass: null,
    libraryExam: 'ugc_net',
    librarySearch: '',
    currentModule: null,
    currentIndex: 0,
    practiceAnswers: {},
    practiceRevealed: false,
    testAnswers: {},
    testStarted: false,
    testSubmitted: false,
    testStartedAt: 0,
    timerSeconds: 0,
    testQuestions: [],
    testDurationSeconds: 0,
    testRemainingSeconds: 0,
    testEndsAt: 0,
    testQuestionLimit: 10,
    testSecondsPerQuestion: 60,
    testModeType: 'chapter',
    timerInterval: null,
    deferredInstallPrompt: null,
    lastResult: null,
    revision: {
      items: null,
      itemsFor: null,
      progress: {},
      session: null,
      resumeCandidate: null,
      revealed: false,
      viewingPrev: false,
      expandedEvidence: false,
      saving: false
    },
    storagePersistent: false,
    isNative: false,
    navOpen: false,
    sourceMeta: null
  };

  const DOM = {};

  function initDOM() {
    DOM.appShell = document.getElementById('appShell');
    DOM.installBadge = document.getElementById('installBadge');
    DOM.appRail = document.getElementById('appRail');
    DOM.navToggle = document.getElementById('navToggle');
    DOM.navClose = document.getElementById('navClose');
    DOM.navBackdrop = document.getElementById('navBackdrop');

    DOM.brandLogo = document.getElementById('brandLogo');
    DOM.setTitle = document.getElementById('setTitle');
    DOM.setTopic = document.getElementById('setTopic');
    DOM.progNum = document.getElementById('progNum');
    DOM.progBar = document.getElementById('progBar');
    DOM.progPct = document.getElementById('progPct');
    DOM.themeToggle = document.getElementById('themeToggle');
    DOM.printBtn = document.getElementById('printBtn');

    DOM.modeItems = document.querySelectorAll('.mode-item');
    DOM.railAcc = document.getElementById('railAcc');
    DOM.railAccLabel = document.getElementById('railAccLabel');
    DOM.railBar = document.getElementById('railBar');
    DOM.railSub = document.getElementById('railSub');
    DOM.aboutBtn = document.getElementById('aboutBtn');

    DOM.quizView = document.getElementById('quizView');
    DOM.generatorView = document.getElementById('generatorView');
    DOM.revisionView = document.getElementById('revisionView');
    DOM.libraryView = document.getElementById('libraryView');

    DOM.sheetNum = document.getElementById('sheetNum');
    DOM.sheetModeLabel = document.getElementById('sheetModeLabel');
    DOM.sheetContext = document.getElementById('sheetContext');
    DOM.markBtn = document.getElementById('markBtn');
    DOM.examTimer = document.getElementById('examTimer');
    DOM.examAnswered = document.getElementById('examAnswered');
    DOM.examSubmitBtn = document.getElementById('examSubmitBtn');
    DOM.testSetup = document.getElementById('testSetup');
    DOM.testSetupModule = document.getElementById('testSetupModule');
    DOM.testScopeSelect = document.getElementById('testScopeSelect');
    DOM.testSummaryQuestions = document.getElementById('testSummaryQuestions');
    DOM.testSummaryMarking = document.getElementById('testSummaryMarking');
    DOM.testQuestionCount = document.getElementById('testQuestionCount');
    DOM.testSecondsPerQuestion = document.getElementById('testSecondsPerQuestion');
    DOM.testTotalTime = document.getElementById('testTotalTime');
    DOM.testStartBtn = document.getElementById('testStartBtn');

    DOM.testNavPills = document.getElementById('testNavPills');
    DOM.pillChapterTest = document.getElementById('pillChapterTest');
    DOM.pillUniversalTest = document.getElementById('pillUniversalTest');
    DOM.pillChapterTestLabel = document.getElementById('pillChapterTestLabel');
    DOM.chapterTestSection = document.getElementById('chapterTestSection');
    DOM.universalTestSection = document.getElementById('universalTestSection');
    DOM.chapterTestExamBadge = document.getElementById('chapterTestExamBadge');
    DOM.chapterTestPoolBadge = document.getElementById('chapterTestPoolBadge');
    DOM.chapterTestTitle = document.getElementById('chapterTestTitle');
    DOM.chapterQuestionCount = document.getElementById('chapterQuestionCount');
    DOM.chapterSecondsPerQuestion = document.getElementById('chapterSecondsPerQuestion');
    DOM.chapterSummaryQuestions = document.getElementById('chapterSummaryQuestions');
    DOM.chapterTotalTime = document.getElementById('chapterTotalTime');
    DOM.chapterSummaryMarking = document.getElementById('chapterSummaryMarking');
    DOM.chapterStartBtn = document.getElementById('chapterStartBtn');
    DOM.chapterBackToPracticeBtn = document.getElementById('chapterBackToPracticeBtn');
    DOM.inQuizTopicTestBtn = document.getElementById('inQuizTopicTestBtn');
    DOM.qContainer = document.getElementById('questionContainer');
    DOM.answerPanel = document.getElementById('answerPanel');
    DOM.sheetBody = document.querySelector('.sheet-body');
    DOM.workspace = document.querySelector('.workspace');
    DOM.prevBtn = document.getElementById('prevBtn');
    DOM.nextBtn = document.getElementById('nextBtn');
    DOM.submitBtn = document.getElementById('submitBtn');

    DOM.liveAccNum = document.getElementById('liveAccNum');
    DOM.statCorrect = document.getElementById('statCorrect');
    DOM.statWrong = document.getElementById('statWrong');
    DOM.livePalette = document.getElementById('livePalette');

    DOM.dropZone = document.getElementById('dropZone');
    DOM.fileInput = document.getElementById('fileInput');
    DOM.fileStatus = document.getElementById('fileStatus');
    DOM.docTitle = document.getElementById('docTitle');
    DOM.docText = document.getElementById('docText');
    DOM.generateBtn = document.getElementById('generateBtn');

    DOM.revisionUnavailable = document.getElementById('revisionUnavailable');
    DOM.revisionDashboard = document.getElementById('revisionDashboard');
    DOM.revisionSession = document.getElementById('revisionSession');
    DOM.revisionSummary = document.getElementById('revisionSummary');
    DOM.revDashTitle = document.getElementById('revDashTitle');
    DOM.revResetBtn = document.getElementById('revResetBtn');
    DOM.revStatDue = document.getElementById('revStatDue');
    DOM.revStatNew = document.getElementById('revStatNew');
    DOM.revStatLearning = document.getElementById('revStatLearning');
    DOM.revStatConsistent = document.getElementById('revStatConsistent');
    DOM.revStatTotal = document.getElementById('revStatTotal');
    DOM.revDashNote = document.getElementById('revDashNote');
    DOM.revStartBtn = document.getElementById('revStartBtn');
    DOM.revResumeBtn = document.getElementById('revResumeBtn');
    DOM.revPos = document.getElementById('revPos');
    DOM.revPauseBtn = document.getElementById('revPauseBtn');
    DOM.revProgress = document.getElementById('revProgress');
    DOM.revProgressBar = document.getElementById('revProgressBar');
    DOM.revForm = document.getElementById('revForm');
    DOM.revPrompt = document.getElementById('revPrompt');
    DOM.revAnswer = document.getElementById('revAnswer');
    DOM.revAnswerText = document.getElementById('revAnswerText');
    DOM.revSourceRef = document.getElementById('revSourceRef');
    DOM.revEvidenceShort = document.getElementById('revEvidenceShort');
    DOM.revEvidenceFull = document.getElementById('revEvidenceFull');
    DOM.revEvidenceToggle = document.getElementById('revEvidenceToggle');
    DOM.revRevealBtn = document.getElementById('revRevealBtn');
    DOM.revBackBtn = document.getElementById('revBackBtn');
    DOM.revPrevBtn = document.getElementById('revPrevBtn');
    DOM.revRatings = document.getElementById('revRatings');
    DOM.revSumReviewed = document.getElementById('revSumReviewed');
    DOM.revSumAgain = document.getElementById('revSumAgain');
    DOM.revSumHard = document.getElementById('revSumHard');
    DOM.revSumGood = document.getElementById('revSumGood');
    DOM.revSumEasy = document.getElementById('revSumEasy');
    DOM.revSumRemaining = document.getElementById('revSumRemaining');
    DOM.revSumNext = document.getElementById('revSumNext');
    DOM.revSummaryDoneBtn = document.getElementById('revSummaryDoneBtn');

    DOM.libraryContainer = document.getElementById('libraryContainer');
    DOM.analysisView = document.getElementById('analysisView');
    DOM.analysisContainer = document.getElementById('analysisContainer');
    DOM.analysisSub = document.getElementById('analysisSub');
    DOM.libBreadcrumbBar = document.getElementById('libBreadcrumbBar');
    DOM.examTabUgc = document.getElementById('examTabUgc');
    DOM.examTabCtet = document.getElementById('examTabCtet');
    DOM.libraryGenerateBtn = document.getElementById('libraryGenerateBtn');
    DOM.libSearchInput = document.getElementById('libSearchInput');
    DOM.toast = document.getElementById('toast');

    DOM.scoreModal = document.getElementById('scoreModal');
    DOM.scoreTitle = document.getElementById('scoreTitle');
    DOM.scoreMax = document.getElementById('scoreMax');
    DOM.scoreBand = document.getElementById('scoreBand');
    DOM.scoreCorrect = document.getElementById('scoreCorrect');
    DOM.scoreWrong = document.getElementById('scoreWrong');
    DOM.scoreSkipped = document.getElementById('scoreSkipped');
    DOM.scoreTime = document.getElementById('scoreTime');
    DOM.scoreNote = document.getElementById('scoreNote');
    DOM.scoreReviewBtn = document.getElementById('scoreReviewBtn');
    DOM.scoreRetakeBtn = document.getElementById('scoreRetakeBtn');
    DOM.scoreAnalysisBtn = document.getElementById('scoreAnalysisBtn');
    DOM.scoreCloseBtn = document.getElementById('scoreCloseBtn');

    DOM.aboutModal = document.getElementById('aboutModal');
    DOM.aboutCloseBtn = document.getElementById('aboutCloseBtn');

    DOM.processModal = document.getElementById('processModal');
    DOM.processTitle = document.getElementById('processTitle');
    DOM.processMessage = document.getElementById('processMessage');
    DOM.processNotice = document.getElementById('processNotice');
    DOM.processTrack = document.getElementById('processTrack');
    DOM.processBar = document.getElementById('processBar');
    DOM.processCount = document.getElementById('processCount');
    DOM.processPct = document.getElementById('processPct');
    DOM.processStages = document.getElementById('processStages');
    DOM.processStorage = document.getElementById('processStorage');
    DOM.processMinimizeBtn = document.getElementById('processMinimizeBtn');
    DOM.processCancelBtn = document.getElementById('processCancelBtn');
    DOM.processResumeBtn = document.getElementById('processResumeBtn');
    DOM.processRetryBtn = document.getElementById('processRetryBtn');
    DOM.processOpenBtn = document.getElementById('processOpenBtn');
    DOM.processDiscardBtn = document.getElementById('processDiscardBtn');
    DOM.processCloseBtn = document.getElementById('processCloseBtn');
    DOM.processLive = document.getElementById('processLive');
    DOM.processChip = document.getElementById('processChip');
    DOM.processChipStage = document.getElementById('processChipStage');
    DOM.processChipMeta = document.getElementById('processChipMeta');
    DOM.processChipPct = document.getElementById('processChipPct');
  }

  // ==========================================================================
  // SMALL HELPERS
  // ==========================================================================
  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
  }

  function icon(name, extraClass) {
    return `<span class="ms-icon${extraClass ? ' ' + extraClass : ''}" aria-hidden="true">${name}</span>`;
  }

  function formatTime(totalSeconds) {
    const s = Math.max(0, Math.floor(totalSeconds || 0));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }

  function showToast(msg) {
    if (!DOM.toast) return;
    DOM.toast.textContent = msg;
    DOM.toast.classList.add('show');
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => DOM.toast.classList.remove('show'), 3000);
  }

  function setFileStatus(message, type) {
    if (!DOM.fileStatus) return;
    DOM.fileStatus.textContent = message || '';
    DOM.fileStatus.className = 'file-status' + (type ? ' ' + type : '');
  }

  function isNativeApp() {
    try {
      return !!(window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform());
    } catch (e) {
      return false;
    }
  }

  function activeAnswers() {
    return State.activeMode === 'test' ? State.testAnswers : State.practiceAnswers;
  }

  function activeQuestionList() {
    if (State.activeMode === 'test') return State.testQuestions;
    return State.currentModule && Array.isArray(State.currentModule.questions)
      ? State.currentModule.questions
      : [];
  }

  function answeredCount(answers) {
    return activeQuestionList().reduce(
      (count, q) => count + (answers && answers[q.id] ? 1 : 0),
      0
    );
  }

  // ==========================================================================
  // SIDEBAR / DRAWER NAVIGATION
  // ==========================================================================
  const NAV_MEDIA_QUERY = '(max-width: 860px)';
  let navMediaQuery = null;

  function isCompactNav() {
    return navMediaQuery ? navMediaQuery.matches : window.innerWidth <= 860;
  }

  function setRailAvailability(compact, open) {
    if (!DOM.appRail) return;
    if (compact && !open) {
      DOM.appRail.setAttribute('aria-hidden', 'true');
      try { DOM.appRail.inert = true; } catch (e) { /* older WebView */ }
    } else {
      DOM.appRail.removeAttribute('aria-hidden');
      try { DOM.appRail.inert = false; } catch (e) { /* older WebView */ }
    }
  }

  function setNavOpen(open, options) {
    const opts = options || {};
    const compact = isCompactNav();
    const next = compact ? !!open : false;
    State.navOpen = next;
    document.body.classList.toggle('nav-open', next);

    if (DOM.navBackdrop) DOM.navBackdrop.hidden = !next;
    if (DOM.navToggle) DOM.navToggle.setAttribute('aria-expanded', next ? 'true' : 'false');
    setRailAvailability(compact, next);

    if (next && opts.focus !== false && DOM.navClose) {
      setTimeout(() => DOM.navClose.focus(), 30);
    }
    if (!next && opts.returnFocus && DOM.navToggle) {
      DOM.navToggle.focus();
    }
  }

  function initNavigation() {
    navMediaQuery = window.matchMedia ? window.matchMedia(NAV_MEDIA_QUERY) : null;

    if (DOM.navToggle) {
      DOM.navToggle.addEventListener('click', () => setNavOpen(!State.navOpen));
    }
    if (DOM.navClose) {
      DOM.navClose.addEventListener('click', () => setNavOpen(false, { returnFocus: true }));
    }
    if (DOM.navBackdrop) {
      DOM.navBackdrop.addEventListener('click', () => setNavOpen(false, { returnFocus: true }));
    }

    const viewportChanged = () => setNavOpen(false);
    if (navMediaQuery) {
      if (typeof navMediaQuery.addEventListener === 'function') navMediaQuery.addEventListener('change', viewportChanged);
      else if (typeof navMediaQuery.addListener === 'function') navMediaQuery.addListener(viewportChanged);
    }
    window.addEventListener('resize', () => {
      if (!isCompactNav() && State.navOpen) setNavOpen(false);
    });

    setRailAvailability(isCompactNav(), false);
  }

  // ==========================================================================
  // INSTALLATION BADGE & PWA LIFECYCLE
  // ==========================================================================
  function isStandalone() {
    if (State.isNative) return true;
    const params = new URLSearchParams(window.location.search);
    if (params.get('mode') === 'standalone' || params.get('standalone') === '1') return true;
    if (window.matchMedia('(display-mode: standalone)').matches) return true;
    if (window.matchMedia('(display-mode: fullscreen)').matches) return true;
    if (window.matchMedia('(display-mode: minimal-ui)').matches) return true;
    if (window.navigator.standalone === true) return true;
    if (document.referrer.indexOf('android-app://') === 0) return true;
    return false;
  }

  function markInstalled(label) {
    if (!DOM.installBadge) return;
    DOM.installBadge.innerHTML = icon('check_circle') + '<span class="install-text">' + escapeHtml(label || 'Installed') + '</span>';
    DOM.installBadge.classList.add('installed');
    DOM.installBadge.setAttribute('aria-label', 'StudySynth is installed');
  }

  function initInstallHandlers() {
    State.isNative = isNativeApp();

    if (State.isNative) {
      // The Android shell is already installed; never show an install sticker.
      if (DOM.installBadge) {
        DOM.installBadge.hidden = true;
        DOM.installBadge.remove();
        DOM.installBadge = null;
      }
      // window.print() is a no-op inside an Android WebView.
      if (DOM.printBtn) DOM.printBtn.hidden = true;
      return;
    }

    if (DOM.installBadge && isStandalone()) markInstalled('Installed');

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      State.deferredInstallPrompt = e;
    });

    window.addEventListener('appinstalled', () => {
      State.deferredInstallPrompt = null;
      markInstalled('Installed');
      showToast('StudySynth installed. You can open it offline from your home screen.');
    });

    if (DOM.installBadge) {
      DOM.installBadge.addEventListener('click', async () => {
        if (isStandalone()) {
          showToast('StudySynth is already installed.');
          return;
        }

        if (State.deferredInstallPrompt) {
          State.deferredInstallPrompt.prompt();
          try {
            const choice = await State.deferredInstallPrompt.userChoice;
            if (choice && choice.outcome === 'accepted') {
              State.deferredInstallPrompt = null;
              markInstalled('Installed');
              showToast('StudySynth installed successfully.');
            }
          } catch (e) {
            showToast('Install was not completed. You can retry from the browser menu.');
          }
        } else {
          showToast('To install: open the browser menu and choose “Install app” or “Add to Home screen”.');
        }
      });
    }
  }

  // ==========================================================================
  // SERVICE WORKER & STORAGE PERSISTENCE
  // ==========================================================================
  function registerServiceWorker() {
    // The Android build ships its assets inside the APK, so a service worker
    // would only add a stale-cache layer. Keep updates deterministic.
    if (State.isNative) return;
    if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;

    window.addEventListener('load', async () => {
      try {
        const registration = await navigator.serviceWorker.register('./sw.js');

        if (registration.waiting && navigator.serviceWorker.controller) {
          showToast('A new StudySynth version is ready. Reopen the app to update.');
        }

        registration.addEventListener('updatefound', () => {
          const worker = registration.installing;
          if (!worker) return;
          worker.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) {
              showToast('A new StudySynth version is ready. Reopen the app to update.');
            }
          });
        });

        // Look for updates when the app is opened, but never block startup.
        setTimeout(() => registration.update().catch(() => {}), 2500);
      } catch (err) {
        console.warn('StudySynth service worker registration failed:', err);
      }
    });
  }

  async function requestPersistentStorage() {
    if (State.isNative) return;
    if (!navigator.storage || typeof navigator.storage.persist !== 'function') return;
    try {
      const already = typeof navigator.storage.persisted === 'function'
        ? await navigator.storage.persisted()
        : false;
      const granted = already || await navigator.storage.persist();
      State.storagePersistent = !!granted;
    } catch (e) {
      // Storage persistence is best-effort, not required for the app to work.
    }
  }

  // ==========================================================================
  // THEME
  // ==========================================================================
  function syncSystemBarIcons(theme) {
    if (!State.isNative) return;
    try {
      const bars = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.SystemBars;
      if (bars) bars.setStyle({ style: theme === 'dark' ? 'DARK' : 'LIGHT' }).catch(() => {});
    } catch (e) { /* older WebView or plugin unavailable */ }
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    syncSystemBarIcons(theme);
    localStorage.setItem('studysynth_theme', theme);
    if (DOM.themeToggle) {
      DOM.themeToggle.innerHTML = icon(theme === 'dark' ? 'light_mode' : 'dark_mode');
      DOM.themeToggle.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
    }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#101011' : '#3943d3');
  }

  function initTheme() {
    let saved = null;
    try { saved = localStorage.getItem('studysynth_theme'); } catch (e) { /* private mode */ }
    if (saved !== 'dark' && saved !== 'light') {
      saved = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    applyTheme(saved);

    if (DOM.themeToggle) {
      DOM.themeToggle.addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme') || 'light';
        applyTheme(current === 'dark' ? 'light' : 'dark');
      });
    }
  }

  // ==========================================================================
  // MODE SWITCHING
  // ==========================================================================
    async function switchMode(mode) {
    if (!MODE_LABELS[mode]) mode = 'library';
    if ((mode === 'practice' || mode === 'test') && !State.currentModule) {
      try {
        const bundled = (typeof globalThis !== 'undefined' && globalThis.CTET_INDEX) || [];
        const firstSet = bundled.find(m => m && m.questionCount > 0) || bundled[0];
        if (firstSet) {
          const full = await resolveModuleBody(firstSet);
          if (full && Array.isArray(full.questions) && full.questions.length) {
            setModule(full);
          }
        }
      } catch (err) {}
    }
    if ((mode === 'practice' || mode === 'revision' || mode === 'test') && !State.currentModule) {
      showToast('Choose a saved set from the Library to start studying.');
      mode = 'library';
    }
    const activeQuestionCount = State.currentModule && Array.isArray(State.currentModule.questions)
      ? State.currentModule.questions.length
      : 0;
    if ((mode === 'practice' || mode === 'test') && activeQuestionCount === 0) {
      mode = 'revision';
      showToast('This set is revision-only because no MCQs passed source verification.');
    }
    const previousMode = State.activeMode;
    const wasNavOpen = State.navOpen;
    State.activeMode = mode;
    document.body.setAttribute('data-mode', mode);

    DOM.modeItems.forEach((btn) => {
      const active = btn.getAttribute('data-mode') === mode;
      btn.classList.toggle('active', active);
      if (active) btn.setAttribute('aria-current', 'page');
      else btn.removeAttribute('aria-current');
    });

    const isQuiz = mode === 'practice' || mode === 'test';
    DOM.quizView.style.display = isQuiz ? 'flex' : 'none';
    DOM.generatorView.style.display = mode === 'generator' ? 'block' : 'none';
    DOM.revisionView.style.display = mode === 'revision' ? 'flex' : 'none';
    DOM.libraryView.style.display = mode === 'library' ? 'block' : 'none';
    if (DOM.analysisView) DOM.analysisView.style.display = mode === 'analysis' ? 'block' : 'none';
    if (DOM.workspace) DOM.workspace.scrollTop = 0;

    if (DOM.sheetModeLabel) DOM.sheetModeLabel.textContent = MODE_LABELS[mode];

    if (mode === 'test' && !State.testSubmitted) {
      if (!State.testStarted) {
        if (previousMode !== 'test') {
          State.testAnswers = {};
          State.currentIndex = 0;
        }
      } else {
        startTimer(false);
      }
    }
    // An active exam keeps its timer and answers if the learner checks notes
    // or revision. Submitting remains the only way to end the timed session.
    const testSetup = mode === 'test' && !State.testStarted && !State.testSubmitted;
    updateTestScreen();

    if (mode === 'revision') {
      openRevision();
    } else if (mode === 'library') {
      renderLibrary();
    } else if (mode === 'analysis') {
      renderAnalysis();
    } else if (isQuiz && !testSetup) {
      renderQuestion();
      renderPalette();
      updateStats();
    }

    setNavOpen(false, { returnFocus: wasNavOpen });

    if (mode === 'library' || mode === 'generator' || mode === 'analysis') {
      if (DOM.setTitle) DOM.setTitle.textContent = mode === 'analysis' ? 'ANALYSIS' : 'LIBRARY';
      if (DOM.setTopic) DOM.setTopic.textContent = 'UGC NET Education (Code 09)';
    } else if (State.currentModule) {
      const activeCount = Array.isArray(State.currentModule.questions) ? State.currentModule.questions.length : 0;
      if (DOM.setTitle) DOM.setTitle.textContent = activeCount ? `${activeCount} VERIFIED QUESTIONS` : 'REVISION ONLY';
      if (DOM.setTopic) DOM.setTopic.textContent = State.currentModule.title;
    }
  }

  // ==========================================================================
  // EXAM TIMER & TEST SETUP (OFFICIAL MOCKS & CUSTOM TESTS WITH RANDOMIZATION)
  // ==========================================================================
  async function loadModulesQuestions(moduleIds) {
    const questionsByMod = {};
    for (const id of moduleIds) {
      try {
        const mod = await resolveModuleBody({ id });
        if (mod && Array.isArray(mod.questions)) {
          questionsByMod[id] = mod.questions;
        }
      } catch (e) {}
    }
    return questionsByMod;
  }

  async function launchOfficialMock(presetId) {
    showToast('Preparing official exam mock questions…');

    if (presetId === 'ugc_net_full') {
      // UGC NET Education (Code 09) Paper 2: 100 Questions, 120 Mins (10 per unit)
      const unitIds = Array.from({ length: 10 }, (_, i) => `ugc_net_unit_${i + 1}`);
      const qByMod = await loadModulesQuestions(unitIds);
      let selectedQuestions = [];

      unitIds.forEach((uid) => {
        const pool = shuffleArray(qByMod[uid] || []);
        selectedQuestions = selectedQuestions.concat(pool.slice(0, 10));
      });

      selectedQuestions = shuffleArray(selectedQuestions);

      const mockModule = {
        id: 'mock_ugc_net_full',
        title: 'UGC NET Education (Code 09) - Paper 2 Official Mock',
        exam: 'ugc_net',
        examName: 'UGC NET Education (Code 09)',
        subject: 'Education (Code 09)',
        topic: 'Official Paper 2 Full Mock (All 10 Units Balanced)',
        durationMs: 120 * 60 * 1000,
        questions: selectedQuestions
      };

      setModule(mockModule);
      startCustomOrPresetTest(100, 72, selectedQuestions);
      showToast('UGC NET Official Mock started: 100 Questions · 120 Minutes');
    } else if (presetId === 'ctet_p2_full') {
      // CTET Paper-II: 90 Questions (30 CDP + 60 SST), 90 Mins
      const cdpUnits = [
        'ctet_cdp_growth_development', 'ctet_cdp_theories', 'ctet_cdp_progressive_intelligence',
        'ctet_cdp_inclusive', 'ctet_cdp_learning_pedagogy', 'ctet_cdp_assessment'
      ];
      const sstUnits = [
        'ctet_sst_history', 'ctet_sst_geography', 'ctet_sst_polity', 'ctet_sst_pedagogy'
      ];

      const qByMod = await loadModulesQuestions(cdpUnits.concat(sstUnits));
      let selectedQuestions = [];

      // 30 CDP: 5 questions from each of the 6 CDP units
      cdpUnits.forEach((uid) => {
        const pool = shuffleArray(qByMod[uid] || []);
        selectedQuestions = selectedQuestions.concat(pool.slice(0, 5));
      });

      // 60 SST: 20 History, 15 Geography, 15 Civics, 10 Pedagogy
      const sstHist = shuffleArray(qByMod['ctet_sst_history'] || []).slice(0, 20);
      const sstGeo = shuffleArray(qByMod['ctet_sst_geography'] || []).slice(0, 15);
      const sstPol = shuffleArray(qByMod['ctet_sst_polity'] || []).slice(0, 15);
      const sstPed = shuffleArray(qByMod['ctet_sst_pedagogy'] || []).slice(0, 10);
      selectedQuestions = selectedQuestions.concat(sstHist, sstGeo, sstPol, sstPed);

      selectedQuestions = shuffleArray(selectedQuestions);

      const mockModule = {
        id: 'mock_ctet_p2_full',
        title: 'CTET Paper-II - Social Science & CDP Official Mock',
        exam: 'ctet',
        examName: 'CTET (Central Teacher Eligibility Test)',
        subject: 'Social Science & CDP',
        topic: 'Official Paper-II Full Mock (30 CDP + 60 SST)',
        durationMs: 90 * 60 * 1000,
        questions: selectedQuestions
      };

      setModule(mockModule);
      startCustomOrPresetTest(90, 60, selectedQuestions);
      showToast('CTET Paper-II Official Mock started: 90 Questions · 90 Minutes');
    } else if (presetId === 'ctet_p1_cdp') {
      // CTET CDP Mock: 30 Questions, 30 Mins (5 from each CDP unit)
      const cdpUnits = [
        'ctet_cdp_growth_development', 'ctet_cdp_theories', 'ctet_cdp_progressive_intelligence',
        'ctet_cdp_inclusive', 'ctet_cdp_learning_pedagogy', 'ctet_cdp_assessment'
      ];
      const qByMod = await loadModulesQuestions(cdpUnits);
      let selectedQuestions = [];
      cdpUnits.forEach((uid) => {
        const pool = shuffleArray(qByMod[uid] || []);
        selectedQuestions = selectedQuestions.concat(pool.slice(0, 5));
      });
      selectedQuestions = shuffleArray(selectedQuestions);

      const mockModule = {
        id: 'mock_ctet_cdp',
        title: 'CTET - Child Development & Pedagogy Official Mock',
        exam: 'ctet',
        examName: 'CTET (Central Teacher Eligibility Test)',
        subject: 'Child Development & Pedagogy',
        topic: 'Official CDP Section Mock (30 Questions)',
        durationMs: 30 * 60 * 1000,
        questions: selectedQuestions
      };

      setModule(mockModule);
      startCustomOrPresetTest(30, 60, selectedQuestions);
      showToast('CTET CDP Mock started: 30 Questions · 30 Minutes');
    }
  }

  function startCustomOrPresetTest(count, secondsPerQ, questions) {
    // ALWAYS randomize question order in test mode!
    const randomized = shuffleArray(questions);
    const selected = randomized.slice(0, count);

    State.testQuestionLimit = selected.length;
    State.testSecondsPerQuestion = secondsPerQ;
    State.testQuestions = selected;
    State.testAnswers = {};
    State.testSubmitted = false;
    State.currentIndex = 0;
    State.testDurationSeconds = selected.length * secondsPerQ;
    State.testRemainingSeconds = State.testDurationSeconds;
    State.testStarted = true;
    State.testStartedAt = Date.now();
    State.testEndsAt = State.testStartedAt + State.testDurationSeconds * 1000;
    State.timerSeconds = 0;

    updateTestScreen();
    startTimer(true);
    renderQuestion();
    renderPalette();
    updateStats();
    const firstOption = DOM.qContainer && DOM.qContainer.querySelector('.opt');
    if (firstOption) setTimeout(() => firstOption.focus(), 30);
  }

  function updateChapterTestTotalTime() {
    const count = Number(DOM.chapterQuestionCount && DOM.chapterQuestionCount.value) || 10;
    const seconds = Number(DOM.chapterSecondsPerQuestion && DOM.chapterSecondsPerQuestion.value) || 60;
    const mod = State.currentModule;
    const isCtet = mod && (mod.exam === 'ctet' || String(mod.id).startsWith('ctet_'));

    if (DOM.chapterTotalTime) DOM.chapterTotalTime.textContent = formatTime(count * seconds);
    if (DOM.chapterSummaryQuestions) DOM.chapterSummaryQuestions.textContent = count;
    if (DOM.chapterSummaryMarking) {
      DOM.chapterSummaryMarking.textContent = isCtet ? '+1.00 / 0 (CTET)' : '+2.00 / 0 (UGC NET)';
    }
  }

  function renderChapterTestConfig() {
    const mod = State.currentModule;
    if (!mod || !Array.isArray(mod.questions)) return;

    const total = mod.questions.length;
    const isCtet = mod.exam === 'ctet' || String(mod.id).startsWith('ctet_');

    if (DOM.chapterTestTitle) {
      DOM.chapterTestTitle.textContent = mod.topic || mod.title;
    }
    if (DOM.chapterTestExamBadge) {
      DOM.chapterTestExamBadge.textContent = isCtet ? 'CTET (Paper-II)' : 'UGC NET Education (Code 09)';
      DOM.chapterTestExamBadge.className = `mock-badge ${isCtet ? 'ctet-badge' : 'ugc-badge'}`;
    }
    if (DOM.chapterTestPoolBadge) {
      DOM.chapterTestPoolBadge.textContent = `${total} Verified MCQs in this Chapter`;
    }

    if (DOM.chapterQuestionCount) {
      const counts = [5, 10, 15, 20, 25, 30, 50, 100].filter(n => n < total);
      counts.push(total);
      const prev = Number(DOM.chapterQuestionCount.value) || 20;
      const selected = counts.includes(prev) ? prev : (counts.includes(20) ? 20 : (counts.includes(30) ? 30 : Math.min(10, total)));

      DOM.chapterQuestionCount.innerHTML = counts.map(n =>
        `<option value="${n}"${n === selected ? ' selected' : ''}>${n} questions${n === total ? ' (all in chapter)' : ''}</option>`
      ).join('');
    }

    updateChapterTestTotalTime();
  }

  function renderUniversalTestConfig() {
    const mod = State.currentModule;
    const indexList = (typeof globalThis !== 'undefined' && globalThis.CTET_INDEX) || window.CTET_INDEX || [];

    // Populate testScopeSelect
    if (DOM.testScopeSelect) {
      const currentScope = DOM.testScopeSelect.value || 'ugc_net_all';
      let optHtml = '';
      if (mod && Array.isArray(mod.questions) && mod.questions.length) {
        optHtml += `<option value="current">Current Set: ${escapeHtml(mod.topic || mod.title)} (${mod.questions.length} MCQs)</option>`;
      }
      optHtml += `
        <optgroup label="Complete Exam Pools">
          <option value="ugc_net_all">UGC NET Education (Code 09) - All 10 Units (1,770 MCQs)</option>
          <option value="ctet_all">CTET Complete - CDP &amp; Social Science (6,749 MCQs)</option>
          <option value="ctet_cdp_all">CTET - Child Development &amp; Pedagogy (All 6 Units)</option>
          <option value="ctet_sst_all">CTET - Social Science (All 4 Units)</option>
        </optgroup>
        <optgroup label="UGC NET Education (Code 09) - Individual Units">
      `;
      indexList.filter(m => String(m.id).startsWith('ugc_net_')).forEach(m => {
        optHtml += `<option value="${m.id}">${escapeHtml(m.topic || m.title)} (${m.questionCount} MCQs)</option>`;
      });
      optHtml += `</optgroup><optgroup label="CTET - Individual Subject &amp; Topic Units">`;
      indexList.filter(m => String(m.id).startsWith('ctet_')).forEach(m => {
        optHtml += `<option value="${m.id}">${escapeHtml(m.topic || m.title)} (${m.questionCount} MCQs)</option>`;
      });
      optHtml += `</optgroup>`;
      DOM.testScopeSelect.innerHTML = optHtml;
      if (currentScope && DOM.testScopeSelect.querySelector(`option[value="${currentScope}"]`)) {
        DOM.testScopeSelect.value = currentScope;
      }
    }

    updateTestQuestionCountOptions();
    updateTestTotalTime();

    // Wire official mock buttons
    DOM.testSetup.querySelectorAll('.mock-start-btn').forEach(btn => {
      btn.onclick = () => {
        const preset = btn.getAttribute('data-preset');
        launchOfficialMock(preset);
      };
    });
  }

  function renderTestSetup() {
    if (!DOM.testSetup) return;
    const mod = State.currentModule;
    const hasMod = !!(mod && Array.isArray(mod.questions) && mod.questions.length);

    if (!hasMod) {
      State.testModeType = 'universal';
    }

    const isChapter = State.testModeType === 'chapter' && hasMod;

    if (DOM.chapterTestSection) DOM.chapterTestSection.style.display = isChapter ? 'block' : 'none';
    if (DOM.universalTestSection) DOM.universalTestSection.style.display = isChapter ? 'none' : 'block';

    if (DOM.pillChapterTest) {
      DOM.pillChapterTest.classList.toggle('active', isChapter);
      DOM.pillChapterTest.setAttribute('aria-selected', isChapter ? 'true' : 'false');
      DOM.pillChapterTest.style.display = hasMod ? 'inline-flex' : 'none';
      if (DOM.pillChapterTestLabel && mod) {
        const shortName = (mod.topic || mod.title || 'Chapter').split(':')[0].trim();
        DOM.pillChapterTestLabel.textContent = `${shortName} Test`;
      }
    }
    if (DOM.pillUniversalTest) {
      DOM.pillUniversalTest.classList.toggle('active', !isChapter);
      DOM.pillUniversalTest.setAttribute('aria-selected', !isChapter ? 'true' : 'false');
    }

    if (isChapter) {
      renderChapterTestConfig();
    } else {
      renderUniversalTestConfig();
    }
  }

  function startChapterTest() {
    const mod = State.currentModule;
    if (!mod || !Array.isArray(mod.questions) || !mod.questions.length) {
      showToast('No questions available in this chapter.');
      return;
    }
    const count = Number(DOM.chapterQuestionCount && DOM.chapterQuestionCount.value) || Math.min(20, mod.questions.length);
    const seconds = Number(DOM.chapterSecondsPerQuestion && DOM.chapterSecondsPerQuestion.value) || 60;

    const shuffled = shuffleArray([...mod.questions]);
    const selected = shuffled.slice(0, Math.min(count, shuffled.length));

    const isCtet = mod.exam === 'ctet' || String(mod.id).startsWith('ctet_');
    const chapterName = mod.topic || mod.title;

    setModule({
      id: 'chapter_test_' + Date.now(),
      title: `${chapterName} - Chapter Test (${selected.length} MCQs)`,
      exam: isCtet ? 'ctet' : 'ugc_net',
      examName: isCtet ? 'CTET (Central Teacher Eligibility Test)' : 'UGC NET Education (Code 09)',
      subject: mod.subject || (isCtet ? 'CTET' : 'Education'),
      topic: chapterName,
      durationMs: selected.length * seconds * 1000,
      questions: selected
    });

    startCustomOrPresetTest(selected.length, seconds, selected);
    showToast(`Chapter test started: ${selected.length} questions · ${formatTime(seconds)} per question.`);
  }

  function getScopeQuestionCount(scope) {
    const mod = State.currentModule;
    const indexList = (typeof globalThis !== 'undefined' && globalThis.CTET_INDEX) || window.CTET_INDEX || [];
    if (scope === 'current' && mod && Array.isArray(mod.questions)) return mod.questions.length;
    if (scope === 'ugc_net_all') return 1770;
    if (scope === 'ctet_all') return 6749;
    if (scope === 'ctet_cdp_all') return 5025;
    if (scope === 'ctet_sst_all') return 1724;
    const target = indexList.find(m => m.id === scope);
    return target ? target.questionCount : 100;
  }

  function updateTestQuestionCountOptions() {
    if (!DOM.testQuestionCount) return;
    const scope = DOM.testScopeSelect ? DOM.testScopeSelect.value : 'current';
    const available = getScopeQuestionCount(scope);

    if (DOM.testSetupModule) {
      DOM.testSetupModule.textContent = `Pool: ${available} verified questions available · Shuffled randomly every test`;
    }

    const counts = [5, 10, 15, 20, 25, 30, 50, 90, 100].filter((n) => n < available);
    counts.push(available);

    const previous = Number(DOM.testQuestionCount.value) || State.testQuestionLimit;
    const selected = counts.indexOf(previous) >= 0 ? previous : (counts.includes(30) ? 30 : Math.min(10, available));
    DOM.testQuestionCount.innerHTML = counts.map((n) =>
      `<option value="${n}"${n === selected ? ' selected' : ''}>${n} questions${n === available ? ' (all available)' : ''}</option>`
    ).join('');
    State.testQuestionLimit = selected;
  }

  function updateTestTotalTime() {
    const count = Number(DOM.testQuestionCount && DOM.testQuestionCount.value) || 0;
    const seconds = Number(DOM.testSecondsPerQuestion && DOM.testSecondsPerQuestion.value) || 60;
    const scope = DOM.testScopeSelect ? DOM.testScopeSelect.value : 'current';
    const isCtet = scope.includes('ctet') || (State.currentModule && (State.currentModule.exam === 'ctet' || String(State.currentModule.id).startsWith('ctet_')));

    if (DOM.testTotalTime) DOM.testTotalTime.textContent = formatTime(count * seconds);
    if (DOM.testSummaryQuestions) DOM.testSummaryQuestions.textContent = count;
    if (DOM.testSummaryMarking) {
      DOM.testSummaryMarking.textContent = isCtet ? '+1.00 / 0 (CTET)' : '+2.00 / 0 (UGC NET)';
    }
  }

  function updateTestScreen() {
    const showSetup = State.activeMode === 'test' && !State.testStarted && !State.testSubmitted;
    document.body.setAttribute('data-test-setup', showSetup ? 'true' : 'false');
    if (DOM.quizView) DOM.quizView.classList.toggle('is-test-setup', showSetup);
    if (DOM.testSetup) DOM.testSetup.hidden = !showSetup;
    if (DOM.inQuizTopicTestBtn) {
      DOM.inQuizTopicTestBtn.style.display = (State.activeMode === 'practice' && !showSetup) ? 'inline-flex' : 'none';
    }
    if (showSetup) renderTestSetup();
  }

  async function startTest() {
    const scope = DOM.testScopeSelect ? DOM.testScopeSelect.value : 'current';
    const count = Number(DOM.testQuestionCount && DOM.testQuestionCount.value) || 10;
    const seconds = Number(DOM.testSecondsPerQuestion && DOM.testSecondsPerQuestion.value) || 60;

    let pool = [];
    let scopeTitle = '';

    if (scope === 'current') {
      pool = State.currentModule && Array.isArray(State.currentModule.questions) ? State.currentModule.questions : [];
      scopeTitle = State.currentModule ? State.currentModule.topic || State.currentModule.title : 'Practice Set';
    } else if (scope === 'ugc_net_all') {
      const unitIds = Array.from({ length: 10 }, (_, i) => `ugc_net_unit_${i + 1}`);
      const qByMod = await loadModulesQuestions(unitIds);
      Object.values(qByMod).forEach(qs => pool.push(...qs));
      scopeTitle = 'UGC NET Education (All 10 Units)';
    } else if (scope === 'ctet_all') {
      const allCtet = [
        'ctet_cdp_growth_development', 'ctet_cdp_theories', 'ctet_cdp_progressive_intelligence',
        'ctet_cdp_inclusive', 'ctet_cdp_learning_pedagogy', 'ctet_cdp_assessment',
        'ctet_sst_history', 'ctet_sst_geography', 'ctet_sst_polity', 'ctet_sst_pedagogy'
      ];
      const qByMod = await loadModulesQuestions(allCtet);
      Object.values(qByMod).forEach(qs => pool.push(...qs));
      scopeTitle = 'CTET Complete (CDP & Social Science)';
    } else if (scope === 'ctet_cdp_all') {
      const cdpUnits = [
        'ctet_cdp_growth_development', 'ctet_cdp_theories', 'ctet_cdp_progressive_intelligence',
        'ctet_cdp_inclusive', 'ctet_cdp_learning_pedagogy', 'ctet_cdp_assessment'
      ];
      const qByMod = await loadModulesQuestions(cdpUnits);
      Object.values(qByMod).forEach(qs => pool.push(...qs));
      scopeTitle = 'CTET Child Development & Pedagogy';
    } else if (scope === 'ctet_sst_all') {
      const sstUnits = ['ctet_sst_history', 'ctet_sst_geography', 'ctet_sst_polity', 'ctet_sst_pedagogy'];
      const qByMod = await loadModulesQuestions(sstUnits);
      Object.values(qByMod).forEach(qs => pool.push(...qs));
      scopeTitle = 'CTET Social Science';
    } else {
      const singleMod = await resolveModuleBody({ id: scope });
      if (singleMod && Array.isArray(singleMod.questions)) {
        pool = singleMod.questions;
        scopeTitle = singleMod.topic || singleMod.title;
      }
    }

    if (!pool.length) {
      showToast('No questions found for the selected test scope.');
      return;
    }

    const isCtet = scope.includes('ctet') || (State.currentModule && String(State.currentModule.id).startsWith('ctet_'));
    setModule({
      id: 'custom_test_' + Date.now(),
      title: `${scopeTitle} - Test (${Math.min(count, pool.length)} MCQs)`,
      exam: isCtet ? 'ctet' : 'ugc_net',
      examName: isCtet ? 'CTET (Central Teacher Eligibility Test)' : 'UGC NET Education (Code 09)',
      subject: scopeTitle,
      topic: scopeTitle,
      durationMs: count * seconds * 1000,
      questions: pool
    });

    startCustomOrPresetTest(Math.min(count, pool.length), seconds, pool);
    showToast(`Test started: ${Math.min(count, pool.length)} questions · ${formatTime(seconds)} per question.`);
  }

  function startTimer(reset) {
    const duration = Math.max(0, Number(State.testDurationSeconds) || 0);
    if (reset) {
      State.timerSeconds = 0;
      State.testStartedAt = Date.now();
      State.testRemainingSeconds = duration;
      State.testEndsAt = State.testStartedAt + duration * 1000;
    }
    if (!State.testStartedAt) State.testStartedAt = Date.now();
    if (!State.testEndsAt) State.testEndsAt = State.testStartedAt + duration * 1000;
    State.testStarted = true;
    tickTimer(false);

    if (!State.timerInterval) {
      State.timerInterval = setInterval(tickTimer, 1000);
    }
  }

  function tickTimer(autoSubmit) {
    const duration = Math.max(0, Number(State.testDurationSeconds) || 0);
    const endsAt = Number(State.testEndsAt) || 0;
    const remaining = endsAt ? Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)) : duration;
    State.testRemainingSeconds = remaining;
    State.timerSeconds = Math.max(0, duration - remaining);
    updateTimerDisplay();

    if (remaining <= 0 && autoSubmit !== false) {
      stopTimer();
      if (State.testStarted && !State.testSubmitted) {
        showToast('Time is up. Your test was submitted automatically.');
        completeTest();
      }
    }
  }

  function stopTimer() {
    if (State.timerInterval) {
      clearInterval(State.timerInterval);
      State.timerInterval = null;
    }
  }

  function updateTimerDisplay() {
    if (!DOM.examTimer) return;
    const showRemaining = State.testStarted && !State.testSubmitted;
    const seconds = showRemaining ? State.testRemainingSeconds : State.timerSeconds;
    DOM.examTimer.textContent = formatTime(seconds);
    const clock = DOM.examTimer.closest('.exam-clock');
    if (clock) clock.classList.toggle('is-low', showRemaining && seconds <= 60);
  }

  function resetExamState() {
    stopTimer();
    State.testStarted = false;
    State.testSubmitted = false;
    State.testStartedAt = 0;
    State.timerSeconds = 0;
    State.testAnswers = {};
    State.testQuestions = [];
    State.testDurationSeconds = 0;
    State.testRemainingSeconds = 0;
    State.testEndsAt = 0;
    updateTimerDisplay();
  }

  // ==========================================================================
  // MODULE LOADING
  // ==========================================================================
  function setModule(mod) {
    State.currentModule = mod;
    resetExamState();
    State.currentIndex = 0;
    State.practiceAnswers = {};
    State.practiceRevealed = false;
    State.revision.items = null;
    State.revision.itemsFor = null;
    State.revision.progress = {};
    State.revision.session = null;
    State.revision.resumeCandidate = null;
    State.revision.revealed = false;
    State.revision.viewingPrev = false;
    State.revision.expandedEvidence = false;
    State.lastResult = null;

    const questionCount = Array.isArray(mod.questions) ? mod.questions.length : 0;
    if (DOM.setTitle) DOM.setTitle.textContent = questionCount ? `${questionCount} VERIFIED QUESTIONS` : 'REVISION ONLY';
    if (DOM.setTopic) DOM.setTopic.textContent = mod.title;

    updateStats();
    if (!questionCount) {
      if (DOM.qContainer) {
        DOM.qContainer.innerHTML = '<div class="empty-state"><strong>This set is revision-only.</strong><br>No question passed source verification. Open Revision to study it, or add clearer source text and generate again.</div>';
      }
      if (DOM.answerPanel) DOM.answerPanel.innerHTML = '';
      if (DOM.progNum) DOM.progNum.textContent = '0/0';
      if (DOM.progBar) DOM.progBar.style.width = '0%';
      if (DOM.progPct) DOM.progPct.textContent = '0%';
      renderPalette();
      return;
    }
    renderQuestion();
    renderPalette();
  }

  // ==========================================================================
  // QUESTION RENDERING
  // ==========================================================================
  function formatQuestionPresentation(q) {
    if (!q) return '';
    const pt = q.presentation_type || 'standard';
    const pd = q.presentation_data;

    if (pt === 'match_list' && pd && Array.isArray(pd.l1) && Array.isArray(pd.l2)) {
      const maxRows = Math.max(pd.l1.length, pd.l2.length);
      let rowsHtml = '';
      for (let i = 0; i < maxRows; i++) {
        const item1 = pd.l1[i];
        const item2 = pd.l2[i];
        const c1 = item1 ? `<span class="match-key">${escapeHtml(item1.key)}</span><span class="match-text">${escapeHtml(item1.text)}</span>` : '';
        const c2 = item2 ? `<span class="match-key">${escapeHtml(item2.key)}</span><span class="match-text">${escapeHtml(item2.text)}</span>` : '';
        rowsHtml += `<tr><td>${c1}</td><td>${c2}</td></tr>`;
      }
      return `
        <div class="ugc-match-card">
          <div class="ugc-match-instruction">${escapeHtml(pd.intro || 'Match List - I with List - II.')}</div>
          <div class="ugc-match-table-wrap">
            <table class="ugc-match-table">
              <thead>
                <tr>
                  <th>${escapeHtml(pd.l1_header || 'List - I')}</th>
                  <th>${escapeHtml(pd.l2_header || 'List - II')}</th>
                </tr>
              </thead>
              <tbody>${rowsHtml}</tbody>
            </table>
          </div>
          ${pd.prompt ? `<div class="ugc-match-prompt">${escapeHtml(pd.prompt)}</div>` : ''}
        </div>
      `;
    }

    if (pt === 'assertion_reason' && pd) {
      return `
        <div class="ugc-ar-box">
          <div class="ugc-ar-intro">${escapeHtml(pd.intro || 'Given below are two statements, one is labelled as Assertion (A) and the other as Reason (R):')}</div>
          <div class="ugc-stmt-card assertion">
            <span class="ugc-stmt-badge">Assertion (A)</span>
            <span class="ugc-stmt-text">${escapeHtml(pd.assertion || '')}</span>
          </div>
          <div class="ugc-stmt-card reason">
            <span class="ugc-stmt-badge">Reason (R)</span>
            <span class="ugc-stmt-text">${escapeHtml(pd.reason || '')}</span>
          </div>
          ${pd.prompt ? `<div class="ugc-match-prompt">${escapeHtml(pd.prompt)}</div>` : ''}
        </div>
      `;
    }

    if (pt === 'statement_pair' && pd) {
      return `
        <div class="ugc-ar-box">
          <div class="ugc-ar-intro">${escapeHtml(pd.intro || 'Given below are two statements:')}</div>
          <div class="ugc-stmt-card statement">
            <span class="ugc-stmt-badge">Statement I</span>
            <span class="ugc-stmt-text">${escapeHtml(pd.statement1 || '')}</span>
          </div>
          <div class="ugc-stmt-card statement">
            <span class="ugc-stmt-badge">Statement II</span>
            <span class="ugc-stmt-text">${escapeHtml(pd.statement2 || '')}</span>
          </div>
          ${pd.prompt ? `<div class="ugc-match-prompt">${escapeHtml(pd.prompt)}</div>` : ''}
        </div>
      `;
    }

    return `<div class="q-stem">${escapeHtml(q.stem || '')}</div>`;
  }

  function renderQuestion(preservePageScroll) {
    const qList = activeQuestionList();
    const q = qList[State.currentIndex];
    if (!q) return;

    if (DOM.sheetNum) DOM.sheetNum.textContent = `Q ${String(State.currentIndex + 1).padStart(2, '0')}`;
    if (DOM.sheetContext) DOM.sheetContext.textContent = q.source_title || '';

    const progressCurrent = State.currentIndex + 1;
    const pct = Math.round((progressCurrent / qList.length) * 100);
    if (DOM.progNum) DOM.progNum.textContent = `${progressCurrent}/${qList.length}`;
    if (DOM.progBar) DOM.progBar.style.width = `${pct}%`;
    if (DOM.progPct) DOM.progPct.textContent = `${pct}%`;

    const isBookmarked = !!window.OfflineStorage.getBookmarks()[q.id];
    if (DOM.markBtn) {
      DOM.markBtn.innerHTML = icon('star') + `<span class="bookmark-text">${isBookmarked ? 'Bookmarked' : 'Bookmark'}</span>`;
      DOM.markBtn.setAttribute('aria-pressed', isBookmarked ? 'true' : 'false');
    }

    const options = Array.isArray(q.options) ? q.options : [];
    const answers = activeAnswers();
    const selectedKey = answers[q.id];
    const isPractice = State.activeMode === 'practice';
    const isTest = State.activeMode === 'test';
    const showFeedback = isPractice
      ? (!!selectedKey || State.practiceRevealed)
      : (isTest && State.testSubmitted);
    const pageScroll = DOM.workspace ? DOM.workspace.scrollTop : 0;
    const sourceLine = q.context
      ? `<p class="q-source">${escapeHtml(q.context)}</p>`
      : '';

    let html = `
      <div class="q-context">${escapeHtml(q.cognitive_level || 'recall')}${q.source_title ? `<span class="sep">/</span><span class="source-tag">${escapeHtml(q.source_title)}</span>` : ''}</div>
      ${sourceLine}
      ${formatQuestionPresentation(q)}
    `;

    if (q.type === 'multi_statement' && Array.isArray(q.statements) && q.statements.length) {
      html += `
        <div class="stmt-block">
          <div class="stmt-kicker">Statements for evaluation</div>
          <ul class="stmt-list">
            ${q.statements.map((s) => `<li><span class="stmt-n">${escapeHtml(s.number)}</span><span>${escapeHtml(s.text)}</span></li>`).join('')}
          </ul>
          <div class="stmt-closer">${escapeHtml(q.prompt_suffix || 'Which of the statements given above is/are correct?')}</div>
        </div>
      `;
    }

    html += '<div class="opts" role="group" aria-label="Answer options">';
    for (const opt of options) {
      let optClass = 'opt';
      let verdictBadge = '';
      if (selectedKey === opt.key) optClass += ' selected';

      if (showFeedback) {
        if (opt.key === q.answer_key) {
          optClass += ' correct';
          verdictBadge = '<span class="verdict">Correct key</span>';
        } else if (selectedKey === opt.key) {
          optClass += ' incorrect';
          verdictBadge = '<span class="verdict">Your answer</span>';
        }
      }

      html += `
        <button class="${optClass}" type="button" data-key="${escapeHtml(opt.key)}" aria-pressed="${selectedKey === opt.key ? 'true' : 'false'}"${showFeedback ? ' aria-disabled="true"' : ''}>
          <span class="k" aria-hidden="true">${escapeHtml(opt.key)}</span>
          <span class="t">${escapeHtml(opt.text)}</span>
          ${verdictBadge}
        </button>
      `;
    }
    html += '</div>';

    let noteHtml = '';
    if (showFeedback) {
      const answered = !!selectedKey;
      const isCorrect = answered && selectedKey === q.answer_key;
      const heading = isCorrect
        ? icon('check_circle') + '<span>Correctly answered</span>'
        : (answered ? icon('close') + '<span>Incorrect selection</span>' : '<span>Not answered</span>');
      noteHtml = `
        <div class="study-note ${isCorrect ? 'is-ok' : (answered ? 'is-bad' : '')}">
          <div class="sn-head">
            <span class="sn-verdict">${heading}</span>
            <span class="sn-key">Verified key: option ${escapeHtml(q.answer_key)}</span>
          </div>
          <div class="sn-body"><p>${escapeHtml(q.explanation || 'Verified from the source notes.')}</p></div>
        </div>
      `;
    }

    DOM.qContainer.className = 'question-content' + (q.type === 'multi_statement' ? ' is-multi' : '');
    DOM.qContainer.innerHTML = html;
    if (DOM.answerPanel) {
      DOM.answerPanel.innerHTML = noteHtml;
      DOM.answerPanel.hidden = !noteHtml;
    }

    DOM.qContainer.querySelectorAll('.opt').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (isTest && State.testSubmitted) return;
        if (isPractice && State.practiceRevealed) return;
        const key = btn.getAttribute('data-key');
        activeAnswers()[q.id] = key;
        updateStats();
        renderQuestion(true);
        renderPalette();
      });
    });

    if (DOM.workspace) {
      DOM.workspace.scrollTop = preservePageScroll ? pageScroll : 0;
    }

    if (DOM.prevBtn) DOM.prevBtn.disabled = State.currentIndex === 0;

    const isLast = State.currentIndex === qList.length - 1;
    if (DOM.nextBtn) {
      DOM.nextBtn.style.display = 'inline-flex';
      DOM.nextBtn.disabled = isLast;
    }

    if (DOM.submitBtn) {
      if (isTest) {
        DOM.submitBtn.style.display = 'inline-flex';
        DOM.submitBtn.disabled = State.testSubmitted;
        DOM.submitBtn.innerHTML = icon('check_circle') + `<span>${State.testSubmitted ? 'Submitted' : 'Submit Test'}</span>`;
      } else {
        DOM.submitBtn.style.display = isLast ? 'inline-flex' : 'none';
        DOM.submitBtn.disabled = State.practiceRevealed;
        DOM.submitBtn.innerHTML = icon(State.practiceRevealed ? 'check_circle' : 'check') + `<span>${State.practiceRevealed ? 'Practice Complete' : 'Finish Practice'}</span>`;
      }
    }

    if (DOM.examSubmitBtn) {
      DOM.examSubmitBtn.disabled = State.testSubmitted;
      DOM.examSubmitBtn.textContent = State.testSubmitted ? 'Submitted' : 'Submit Test';
    }

    updateExamAnswered();
  }

  // ==========================================================================
  // STATS & PALETTE
  // ==========================================================================
  function computeScore(answers, list) {
    const qList = list || activeQuestionList();
    const map = answers || State.testAnswers;
    let correct = 0;
    let wrong = 0;
    let skipped = 0;

    qList.forEach((q) => {
      const answer = map[q.id];
      if (!answer) skipped++;
      else if (answer === q.answer_key) correct++;
      else wrong++;
    });

    const isCtet = (State.currentModule && (State.currentModule.exam === 'ctet' || String(State.currentModule.id).startsWith('ctet_')));
    const markPerCorrect = isCtet ? 1 : 2;
    // Official exams have no negative marking (0 marks for wrong)
    const markPerWrong = 0;
    const score = correct * markPerCorrect - wrong * markPerWrong;
    const max = qList.length * markPerCorrect;
    return { total: qList.length, correct, wrong, skipped, score, max, markPerCorrect };
  }

  function updateExamAnswered() {
    if (!DOM.examAnswered || !State.currentModule) return;
    const total = activeQuestionList().length;
    DOM.examAnswered.textContent = `${answeredCount(State.testAnswers)}/${total} answered`;
  }

  function updateStats() {
    if (!State.currentModule) return;
    if (State.activeMode === 'revision') {
      const engine = revisionEngine();
      const items = currentRevisionItems();
      const stats = engine && items.length
        ? engine.getModuleRevisionStats(items, State.revision.progress, Date.now())
        : null;
      const reviewed = stats ? Math.max(0, stats.total - stats.newItems) : 0;
      if (DOM.liveAccNum) DOM.liveAccNum.textContent = stats ? String(stats.due) : '—';
      if (DOM.statCorrect) DOM.statCorrect.textContent = stats ? String(stats.newItems) : '–';
      if (DOM.statWrong) DOM.statWrong.textContent = stats ? String(stats.learning) : '–';
      if (DOM.railAccLabel) DOM.railAccLabel.textContent = 'Revision Queue';
      if (DOM.railAcc) DOM.railAcc.textContent = stats ? `${stats.due}` : '—';
      if (DOM.railBar) DOM.railBar.style.width = stats && stats.total ? `${Math.round((reviewed / stats.total) * 100)}%` : '0%';
      if (DOM.railSub) {
        DOM.railSub.textContent = stats
          ? `${stats.due} due now · ${stats.newItems} new · ${stats.total} items`
          : 'No revision items';
      }
      return;
    }
    if (DOM.railAccLabel) DOM.railAccLabel.textContent = 'Session Score';
    const resultsHidden = State.activeMode === 'test' && !State.testSubmitted;
    const total = activeQuestionList().length;

    if (resultsHidden) {
      const answered = answeredCount(State.testAnswers);
      if (DOM.liveAccNum) DOM.liveAccNum.textContent = '—';
      if (DOM.statCorrect) DOM.statCorrect.textContent = '–';
      if (DOM.statWrong) DOM.statWrong.textContent = '–';
      if (DOM.railAcc) DOM.railAcc.textContent = '—';
      if (DOM.railBar) DOM.railBar.style.width = `${total ? Math.round((answered / total) * 100) : 0}%`;
      if (DOM.railSub) DOM.railSub.textContent = `${answered} answered · results hidden`;
      return;
    }

    const answers = State.activeMode === 'test' ? State.testAnswers : State.practiceAnswers;
    const result = computeScore(answers);
    const attempted = result.correct + result.wrong;
    const acc = attempted > 0 ? Math.round((result.correct / attempted) * 100) : 0;

    if (DOM.liveAccNum) DOM.liveAccNum.textContent = `${acc}%`;
    if (DOM.statCorrect) DOM.statCorrect.textContent = result.correct;
    if (DOM.statWrong) DOM.statWrong.textContent = result.wrong;
    if (DOM.railAcc) DOM.railAcc.textContent = `${acc}%`;
    if (DOM.railBar) DOM.railBar.style.width = `${result.total ? Math.round((attempted / result.total) * 100) : 0}%`;
    if (DOM.railSub) DOM.railSub.textContent = `${attempted} answered of ${result.total}`;
  }

  function renderPalette() {
    if (!DOM.livePalette || !State.currentModule) return;
    const qList = activeQuestionList();
    const answers = activeAnswers();
    const showVerdicts = State.activeMode === 'test' && State.testSubmitted;
    DOM.livePalette.innerHTML = '';

    qList.forEach((q, idx) => {
      const answer = answers[q.id];
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'palette-btn';
      if (idx === State.currentIndex) btn.classList.add('current');

      if (answer) {
        if (showVerdicts) {
          btn.classList.add(answer === q.answer_key ? 'correct' : 'wrong');
        } else {
          btn.classList.add('answered');
        }
      }

      btn.textContent = idx + 1;
      const stateLabel = !answer ? 'not answered' : (showVerdicts ? (answer === q.answer_key ? 'correct' : 'wrong') : 'answered');
      btn.setAttribute('aria-label', `Question ${idx + 1}, ${stateLabel}`);
      btn.addEventListener('click', () => {
        State.currentIndex = idx;
        renderQuestion();
        renderPalette();
      });
      DOM.livePalette.appendChild(btn);
    });
  }

  // ==========================================================================
  // SUBMIT & SCORECARD
  // ==========================================================================
  function completeTest() {
    if (!State.testStarted || State.testSubmitted) return;

    State.testSubmitted = true;
    stopTimer();
    if (State.testEndsAt) {
      const remaining = Math.max(0, Math.ceil((State.testEndsAt - Date.now()) / 1000));
      State.testRemainingSeconds = remaining;
      State.timerSeconds = Math.max(0, State.testDurationSeconds - remaining);
    } else {
      State.timerSeconds = State.testStartedAt ? Math.floor((Date.now() - State.testStartedAt) / 1000) : 0;
    }
    updateTimerDisplay();
    updateTestScreen();

    if (State.activeMode === 'test') {
      renderQuestion();
      renderPalette();
      updateStats();
    }

    const result = computeScore(State.testAnswers, State.testQuestions);
    State.lastResult = result;
    saveAttempt(result);

    openScorecard(result);
  }

  function submitTest() {
    if (!State.currentModule) return;

    if (State.activeMode !== 'test') {
      if (State.practiceRevealed) return;
      // Practice "Finish" reveals explanations without a scorecard.
      State.practiceRevealed = true;
      renderQuestion(true);
      renderPalette();
      showToast('Practice set complete. Answer keys and explanations are now visible.');
      return;
    }

    completeTest();
  }

  async function saveAttempt(result) {
    if (!State.currentModule || !window.OfflineStorage) return;
    const attempt = {
      id: 'attempt_' + Date.now(),
      moduleId: State.currentModule.id,
      moduleTitle: State.currentModule.title,
      createdAt: new Date().toISOString(),
      total: result.total,
      correct: result.correct,
      wrong: result.wrong,
      skipped: result.skipped,
      score: Number(result.score.toFixed(2)),
      max: result.max,
      timeSeconds: State.timerSeconds,
      answers: Object.assign({}, State.testAnswers)
    };
    try {
      await window.OfflineStorage.saveAttempt(attempt);
    } catch (e) {
      console.warn('Could not save exam attempt:', e);
    }
  }

  function openScorecard(result) {
    if (!DOM.scoreModal) return;

    if (DOM.scoreTitle) DOM.scoreTitle.textContent = result.score.toFixed(2);
    if (DOM.scoreMax) DOM.scoreMax.textContent = `out of ${result.max.toFixed(2)}`;
    if (DOM.scoreCorrect) DOM.scoreCorrect.textContent = result.correct;
    if (DOM.scoreWrong) DOM.scoreWrong.textContent = result.wrong;
    if (DOM.scoreSkipped) DOM.scoreSkipped.textContent = result.skipped;
    if (DOM.scoreTime) DOM.scoreTime.textContent = formatTime(State.timerSeconds);

    const pct = result.max > 0 ? (result.score / result.max) * 100 : 0;
    let band = 'Needs another pass';
    let bandClass = 'low';
    if (pct >= 80) { band = 'Excellent'; bandClass = 'high'; }
    else if (pct >= 60) { band = 'Strong result'; bandClass = 'high'; }
    else if (pct >= 35) { band = 'Good progress'; bandClass = 'mid'; }
    if (DOM.scoreBand) {
      DOM.scoreBand.textContent = band;
      DOM.scoreBand.className = 'score-band ' + bandClass;
    }
    if (DOM.scoreNote) {
      DOM.scoreNote.textContent = `Marking: +${MARKS_CORRECT.toFixed(2)} for a correct answer, −${MARKS_WRONG.toFixed(2)} for a wrong answer. Unanswered questions score 0.`;
    }

    DOM.scoreModal.classList.add('open');
    if (DOM.scoreReviewBtn) {
      setTimeout(() => DOM.scoreReviewBtn.focus(), 30);
    }
  }

  function closeScorecard() {
    if (!DOM.scoreModal) return;
    DOM.scoreModal.classList.remove('open');
    if (DOM.submitBtn) DOM.submitBtn.focus();
  }

  function openAbout() {
    if (!DOM.aboutModal) return;
    DOM.aboutModal.classList.add('open');
    if (DOM.aboutCloseBtn) {
      setTimeout(() => DOM.aboutCloseBtn.focus(), 30);
    }
  }

  function closeAbout() {
    if (!DOM.aboutModal) return;
    DOM.aboutModal.classList.remove('open');
    if (DOM.aboutBtn) DOM.aboutBtn.focus();
  }

  // Android hardware/gesture back: close overlays, step back to the Library,
  // and only exit the app from the Library itself. Returns true when handled.
  function handleAndroidBack() {
    if (DOM.processModal && DOM.processModal.classList.contains('open')) {
      closeProcessingDialog();
      return true;
    }
    if (DOM.scoreModal && DOM.scoreModal.classList.contains('open')) {
      closeScorecard();
      return true;
    }
    if (DOM.aboutModal && DOM.aboutModal.classList.contains('open')) {
      closeAbout();
      return true;
    }
    if (State.navOpen) {
      setNavOpen(false, { returnFocus: true });
      return true;
    }
    if (State.activeMode !== 'library') {
      switchMode('library');
      return true;
    }
    if (State.libraryClass !== null) {
      State.libraryClass = null;
      renderLibrary();
      return true;
    }
    return false;
  }
  window.__studysynthBack = handleAndroidBack;

  function reviewAnswers() {
    if (!State.currentModule) return;
    closeScorecard();
    const qList = State.testQuestions.length ? State.testQuestions : State.currentModule.questions;
    let target = qList.findIndex((q) => {
      const answer = State.testAnswers[q.id];
      return !answer || answer !== q.answer_key;
    });
    if (target < 0) target = 0;
    State.currentIndex = target;
    switchMode('test');
    showToast('Use the previous and next controls to review every answer.');
  }

  function retakeTest() {
    if (!State.currentModule) return;
    closeScorecard();
    resetExamState();
    switchMode('test');
    if (DOM.testStartBtn) setTimeout(() => DOM.testStartBtn.focus(), 30);
    showToast('Choose your question count and time, then start a fresh test.');
  }

  // ==========================================================================
  // PROCESSING JOBS (background-capable)
  // ==========================================================================
  let Processing = null;
  let processExpanded = true;
  let processReturnFocus = null;
  let processLastAnnouncement = '';
  let processHideTimer = null;
  let recoveryJob = null;
  let recoveryQueue = [];
  let completedModule = null;

  function createGenerationWorker() {
    try {
      return new Worker(new URL('./engine/worker.js', document.baseURI), { name: 'studysynth-generator' });
    } catch (err) {
      console.warn('Background worker unavailable; using the on-device fallback.', err);
      return null;
    }
  }

  function initProcessing() {
    if (!window.StudySynthJobs) {
      console.warn('Processing jobs module is unavailable.');
      return;
    }
    Processing = window.StudySynthJobs.createJobManager({
      storage: window.OfflineStorage,
      saveModule: (module) => window.OfflineStorage.saveModule(module),
      workers: { create: createGenerationWorker },
      analyze: (payload, hooks) => window.StudySynthAnalysis.analyzeSource(
        payload.text,
        payload.title,
        payload.sourceMeta,
        payload.targetCount,
        hooks
      ),
      readFile: (file, onProgress, options) => window.OfflineDocParser.readFileContentDetailed(file, onProgress, options),
      onUpdate: renderProcessing,
      onSettled: handleProcessingSettled
    });
    bindProcessingEvents();
    checkInterruptedJobs();
  }

  function bindProcessingEvents() {
    if (DOM.processMinimizeBtn) DOM.processMinimizeBtn.addEventListener('click', minimizeProcessing);
    if (DOM.processCancelBtn) {
      DOM.processCancelBtn.addEventListener('click', () => {
        if (!Processing) return;
        if (!Processing.cancel()) showToast('The study module is finishing its save.');
      });
    }
    if (DOM.processResumeBtn) DOM.processResumeBtn.addEventListener('click', resumeRecovery);
    if (DOM.processRetryBtn) {
      DOM.processRetryBtn.addEventListener('click', () => {
        if (!Processing || !Processing.retry()) showToast('This job cannot be retried.');
      });
    }
    if (DOM.processOpenBtn) DOM.processOpenBtn.addEventListener('click', openCompletedModule);
    if (DOM.processDiscardBtn) DOM.processDiscardBtn.addEventListener('click', discardRecovery);
    if (DOM.processCloseBtn) DOM.processCloseBtn.addEventListener('click', closeProcessingDialog);
    if (DOM.processChip) DOM.processChip.addEventListener('click', openProcessingDialog);
    if (DOM.processModal) DOM.processModal.addEventListener('keydown', handleProcessKeydown);

    document.addEventListener('visibilitychange', () => {
      if (!Processing || document.hidden) return;
      // A hidden tab is best-effort only. Never cancel just because the page
      // was hidden; reconcile the dialog with the live job when it returns.
      Processing.refresh();
      if (recoveryJob) paintProcessing(recoveryJob);
    });
  }

  async function checkInterruptedJobs() {
    if (!Processing) return;
    try {
      recoveryQueue = await Processing.listInterrupted();
    } catch (err) {
      recoveryQueue = [];
    }
    if (!recoveryQueue.length) return;
    recoveryJob = recoveryQueue.shift();
    processExpanded = true;
    paintProcessing(recoveryJob);
  }

  function setAppInert(inert) {
    if (!DOM.appShell) return;
    try { DOM.appShell.inert = inert; } catch (err) { /* older WebView */ }
    if (inert) DOM.appShell.setAttribute('aria-hidden', 'true');
    else DOM.appShell.removeAttribute('aria-hidden');
  }

  function clearProcessingHide() {
    if (processHideTimer) {
      clearTimeout(processHideTimer);
      processHideTimer = null;
    }
  }

  function focusProcessingDialog() {
    if (!DOM.processModal) return;
    const preferred = [DOM.processCancelBtn, DOM.processResumeBtn, DOM.processRetryBtn, DOM.processOpenBtn, DOM.processCloseBtn, DOM.processDiscardBtn];
    const target = preferred.find((btn) => btn && !btn.hidden && !btn.disabled);
    if (target) {
      setTimeout(() => target.focus(), 30);
    } else {
      const card = DOM.processModal.querySelector('.process-card');
      if (card) setTimeout(() => card.focus(), 30);
    }
  }

  function openProcessingDialog() {
    const job = recoveryJob || (Processing && Processing.getCurrent());
    if (!job) return;
    clearProcessingHide();
    processExpanded = true;
    paintProcessing(job);
  }

  function minimizeProcessing() {
    const job = recoveryJob || (Processing && Processing.getCurrent());
    if (!job) return;
    if (job.status !== 'running' && !recoveryJob) {
      closeProcessingDialog();
      return;
    }
    processExpanded = false;
    paintProcessing(job);
    if (job.status === 'completed') scheduleProcessingHide();
  }

  function closeProcessingDialog() {
    if (recoveryJob) {
      processExpanded = false;
      paintProcessing(recoveryJob);
      return;
    }
    const job = Processing && Processing.getCurrent();
    if (job && job.status !== 'running') {
      Processing.dismiss();
      processExpanded = false;
      paintProcessing(null);
      return;
    }
    if (job) {
      minimizeProcessing();
      return;
    }
    processExpanded = false;
    paintProcessing(null);
  }

  function handleProcessKeydown(event) {
    if (!DOM.processModal) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeProcessingDialog();
      return;
    }
    if (event.key !== 'Tab') return;
    const card = DOM.processModal.querySelector('.process-card');
    if (!card) return;
    const items = Array.prototype.slice.call(
      card.querySelectorAll('button:not([hidden]):not([disabled])')
    ).filter((el) => el.offsetParent !== null);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function processCountText(job) {
    const p = job.progress || {};
    if (p.total && p.completed != null) return `${p.completed} of ${p.total} pages`;
    if (job.status === 'completed') return 'Completed';
    if (job.status === 'interrupted') return 'Paused';
    if (!p.indeterminate && p.percent != null) return job.stage === 'ocr' ? 'Recognising text' : 'Working';
    return 'Working';
  }

  function renderProcessStages(job) {
    if (!DOM.processStages) return;
    const stages = Array.isArray(job.stages) ? job.stages : [];
    DOM.processStages.innerHTML = stages.map((stage) => {
      const iconName = stage.state === 'done' ? 'check_circle'
        : stage.state === 'active' ? 'progress_activity'
          : stage.state === 'error' ? 'error' : 'radio_button_unchecked';
      const stateText = stage.state === 'done' ? 'Completed'
        : stage.state === 'active' ? 'In progress'
          : stage.state === 'error' ? 'Stopped' : 'Pending';
      return `<li class="process-stage is-${escapeHtml(stage.state)}">`
        + `<span class="ms-icon" aria-hidden="true">${iconName}</span>`
        + `<span>${escapeHtml(stage.label)}</span>`
        + `<span class="process-stage-state">${stateText}</span>`
        + '</li>';
    }).join('');
  }

  function paintProcessing(job) {
    const modalWasOpen = !!(DOM.processModal && DOM.processModal.classList.contains('open'));
    const modalOpen = !!job && processExpanded && job.status !== 'cancelled';
    const justOpened = modalOpen && !modalWasOpen;
    if (DOM.processModal) DOM.processModal.classList.toggle('open', modalOpen);

    if (justOpened) processReturnFocus = document.activeElement;
    if (!modalOpen && modalWasOpen) {
      const target = processReturnFocus;
      setTimeout(() => {
        if (!target || typeof target.focus !== 'function' || !document.contains(target)) return;
        if (target.disabled || target.hidden || target.getClientRects().length === 0) return;
        target.focus();
      }, 30);
    }
    setAppInert(modalOpen);

    if (!job) {
      if (DOM.processChip) DOM.processChip.hidden = true;
      setGenerateBusy(false);
      return;
    }

    const progress = job.progress || {};
    const determinate = !progress.indeterminate && progress.percent != null;
    const isImport = job.type === 'import';
    const isRecovery = job.status === 'interrupted';
    const isDone = job.status === 'completed';
    const isError = job.status === 'failed';
    const countText = processCountText(job);

    const title = isDone
      ? (isImport ? 'Your document is ready' : 'Your study module is ready')
      : isError ? 'Processing stopped'
        : isRecovery ? 'Processing was interrupted'
          : isImport ? 'Preparing your document' : 'Preparing your study module';
    if (DOM.processTitle) DOM.processTitle.textContent = title;
    if (DOM.processMessage) DOM.processMessage.textContent = job.message || 'Working…';

    if (DOM.processNotice) {
      let notice = '';
      if (job.resumed) notice = 'Resumed from the last saved step after an interruption.';
      else if (isRecovery && job.canResume) notice = 'Resume to continue from the last saved step.';
      else if (isRecovery && job.reason) notice = job.reason;
      DOM.processNotice.textContent = notice;
      DOM.processNotice.hidden = !notice;
    }

    if (DOM.processTrack) {
      DOM.processTrack.classList.toggle('is-indeterminate', !determinate && job.status === 'running');
      if (determinate) DOM.processTrack.setAttribute('aria-valuenow', String(progress.percent));
      else DOM.processTrack.removeAttribute('aria-valuenow');
      DOM.processTrack.setAttribute('aria-valuetext', determinate ? `${countText}, ${progress.percent}%` : countText);
    }
    if (DOM.processBar) DOM.processBar.style.width = determinate ? `${progress.percent}%` : '';
    if (DOM.processCount) DOM.processCount.textContent = countText;
    if (DOM.processPct) {
      DOM.processPct.hidden = !determinate;
      DOM.processPct.textContent = determinate ? `${progress.percent}%` : '';
    }
    renderProcessStages(job);

    if (DOM.processStorage) {
      const warning = job.storageWarning || '';
      DOM.processStorage.textContent = warning;
      DOM.processStorage.hidden = !warning;
    }

    const running = job.status === 'running';
    if (DOM.processMinimizeBtn) DOM.processMinimizeBtn.hidden = !running;
    if (DOM.processCancelBtn) {
      DOM.processCancelBtn.hidden = !running;
      DOM.processCancelBtn.disabled = !job.canCancel;
    }
    if (DOM.processResumeBtn) {
      DOM.processResumeBtn.hidden = !(isRecovery && job.canResume);
      DOM.processResumeBtn.disabled = false;
    }
    if (DOM.processRetryBtn) DOM.processRetryBtn.hidden = !(isError && job.canRetry);
    if (DOM.processOpenBtn) DOM.processOpenBtn.hidden = !(isDone && !isImport && !!completedModule);
    if (DOM.processDiscardBtn) DOM.processDiscardBtn.hidden = !isRecovery;
    if (DOM.processCloseBtn) DOM.processCloseBtn.hidden = !(isDone || isError || isRecovery);

    const announceKey = `${job.id}|${job.status}|${job.stage}`;
    if (announceKey !== processLastAnnouncement) {
      processLastAnnouncement = announceKey;
      if (DOM.processLive) {
        const normalize = (value) => String(value || '').replace(/[.\s]+$/g, '').trim();
        const detail = normalize(job.message) === normalize(title) ? '' : (job.message || '');
        DOM.processLive.textContent = `${title}. ${detail}`.trim();
      }
    }

    const showChip = !processExpanded && job.status !== 'cancelled';
    if (DOM.processChip) {
      DOM.processChip.hidden = !showChip;
      DOM.processChip.classList.toggle('is-done', isDone);
      DOM.processChip.classList.toggle('is-error', isError);
      if (showChip) {
        const chipStage = isDone
          ? (isImport ? 'Document ready' : 'Study module ready')
          : isError ? 'Processing stopped'
            : isRecovery ? 'Processing was interrupted'
              : (job.stageLabel || 'Working');
        const chipMeta = isRecovery ? (job.canResume ? 'Tap to resume' : 'Cannot resume')
          : isError ? 'Tap to review'
            : determinate ? (progress.total ? countText : `${progress.percent}% complete`)
              : 'Working';
        if (DOM.processChipStage) DOM.processChipStage.textContent = chipStage;
        if (DOM.processChipMeta) DOM.processChipMeta.textContent = chipMeta;
        if (DOM.processChipPct) {
          DOM.processChipPct.hidden = !determinate || isDone || isError;
          DOM.processChipPct.textContent = determinate ? `${progress.percent}%` : '';
        }
        DOM.processChip.setAttribute('aria-label', `Open processing details. ${chipStage}. ${chipMeta}.`);
      }
    }

    setGenerateBusy(running, job.type);
    if (justOpened) focusProcessingDialog();
  }

  function renderProcessing(job) {
    if (!job) {
      if (recoveryJob) {
        paintProcessing(recoveryJob);
        return;
      }
      paintProcessing(null);
      return;
    }
    recoveryJob = null;
    paintProcessing(job);
    if (job.status === 'completed' && !processExpanded) scheduleProcessingHide();
  }

  function scheduleProcessingHide() {
    clearProcessingHide();
    processHideTimer = setTimeout(() => {
      const job = Processing && Processing.getCurrent();
      if (job && job.status === 'completed' && !processExpanded) {
        Processing.dismiss();
        paintProcessing(null);
      }
    }, 8000);
  }

  function setGenerateBusy(busy, type) {
    if (!DOM.generateBtn) return;
    DOM.generateBtn.disabled = busy;
    const label = DOM.generateBtn.querySelector('.generate-label');
    const text = busy
      ? (type === 'import' ? 'Processing your document…' : 'Preparing your study module…')
      : 'Generate Quiz & Study Package';
    if (label) label.textContent = text;
    else DOM.generateBtn.textContent = text;
  }

  function applyImportedDocument(result) {
    completedModule = null;
    const detailed = result.detailed || {};
    const text = result.text || '';
    const fileName = (result.job && result.job.title) || 'Document';
    const title = fileName.replace(/\.[^/.]+$/, '');
    DOM.docText.value = text;
    DOM.docTitle.value = title;

    const lowConfidence = detailed.origin === 'ocr'
      && (!Number.isFinite(detailed.confidence) || detailed.confidence < 90);
    State.sourceMeta = {
      origin: detailed.origin || 'text',
      confidence: detailed.confidence,
      lowConfidence: lowConfidence,
      confirmed: !lowConfidence,
      edited: false,
      originalText: text
    };

    if (lowConfidence) {
      setFileStatus(`Loaded ${fileName} · OCR confidence ${Math.round(detailed.confidence)}%. Review and correct the text before generating.`, 'error');
      showToast('Review the extracted OCR text before generating.');
    } else {
      setFileStatus(`Loaded ${fileName} · ${text.length.toLocaleString()} characters extracted.`, 'ok');
      showToast(`Loaded ${fileName}. Review the text, then generate.`);
    }
  }

  function handleGeneratedModule(result) {
    const module = result.module;
    if (!module) return;
    completedModule = module;
    const questionCount = Array.isArray(module.questions) ? module.questions.length : 0;

    if (module.revisionOnly) {
      setFileStatus('Revision only · no MCQ passed source verification. This set was saved for revision.', 'error');
      showToast('Saved for revision only. No verified MCQs were published.');
    } else {
      setFileStatus(`Ready · ${questionCount} verified question${questionCount === 1 ? '' : 's'}.`, 'ok');
      showToast(`Saved “${module.title}”. ${questionCount} verified question${questionCount === 1 ? '' : 's'} available.`);
    }

    if (State.activeMode === 'generator') {
      setModule(module);
      switchMode('library');
      renderLibrary();
    } else if (State.activeMode === 'library') {
      renderLibrary();
    }
  }

  function handleProcessingSettled(result) {
    if (!result) return;
    if (result.status === 'cancelled') {
      processExpanded = false;
      if (Processing) Processing.dismiss();
      paintProcessing(null);
      showToast('Processing cancelled.');
      return;
    }
    if (result.status === 'failed') {
      const message = (result.error && result.error.message) || 'Processing stopped.';
      setFileStatus(message, 'error');
      showToast(message);
      return;
    }
    if (result.status === 'completed') {
      if (result.type === 'import') applyImportedDocument(result);
      else handleGeneratedModule(result);
      // The completed view is painted before onSettled runs, so repaint now
      // that the generated module is available to the dialog's open action.
      const current = Processing && Processing.getCurrent();
      if (current) paintProcessing(current);
      if (!processExpanded) scheduleProcessingHide();
    }
  }

  function openCompletedModule() {
    if (!completedModule) {
      closeProcessingDialog();
      return;
    }
    const module = completedModule;
    closeProcessingDialog();
    startLibraryMode(module, module.questions && module.questions.length ? 'practice' : 'revision');
    renderLibrary();
  }

  async function resumeRecovery() {
    if (!recoveryJob || !Processing) return;
    const id = recoveryJob.id;
    clearProcessingHide();
    processExpanded = true;
    if (DOM.processResumeBtn) DOM.processResumeBtn.disabled = true;
    const result = await Processing.resume(id);
    recoveryJob = null;
    const current = Processing.getCurrent();
    if (current) {
      paintProcessing(current);
    } else if (result.job) {
      paintProcessing(result.job);
    } else {
      paintProcessing(null);
    }
    if (!result.accepted) {
      if (result.reason === 'missing') {
        showToast('That saved job is no longer available.');
        showNextRecovery();
      } else {
        showToast('This job could not be resumed. Add the document again to continue.');
      }
    }
  }

  function showNextRecovery() {
    recoveryJob = recoveryQueue.length ? recoveryQueue.shift() : null;
    if (recoveryJob) {
      processExpanded = true;
      paintProcessing(recoveryJob);
    } else {
      processExpanded = false;
      paintProcessing(null);
    }
  }

  async function discardRecovery() {
    if (!recoveryJob || !Processing) return;
    const id = recoveryJob.id;
    await Processing.discard(id);
    recoveryJob = null;
    showNextRecovery();
    showToast('The interrupted job was removed.');
  }

  // ==========================================================================
  // GENERATOR
  // ==========================================================================
  async function handleGenerate() {
    const text = (DOM.docText.value || '').trim();
    if (!text) {
      setFileStatus('Add notes or a document first.', 'error');
      showToast('Please add notes, text, or a document first.');
      return;
    }
    if (text.length < 40) {
      setFileStatus('The text is too short to build a reliable quiz. Add at least a paragraph.', 'error');
      showToast('Add a little more source text to generate a quiz.');
      return;
    }

    const title = (DOM.docTitle.value || '').trim() || 'Custom Study Quiz';
    const sourceMeta = State.sourceMeta;
    if (sourceMeta && sourceMeta.origin === 'ocr' && sourceMeta.lowConfidence) {
      if (sourceMeta.originalText && text !== String(sourceMeta.originalText).trim()) {
        sourceMeta.confirmed = true;
        sourceMeta.edited = true;
      }
      if (!sourceMeta.confirmed) {
        const confirmNow = window.confirm(
          `On-device OCR confidence is ${Math.round(sourceMeta.confidence || 0)}%. ` +
          'Have you reviewed the extracted text? Choose OK to use it as-is, or Cancel to keep editing first.'
        );
        if (!confirmNow) {
          setFileStatus(`OCR confidence is ${Math.round(sourceMeta.confidence || 0)}%. Review and correct the extracted text, or confirm it explicitly, before generating.`, 'error');
          showToast('Low-confidence OCR needs your review before questions can be created.');
          return;
        }
        sourceMeta.confirmed = true;
      }
    }

    if (!Processing) {
      setFileStatus('Processing is unavailable. Reload the app and try again.', 'error');
      showToast('Processing is unavailable in this session.');
      return;
    }
    if (Processing.isBusy()) {
      processExpanded = true;
      openProcessingDialog();
      showToast('A study module is already being prepared.');
      return;
    }

    setFileStatus('Preparing questions…', '');
    processExpanded = true;
    completedModule = null;
    const started = Processing.startGeneration({
      title: title,
      text: text,
      sourceMeta: sourceMeta,
      targetCount: 15
    });
    if (!started.accepted) {
      processExpanded = true;
      paintProcessing(started.job || Processing.getCurrent());
      showToast('A study module is already being prepared.');
    }
  }

  // ==========================================================================
  // REVISION — adaptive, evidence-backed recall
  // ==========================================================================
  function revisionEngine() {
    return typeof window !== 'undefined' ? window.StudySynthRevision || null : null;
  }

  // Cards are derived from the saved module content and rebuilt only when the
  // active module changes, so switching modules never reuses another queue.
  function currentRevisionItems() {
    if (!State.currentModule) return [];
    const moduleId = State.currentModule.id;
    if (State.revision.itemsFor !== moduleId || !Array.isArray(State.revision.items)) {
      const engine = revisionEngine();
      State.revision.items = engine ? engine.buildRevisionItems(State.currentModule) : [];
      State.revision.itemsFor = moduleId;
      State.revision.session = null;
      State.revision.resumeCandidate = null;
      State.revision.progress = {};
      State.revision.revealed = false;
      State.revision.viewingPrev = false;
      State.revision.expandedEvidence = false;
    }
    return State.revision.items;
  }

  function revisionItemById(id) {
    return currentRevisionItems().find((item) => item && item.id === id) || null;
  }

  function showRevisionPanel(panel) {
    if (DOM.revisionDashboard) DOM.revisionDashboard.hidden = panel !== 'dashboard';
    if (DOM.revisionSession) DOM.revisionSession.hidden = panel !== 'session';
    if (DOM.revisionSummary) DOM.revisionSummary.hidden = panel !== 'summary';
    if (DOM.revisionUnavailable) DOM.revisionUnavailable.hidden = panel !== 'unavailable';
  }

  function showRevisionUnavailable(message) {
    if (DOM.revisionUnavailable) DOM.revisionUnavailable.textContent = message;
    showRevisionPanel('unavailable');
  }

  function formatRevisionWhen(timestamp, now) {
    if (!timestamp) return '';
    const diff = timestamp - now;
    if (diff <= 0) return 'now';
    const minutes = Math.round(diff / 60000);
    if (minutes < 60) return `in ${minutes} minute${minutes === 1 ? '' : 's'}`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `in ${hours} hour${hours === 1 ? '' : 's'}`;
    const days = Math.round(hours / 24);
    if (days < 30) return `in ${days} day${days === 1 ? '' : 's'}`;
    const months = Math.round(days / 30);
    return `in about ${months} month${months === 1 ? '' : 's'}`;
  }

  async function readRevisionSession(moduleId) {
    try {
      if (window.OfflineStorage && window.OfflineStorage.getRevisionSession) {
        return await window.OfflineStorage.getRevisionSession(moduleId);
      }
    } catch (e) { /* storage unavailable */ }
    return null;
  }

  function isResumableSession(session) {
    return !!(session && Array.isArray(session.itemIds) && session.itemIds.length && !session.completed);
  }

  // Due status is always recomputed from persisted timestamps on open.
  async function openRevision() {
    const engine = revisionEngine();
    if (!DOM.revisionDashboard) return;

    State.revision.revealed = false;
    State.revision.viewingPrev = false;
    State.revision.expandedEvidence = false;

    if (!State.currentModule) {
      showRevisionUnavailable('Choose a saved set from the Library before revising.');
      return;
    }
    if (!engine) {
      showRevisionUnavailable('The revision engine could not be loaded. Reload the app and try again.');
      return;
    }

    const items = currentRevisionItems();
    if (!items.length) {
      showRevisionUnavailable('This set has no source text that can be revised safely. Add clearer notes or a selectable PDF and try again.');
      return;
    }

    try {
      if (window.OfflineStorage && window.OfflineStorage.getRevisionProgress) {
        State.revision.progress = (await window.OfflineStorage.getRevisionProgress(State.currentModule.id)) || {};
      }
    } catch (e) {
      State.revision.progress = {};
      showToast('Revision progress could not be read.');
    }

    const saved = await readRevisionSession(State.currentModule.id);
    State.revision.resumeCandidate = isResumableSession(saved) ? saved : null;
    State.revision.session = null;

    renderRevisionDashboard();
    showRevisionPanel('dashboard');
    updateStats();
  }

  function renderRevisionDashboard() {
    const engine = revisionEngine();
    const mod = State.currentModule;
    if (!DOM.revisionDashboard || !engine || !mod) return;

    const items = currentRevisionItems();
    const now = Date.now();
    const stats = engine.getModuleRevisionStats(items, State.revision.progress, now);

    if (DOM.revDashTitle) DOM.revDashTitle.textContent = mod.title || 'Revision';
    if (DOM.revStatDue) DOM.revStatDue.textContent = String(stats.due);
    if (DOM.revStatNew) DOM.revStatNew.textContent = String(stats.newItems);
    if (DOM.revStatLearning) DOM.revStatLearning.textContent = String(stats.learning);
    if (DOM.revStatConsistent) DOM.revStatConsistent.textContent = String(stats.consistent);
    if (DOM.revStatTotal) DOM.revStatTotal.textContent = String(stats.total);

    const startable = stats.due + stats.newItems;
    if (DOM.revStartBtn) {
      DOM.revStartBtn.disabled = startable === 0;
      DOM.revStartBtn.textContent = stats.total <= engine.DEFAULT_SESSION_SIZE
        ? `Start revision (${startable} item${startable === 1 ? '' : 's'})`
        : 'Start revision';
    }

    const resumable = isResumableSession(State.revision.resumeCandidate);
    if (DOM.revResumeBtn) {
      DOM.revResumeBtn.hidden = !resumable;
      if (resumable) {
        const position = Math.min(State.revision.resumeCandidate.cursor + 1, State.revision.resumeCandidate.itemIds.length);
        DOM.revResumeBtn.textContent = `Resume session (item ${position} of ${State.revision.resumeCandidate.itemIds.length})`;
      }
    }

    let note;
    if (startable === 0) {
      note = 'Nothing is due right now.';
      if (stats.nextDueAt) {
        note = `Nothing is due right now. The next item returns ${formatRevisionWhen(stats.nextDueAt, now)}.`;
      }
      if (stats.newItems === 0 && stats.consistent > 0 && !stats.nextDueAt) {
        note = 'Nothing is due right now. You have recalled every item in this set consistently.';
      }
    } else {
      const parts = [];
      if (stats.due) parts.push(`${stats.due} due`);
      if (stats.newItems) parts.push(`${stats.newItems} new`);
      note = `A session draws up to ${engine.DEFAULT_SESSION_SIZE} items, taking ${parts.join(' and ')} first.`;
      if (stats.due === 0) note = `No item is due yet. A session will start with the ${stats.newItems} new item${stats.newItems === 1 ? '' : 's'}.`;
    }
    if (DOM.revDashNote) DOM.revDashNote.textContent = note;

    if (DOM.setTitle) DOM.setTitle.textContent = `${stats.total} REVISION ITEM${stats.total === 1 ? '' : 'S'}`;
    if (DOM.setTopic) DOM.setTopic.textContent = mod.title || 'Revision';
  }

  async function revisionAttempts(moduleId) {
    try {
      if (window.OfflineStorage && window.OfflineStorage.getAttempts) {
        const list = await window.OfflineStorage.getAttempts(moduleId);
        return Array.isArray(list) ? list : [];
      }
    } catch (e) { /* storage unavailable */ }
    return [];
  }

  async function persistRevisionSession() {
    const session = State.revision.session;
    if (!session || !window.OfflineStorage) return;
    try {
      if (session.completed) await window.OfflineStorage.deleteRevisionSession(session.moduleId);
      else await window.OfflineStorage.saveRevisionSession(session);
    } catch (e) {
      showToast('This session could not be saved.');
    }
  }

  async function startRevisionSession() {
    const engine = revisionEngine();
    const mod = State.currentModule;
    if (!engine || !mod) return;
    const items = currentRevisionItems();
    const attempts = await revisionAttempts(mod.id);
    const session = engine.buildSession(items, State.revision.progress, attempts, {
      now: Date.now(),
      size: engine.DEFAULT_SESSION_SIZE,
      moduleId: mod.id,
      questions: Array.isArray(mod.questions) ? mod.questions : []
    });

    if (!session.itemIds.length) {
      State.revision.session = null;
      State.revision.resumeCandidate = null;
      renderRevisionDashboard();
      showRevisionPanel('dashboard');
      showToast('Nothing is due right now. Your next item returns when its interval ends.');
      return;
    }

    State.revision.session = session;
    State.revision.resumeCandidate = null;
    State.revision.revealed = false;
    State.revision.viewingPrev = false;
    State.revision.expandedEvidence = false;
    await persistRevisionSession();
    renderRevisionSession();
    showRevisionPanel('session');
    updateStats();
  }

  function resumeRevisionSession() {
    const engine = revisionEngine();
    if (!engine) return;
    const restored = engine.resumeSession(State.revision.resumeCandidate, currentRevisionItems());
    if (!restored || !restored.itemIds.length) {
      State.revision.resumeCandidate = null;
      showToast('The saved session no longer matches this set. Starting fresh.');
      renderRevisionDashboard();
      showRevisionPanel('dashboard');
      return;
    }
    State.revision.session = restored;
    State.revision.revealed = false;
    State.revision.viewingPrev = false;
    State.revision.expandedEvidence = false;
    renderRevisionSession();
    showRevisionPanel('session');
    updateStats();
  }

  function renderRevisionSession() {
    const session = State.revision.session;
    if (!session || !DOM.revisionSession) return;
    const total = session.itemIds.length;
    if (session.cursor >= total) {
      finishRevisionSession();
      return;
    }

    const viewingPrev = State.revision.viewingPrev && session.cursor > 0;
    const index = viewingPrev ? session.cursor - 1 : session.cursor;
    const card = revisionItemById(session.itemIds[index]);
    if (!card) {
      // The saved session referenced an item that no longer exists.
      session.cursor = Math.min(Math.max(index + 1, session.cursor), total);
      if (session.cursor >= total) { finishRevisionSession(); return; }
      State.revision.viewingPrev = false;
      renderRevisionSession();
      return;
    }

    if (DOM.revPos) DOM.revPos.textContent = `Item ${session.cursor + 1} of ${total}`;
    const pct = total ? Math.round((session.cursor / total) * 100) : 0;
    if (DOM.revProgressBar) DOM.revProgressBar.style.width = `${pct}%`;
    if (DOM.revProgress) DOM.revProgress.setAttribute('aria-valuenow', String(pct));

    if (DOM.revForm) DOM.revForm.textContent = card.formLabel || 'Recall';
    if (DOM.revPrompt) DOM.revPrompt.textContent = card.prompt || '';

    const revealed = viewingPrev || State.revision.revealed;
    if (DOM.revAnswer) DOM.revAnswer.hidden = !revealed;
    if (revealed) {
      if (DOM.revAnswerText) DOM.revAnswerText.textContent = card.answer || '';
      renderRevisionEvidence(card);
    }

    const canRate = revealed && !viewingPrev && !session.completed;
    if (DOM.revRatings) DOM.revRatings.hidden = !canRate;
    if (DOM.revRevealBtn) DOM.revRevealBtn.hidden = revealed;
    if (DOM.revBackBtn) DOM.revBackBtn.hidden = !viewingPrev;
    if (DOM.revPrevBtn) DOM.revPrevBtn.hidden = viewingPrev || session.cursor === 0;
  }

  function renderRevisionEvidence(card) {
    const section = card.sectionTitle || 'Source';
    const page = Number.isFinite(card.sourcePage) ? card.sourcePage : null;
    const refParts = [section];
    if (page) refParts.push(`page ${page}`);
    if (DOM.revSourceRef) DOM.revSourceRef.textContent = `Evidence · ${refParts.join(' · ')}`;

    const excerpt = card.excerpt || card.statement || '';
    const answer = card.answer || '';
    const trimmedExcerpt = excerpt.length > 160 ? `${excerpt.slice(0, 157).trimEnd()}…` : excerpt;
    const hasMore = excerpt.length > trimmedExcerpt.length;

    if (DOM.revEvidenceShort) DOM.revEvidenceShort.textContent = hasMore ? trimmedExcerpt : excerpt;
    if (DOM.revEvidenceShort) DOM.revEvidenceShort.hidden = false;
    if (DOM.revEvidenceFull) {
      DOM.revEvidenceFull.textContent = excerpt;
      DOM.revEvidenceFull.hidden = true;
    }
    if (DOM.revEvidenceToggle) {
      DOM.revEvidenceToggle.hidden = !hasMore;
      DOM.revEvidenceToggle.textContent = 'Show full excerpt';
    }
    State.revision.expandedEvidence = false;
    if (!excerpt && DOM.revSourceRef) DOM.revSourceRef.textContent = `Evidence · ${refParts.join(' · ')} (excerpt unavailable)`;
    if (!answer && DOM.revAnswerText) DOM.revAnswerText.textContent = card.statement || '';
  }

  function revealRevisionAnswer() {
    if (State.revision.viewingPrev) return;
    State.revision.revealed = true;
    renderRevisionSession();
  }

  function toggleRevisionEvidence() {
    const full = State.revision.expandedEvidence;
    State.revision.expandedEvidence = !full;
    if (DOM.revEvidenceShort) DOM.revEvidenceShort.hidden = !full;
    if (DOM.revEvidenceFull) DOM.revEvidenceFull.hidden = full;
    if (DOM.revEvidenceToggle) DOM.revEvidenceToggle.textContent = full ? 'Show full excerpt' : 'Show less';
  }

  function viewPreviousRevisionCard() {
    const session = State.revision.session;
    if (!session || session.cursor === 0) return;
    State.revision.viewingPrev = true;
    State.revision.expandedEvidence = false;
    renderRevisionSession();
  }

  function returnToCurrentRevisionCard() {
    State.revision.viewingPrev = false;
    State.revision.expandedEvidence = false;
    renderRevisionSession();
  }

  // A rating is written to storage before the queue advances, so a reload can
  // never lose a review the learner already submitted.
  async function rateRevision(rating) {
    const engine = revisionEngine();
    const session = State.revision.session;
    if (!engine || !session || State.revision.saving || session.completed) return;
    if (State.revision.viewingPrev) return;

    const itemId = session.itemIds[session.cursor];
    if (!itemId) return;

    const now = Date.now();
    const result = engine.rateSessionItem(session, itemId, rating, State.revision.progress, now);
    if (result.ignored) return;

    State.revision.saving = true;
    State.revision.session = result.session;
    State.revision.progress = result.progress;
    State.revision.revealed = false;
    State.revision.viewingPrev = false;
    State.revision.expandedEvidence = false;

    try {
      if (window.OfflineStorage && window.OfflineStorage.saveRevisionProgress) {
        const record = engine.getItemProgress(itemId, result.progress, now);
        await window.OfflineStorage.saveRevisionProgress(record);
      }
      await persistRevisionSession();
    } catch (e) {
      showToast('This rating could not be saved.');
    } finally {
      State.revision.saving = false;
    }

    if (State.revision.session.completed) {
      finishRevisionSession();
      return;
    }
    renderRevisionSession();
    updateStats();
  }

  async function pauseRevisionSession() {
    if (!State.revision.session) {
      showRevisionPanel('dashboard');
      renderRevisionDashboard();
      return;
    }
    await persistRevisionSession();
    State.revision.resumeCandidate = State.revision.session;
    State.revision.revealed = false;
    State.revision.viewingPrev = false;
    renderRevisionDashboard();
    showRevisionPanel('dashboard');
    updateStats();
    showToast('Session paused. Resume it any time from this set.');
  }

  async function finishRevisionSession() {
    const engine = revisionEngine();
    const session = State.revision.session;
    if (!engine || !session) { showRevisionPanel('dashboard'); return; }

    await persistRevisionSession();
    State.revision.resumeCandidate = null;

    const now = Date.now();
    const summary = engine.getSessionSummary(session, State.revision.progress, now);
    if (DOM.revSumReviewed) DOM.revSumReviewed.textContent = String(summary.reviewed);
    if (DOM.revSumAgain) DOM.revSumAgain.textContent = String(summary.counts.again);
    if (DOM.revSumHard) DOM.revSumHard.textContent = String(summary.counts.hard);
    if (DOM.revSumGood) DOM.revSumGood.textContent = String(summary.counts.good);
    if (DOM.revSumEasy) DOM.revSumEasy.textContent = String(summary.counts.easy);

    if (DOM.revSumRemaining) {
      DOM.revSumRemaining.textContent = summary.remainingDue > 0
        ? `${summary.remainingDue} item${summary.remainingDue === 1 ? '' : 's'} from this session are due again now.`
        : 'Nothing from this session is due again right now.';
    }
    if (DOM.revSumNext) {
      let nextMessage = '';
      if (summary.nextDueAt) nextMessage = `Next item returns ${formatRevisionWhen(summary.nextDueAt, now)}.`;
      const dashStats = engine.getModuleRevisionStats(currentRevisionItems(), State.revision.progress, now);
      if (dashStats.due > 0) {
        nextMessage = `${dashStats.due} item${dashStats.due === 1 ? '' : 's'} in this set are still due now.`;
      }
      DOM.revSumNext.textContent = nextMessage;
    }

    showRevisionPanel('summary');
    updateStats();
  }

  async function resetRevisionProgress() {
    const mod = State.currentModule;
    if (!mod) return;
    const title = mod.title || 'this set';
    if (!window.confirm(`Reset all revision progress for “${title}”? Ratings and scheduling for this set will be cleared. This cannot be undone.`)) {
      return;
    }
    try {
      if (window.OfflineStorage && window.OfflineStorage.resetRevisionProgress) {
        await window.OfflineStorage.resetRevisionProgress(mod.id);
      }
      if (window.OfflineStorage && window.OfflineStorage.deleteRevisionSession) {
        await window.OfflineStorage.deleteRevisionSession(mod.id);
      }
    } catch (e) {
      showToast('Revision progress could not be cleared.');
    }
    State.revision.progress = {};
    State.revision.session = null;
    State.revision.resumeCandidate = null;
    State.revision.revealed = false;
    State.revision.viewingPrev = false;
    showToast('Revision progress reset for this set.');
    renderRevisionDashboard();
    showRevisionPanel('dashboard');
    updateStats();
  }

  // ==========================================================================
  // LIBRARY
  // Bundled sets ship only their index entry at startup; the full body is
  // fetched the moment a learner opens one, so the library renders instantly.
  function moduleQuestionCount(mod) {
    if (!mod) return 0;
    if (Array.isArray(mod.questions)) return mod.questions.length;
    return Number(mod.questionCount) || 0;
  }

  async function resolveModuleBody(mod) {
    if (!mod) return null;
    if (Array.isArray(mod.questions) || Array.isArray(mod.inventory)) return mod;
    try {
      if (window.OfflineStorage && window.OfflineStorage.getModule) {
        const full = await window.OfflineStorage.getModule(mod.id);
        if (full && full.id && (Array.isArray(full.questions) || Array.isArray(full.inventory))) {
          return full;
        }
      }
    } catch (e) { /* reported below */ }
    showToast('This set could not be opened. Reconnect once so it can finish downloading.');
    return null;
  }

  async function startLibraryMode(mod, mode) {
    if (!mod) return;
    mod = await resolveModuleBody(mod);
    if (!mod) return;
    const questionCount = Array.isArray(mod.questions) ? mod.questions.length : 0;
    if (!questionCount && (mode === 'practice' || mode === 'test')) {
      showToast('No questions available for this set.');
      return;
    }
    setModule(mod);
    if (mode === 'test') {
      State.testModeType = 'chapter';
    }
    switchMode(mode);
  }

  
  function updateExamTabs() {
    const isUgc = (State.libraryExam || 'ugc_net') === 'ugc_net';
    if (DOM.examTabUgc) {
      DOM.examTabUgc.classList.toggle('active', isUgc);
      DOM.examTabUgc.setAttribute('aria-selected', isUgc ? 'true' : 'false');
    }
    if (DOM.examTabCtet) {
      DOM.examTabCtet.classList.toggle('active', !isUgc);
      DOM.examTabCtet.setAttribute('aria-selected', !isUgc ? 'true' : 'false');
    }
    
    if (DOM.examTabUgc) {
      DOM.examTabUgc.addEventListener('click', () => {
        State.libraryExam = 'ugc_net';
        State.libraryClass = null;
        updateExamTabs();
        renderLibrary();
      });
    }
    if (DOM.examTabCtet) {
      DOM.examTabCtet.addEventListener('click', () => {
        State.libraryExam = 'ctet';
        State.libraryClass = null;
        updateExamTabs();
        renderLibrary();
      });
    }
    if (DOM.libSearchInput) {
      DOM.libSearchInput.placeholder = isUgc
        ? 'Search UGC NET Education syllabus units or questions...'
        : 'Search CTET syllabus topics, papers, or questions...';
    }
  }

  function parseModuleHierarchy(mod) {
    if (!mod) return { subject: 'General', cls: 'General', chapter: 'Untitled set', originalTitle: 'Untitled set' };
    const title = (mod.title || '').trim();
    const parts = title.split(/\s*-\s*/);
    const isUgc = mod.exam === 'ugc_net' || String(mod.id || '').startsWith('ugc_net_');
    const defaultSubject = isUgc ? 'UGC NET Education (Code 09)' : 'CTET';

    if (parts.length >= 3) {
      return {
        subject: parts[0].trim() || defaultSubject,
        cls: parts[1].trim() || (mod.topic || 'General'),
        chapter: parts.slice(2).join(' - ').trim(),
        originalTitle: title
      };
    } else if (parts.length === 2) {
      return {
        subject: parts[0].trim() || defaultSubject,
        cls: parts[1].trim() || (mod.topic || 'General'),
        chapter: parts[1].trim(),
        originalTitle: title
      };
    }
    return {
      subject: defaultSubject,
      cls: mod.topic || 'General',
      chapter: title,
      originalTitle: title
    };
  }

  function cleanSetTitle(title) {
    return String(title || 'Practice set').replace(/\s*\(\d+\s*MCQs?\)\s*$/i, '').trim() || 'Practice set';
  }

  async function renderLibrary() {
    if (!DOM.libraryContainer) return;
    if (typeof updateExamTabs === 'function') updateExamTabs();
    DOM.libraryContainer.innerHTML = '<p class="empty-state">Loading study sets…</p>';

    let list = [];
    let attempts = [];
    let storageWarning = '';
    try {
      list = await window.OfflineStorage.getModules();
      if (window.OfflineStorage.getAttempts) attempts = await window.OfflineStorage.getAttempts();
    } catch (err) {
      storageWarning = 'Local storage is unavailable in this browser, so saved sets cannot be listed.';
    }

    list = (Array.isArray(list) && list.length) ? list : ((typeof globalThis !== 'undefined' && globalThis.CTET_INDEX) || window.CTET_INDEX || []);
    attempts = Array.isArray(attempts) ? attempts : [];

    const activeExam = State.libraryExam || 'ugc_net';

    const latestByModule = {};
    const countByModule = {};
    attempts.forEach((attempt) => {
      if (!attempt || !attempt.moduleId) return;
      countByModule[attempt.moduleId] = (countByModule[attempt.moduleId] || 0) + 1;
      if (!latestByModule[attempt.moduleId] || new Date(attempt.createdAt) > new Date(latestByModule[attempt.moduleId].createdAt)) {
        latestByModule[attempt.moduleId] = attempt;
      }
    });

    const topicMetaMap = {
      // UGC NET Education (Code 09) Units
      'Unit 1': {
        icon: 'school',
        desc: 'Philosophical & sociological foundations of education, Indian & Western philosophy schools, and constitutional provisions.'
      },
      'Unit 2': {
        icon: 'history',
        desc: 'Commissions, policy frameworks, financing of education, human capital theory, and political economy of education.'
      },
      'Unit 3': {
        icon: 'psychology',
        desc: 'Growth & development, cognitive & learning theories, intelligence, personality, mental health, and guidance & counselling.'
      },
      'Unit 4': {
        icon: 'workspace_premium',
        desc: 'Pre-service & in-service teacher education models, curriculum frameworks, apex agencies (NCTE, NCERT), and pedagogy.'
      },
      'Unit 5': {
        icon: 'menu_book',
        desc: 'Models of curriculum design, engineering, evaluation models (Tyler, Stufflebeam), and curriculum change implementation.'
      },
      'Unit 6': {
        icon: 'fact_check',
        desc: 'Quantitative & qualitative research methodologies, hypothesis testing, sampling, ANOVA, and statistical tools.'
      },
      'Unit 7': {
        icon: 'quiz',
        desc: 'Pedagogical & andragogical models (Knowles), interaction analysis (Flanders), assessment rubrics, and portfolio evaluation.'
      },
      'Unit 8': {
        icon: 'bolt',
        desc: 'ICT in education, e-learning models, SWAYAM, instructional design, assistive technologies, and digital pedagogy.'
      },
      'Unit 9': {
        icon: 'assignment',
        desc: 'Educational management, leadership theories, Total Quality Management (Deming), Six Sigma, and institutional governance.'
      },
      'Unit 10': {
        icon: 'public',
        desc: 'Concepts of inclusive education, RPwD Act 2016, barriers, assistive technologies, and pedagogical adaptations.'
      },
      // CTET Child Development & Pedagogy (CDP) Topics
      'ctet_cdp_growth_development': {
        icon: 'psychology',
        desc: 'Principles of development, heredity & environment, and primary & secondary socialization processes.'
      },
      'ctet_cdp_theories': {
        icon: 'menu_book',
        desc: 'Constructs and critical perspectives of Jean Piaget, Lawrence Kohlberg, and Lev Vygotsky.'
      },
      'ctet_cdp_progressive_intelligence': {
        icon: 'school',
        desc: 'Child-centred & progressive education (Dewey), multi-dimensional intelligence (Gardner), language & thought, and gender.'
      },
      'ctet_cdp_inclusive': {
        icon: 'diversity_3',
        desc: 'Addressing diverse learners, learning difficulties (Dyslexia, ADHD), and gifted & talented children.'
      },
      'ctet_cdp_learning_pedagogy': {
        icon: 'lightbulb',
        desc: 'How children think and learn, child as problem solver, alternative conceptions, and motivation & emotion.'
      },
      'ctet_cdp_assessment': {
        icon: 'quiz',
        desc: 'Continuous & Comprehensive Evaluation (CCE), School-Based Assessment (SBA), and diagnostic teaching.'
      },
      // CTET Social Science (SST) Topics
      'ctet_sst_history': {
        icon: 'history',
        desc: 'Ancient, medieval, and modern Indian history: earliest societies, Indus Valley, Mauryas, Mughals to freedom struggle.'
      },
      'ctet_sst_geography': {
        icon: 'public',
        desc: 'The Earth, latitudes, longitudes, atmosphere, lithosphere, water, climate, agriculture, and resources.'
      },
      'ctet_sst_polity': {
        icon: 'account_balance',
        desc: 'Democracy, Indian Constitution, parliament, judiciary, government, rural & urban administration, and social justice.'
      },
      'ctet_sst_pedagogy': {
        icon: 'fact_check',
        desc: 'Concept & nature of social studies, enquiry/empirical evidence, primary/secondary sources, and project methods.'
      }
    };

    function getMeta(mod) {
      const id = String(mod.id || '').toLowerCase();
      if (topicMetaMap[id]) return topicMetaMap[id];
      if (id.includes('unit_10')) return topicMetaMap['Unit 10'];
      for (let i = 1; i <= 9; i++) {
        if (id.includes(`unit_${i}`) && !id.startsWith('ctet_')) return topicMetaMap[`Unit ${i}`];
      }
      return { icon: 'school', desc: 'Comprehensive practice set with verified exam MCQs.' };
    }

    function renderCard(mod) {
      const parsed = parseModuleHierarchy(mod);
      const meta = getMeta(mod);
      const last = latestByModule[mod.id];
      const attemptCount = countByModule[mod.id] || 0;
      const questionCount = moduleQuestionCount(mod);
      const revisionOnly = questionCount === 0;
      const date = mod.createdAt ? new Date(mod.createdAt).toLocaleDateString() : '';

      let displayTitle = mod.topic || parsed.cls || mod.title || 'Untitled set';
      displayTitle = cleanSetTitle(displayTitle);
      const subjectBadge = mod.subject ? `<span class="library-badge" style="background:var(--surface-variant, #e0e0e0);color:var(--on-surface-variant, #333);font-size:11px;">${escapeHtml(mod.subject)}</span>` : '';

      const isAllInOne = String(mod.id || '').includes('all_pyq');
      const scoreline = last
        ? `Last score ${Number(last.score).toFixed(2)}/${Number(last.max).toFixed(2)} · ${attemptCount} attempt${attemptCount === 1 ? '' : 's'}`
        : (revisionOnly ? 'Revision-only set · no verified MCQs' : 'Not attempted yet');

      return `
        <article class="library-card${revisionOnly ? ' is-revision-only' : ''}">
          <div class="library-card-head">
            <div class="library-file-icon">${icon(meta.icon)}</div>
            <div class="library-copy">
              <div class="library-title-row">
                <h3>${escapeHtml(displayTitle)}</h3>
                ${subjectBadge}
                ${revisionOnly ? '<span class="library-badge">Revision only</span>' : ''}
              </div>
              <div class="library-meta">
                <span><b>${questionCount}</b> Verified MCQs</span>
                <span>${isAllInOne ? 'All PYQs Combined' : 'Complete Topic Set'}</span>
                ${date ? `<span>${escapeHtml(date)}</span>` : ''}
              </div>
              <p class="library-card-desc" style="font-size:12px; color:var(--muted); margin:4px 0 0 0; line-height:1.4;">${escapeHtml(meta.desc)}</p>
              <div class="library-history" style="margin-top:6px;">${icon('history')}<span>${escapeHtml(scoreline)}</span></div>
            </div>
            ${String(mod.id || '').startsWith('ugc_net_') || String(mod.id || '').startsWith('ctet_') ? '' : `<button class="lib-del" type="button" data-id="${escapeHtml(mod.id)}" aria-label="Delete ${escapeHtml(displayTitle)}">${icon('delete')}</button>`}
          </div>
          <div class="library-modes" role="group" aria-label="Study modes for ${escapeHtml(displayTitle)}">
            <button class="lib-mode lib-mode-practice" type="button" data-id="${escapeHtml(mod.id)}" data-action="practice" aria-label="Practice ${escapeHtml(displayTitle)}"${revisionOnly ? ' disabled aria-disabled="true"' : ''}>
              ${icon('lightbulb')}
              <span class="lib-mode-copy"><b>Practice</b><small>${revisionOnly ? 'No MCQs' : 'Instant Feedback'}</small></span>
            </button>
            <button class="lib-mode lib-mode-test" type="button" data-id="${escapeHtml(mod.id)}" data-action="test" aria-label="Take an exam test on ${escapeHtml(displayTitle)}"${revisionOnly ? ' disabled aria-disabled="true"' : ''}>
              ${icon('timer')}
              <span class="lib-mode-copy"><b>Exam Test</b><small>${revisionOnly ? 'No MCQs' : 'Timed & Scored'}</small></span>
            </button>
          </div>
        </article>
      `;
    }

    function wireCardListeners(container, activeList) {
      container.querySelectorAll('.lib-mode').forEach((btn) => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-id');
          const action = btn.getAttribute('data-action');
          const target = activeList.find((m) => m.id === id);
          startLibraryMode(target, action);
        });
      });

      container.querySelectorAll('.lib-del').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          const target = activeList.find((m) => m.id === id);
          const title = target ? target.title : 'this set';
          if (!window.confirm(`Delete “${title}” from this device?`)) return;
          try {
            await window.OfflineStorage.deleteModule(id);
            renderLibrary();
            showToast('Study set deleted.');
          } catch (e) {
            showToast('The study set could not be deleted.');
          }
        });
      });
    }

    function renderBackButton(label, onClick) {
      if (!DOM.libBreadcrumbBar) return;
      if (!onClick) {
        DOM.libBreadcrumbBar.innerHTML = '';
        DOM.libBreadcrumbBar.hidden = true;
        return;
      }
      DOM.libBreadcrumbBar.hidden = false;
      DOM.libBreadcrumbBar.innerHTML = `
        <button id="libBackBtn" class="lib-back-btn" type="button" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}">
          ${icon('arrow_back')}
        </button>
      `;
      const btn = DOM.libBreadcrumbBar.querySelector('#libBackBtn');
      if (btn) btn.addEventListener('click', onClick);
    }

    // CASE 1: SEARCH ACTIVE
    if (State.librarySearch && State.librarySearch.trim()) {
      const q = State.librarySearch.trim().toLowerCase();
      const searchResults = list.filter((m) => (m.title || '').toLowerCase().includes(q) || (m.topic || '').toLowerCase().includes(q));

      renderBackButton('Clear search', () => {
        State.librarySearch = '';
        if (DOM.libSearchInput) DOM.libSearchInput.value = '';
        renderLibrary();
      });

      if (!searchResults.length) {
        DOM.libraryContainer.innerHTML = '<div class="empty-state"><strong>No matching topics or questions found.</strong><br>Try a different keyword or topic name.</div>';
        return;
      }

      let html = storageWarning ? `<p class="library-warning" role="status">${escapeHtml(storageWarning)}</p>` : '';
      html += `<div class="lib-hierarchy-grid">`;
      searchResults.forEach((mod) => {
        html += renderCard(mod);
      });
      html += `</div>`;
      DOM.libraryContainer.innerHTML = html;
      wireCardListeners(DOM.libraryContainer, searchResults);
      return;
    }

    renderBackButton('', null);

    // CASE 2: FILTER BY SELECTED EXAM (UGC NET vs CTET)
    let examSets = list.filter((mod) => {
      const id = String(mod.id || '');
      const exam = String(mod.exam || '');
      if (activeExam === 'ugc_net') {
        return exam === 'ugc_net' || id.startsWith('ugc_net_');
      } else {
        return exam === 'ctet' || id.startsWith('ctet_');
      }
    });

    const userSets = list.filter((mod) => {
      const id = String(mod.id || '');
      return !id.startsWith('ugc_net_') && !id.startsWith('ctet_');
    });
    if (activeExam === 'ugc_net' && userSets.length) {
      examSets = examSets.concat(userSets);
    }

    // Sort order
    if (activeExam === 'ugc_net') {
      examSets.sort((a, b) => {
        const numA = parseInt((String(a.id || '').match(/unit_(\d+)/i) || [])[1], 10) || 99;
        const numB = parseInt((String(b.id || '').match(/unit_(\d+)/i) || [])[1], 10) || 99;
        return numA - numB;
      });
    } else {
      // CTET: Sort by setNumber (CDP Units 1-6 first, then SST Units 1-4)
      examSets.sort((a, b) => {
        const setA = Number(a.setNumber) || 99;
        const setB = Number(b.setNumber) || 99;
        return setA - setB;
      });
    }

    const totalQuestions = examSets.reduce((sum, mod) => sum + moduleQuestionCount(mod), 0);
    const examHeading = activeExam === 'ugc_net' ? 'UGC NET Education (Code 09)' : 'CTET (Central Teacher Eligibility Test)';
    const examSub = activeExam === 'ugc_net'
      ? '10 Official Syllabus Units · 1 Comprehensive Practice Set Per Unit'
      : 'Official Syllabus Topics · Child Development & Social Science Only';

    let html = storageWarning ? `<p class="library-warning" role="status">${escapeHtml(storageWarning)}</p>` : '';
    html += `
      <div class="lib-level-header" style="margin-bottom:14px;">
        <div>
          <h3>${escapeHtml(examHeading)}</h3>
          <div class="lib-level-count">${examSets.length} study sets · ${totalQuestions} verified MCQs · ${escapeHtml(examSub)}</div>
        </div>
      </div>
      <div class="lib-hierarchy-grid">
    `;

    examSets.forEach((mod) => {
      html += renderCard(mod);
    });

    html += `</div>`;
    DOM.libraryContainer.innerHTML = html;
    wireCardListeners(DOM.libraryContainer, examSets);
  }

  // ==========================================================================
  // ANALYSIS — strengths, weaknesses and progress across completed mocks
  // ==========================================================================
  const ANALYSIS_MIN_SAMPLE = 6;

  function analysisBand(accuracy) {
    if (accuracy >= 75) return { label: 'Strong', cls: 'good' };
    if (accuracy >= 60) return { label: 'On track', cls: 'warn' };
    return { label: 'Needs work', cls: 'bad' };
  }

  function shortUnit(unit) {
    const match = String(unit || '').match(/Unit\s+(\d+)/i);
    return match ? 'Unit ' + match[1] : (unit || 'General');
  }

  function formatPercent(value) {
    return Math.round(value) + '%';
  }

  function cleanSetTitle(title) {
    const cleaned = String(title || 'Practice set').replace(/\s*\(\d+\s*MCQs?\)\s*$/i, '').trim();
    return cleaned || 'Practice set';
  }

  async function renderAnalysis() {
    if (!DOM.analysisContainer) return;
    DOM.analysisContainer.innerHTML = '<p class="empty-state">Reading your saved mocks…</p>';

    let modules = [];
    let attempts = [];
    try {
      modules = await window.OfflineStorage.getModules();
      if (window.OfflineStorage.getAttempts) attempts = await window.OfflineStorage.getAttempts();
    } catch (err) {
      DOM.analysisContainer.innerHTML = '<div class="empty-state"><strong>Stored history is unavailable.</strong><br>This browser is blocking local storage, so past mocks cannot be analysed.</div>';
      return;
    }

    modules = Array.isArray(modules) && modules.length ? modules : ((typeof globalThis !== 'undefined' && globalThis.CTET_INDEX) || []);
    attempts = Array.isArray(attempts) ? attempts : [];

    // All modules eligible for analysis across UGC NET and CTET

    const moduleIndex = {};
    modules.forEach((mod) => {
      if (!mod || !mod.id) return;
      const info = parseModuleHierarchy(mod);
      moduleIndex[mod.id] = {
        mod,
        unit: String(mod.topic || info.cls || 'General').trim(),
        chapter: info.chapter || mod.title || 'Practice set'
      };
    });

    const mocks = attempts.filter((a) => a && a.moduleId).map((a) => {
      const known = moduleIndex[a.moduleId];
      const fallback = parseModuleHierarchy({ title: a.moduleTitle || 'Practice set' });
      const correct = Number(a.correct) || 0;
      const wrong = Number(a.wrong) || 0;
      const skipped = Number(a.skipped) || 0;
      const answered = correct + wrong;
      return {
        moduleId: a.moduleId,
        title: cleanSetTitle(known ? known.chapter : (fallback.chapter || 'Practice set')),
        unit: known ? known.unit : String(fallback.cls || 'General'),
        date: new Date(a.createdAt || 0),
        correct,
        wrong,
        skipped,
        answered,
        total: Number(a.total) || (correct + wrong + skipped),
        score: Number(a.score) || 0,
        max: Number(a.max) || (Number(a.total) || (correct + wrong + skipped)) * 2,
        time: Number(a.timeSeconds) || 0,
        accuracy: answered ? (correct / answered) * 100 : 0
      };
    }).filter((row) => !Number.isNaN(row.date.getTime())).sort((a, b) => a.date - b.date);

    if (!mocks.length) {
      if (DOM.analysisSub) DOM.analysisSub.textContent = 'Performance across your completed mocks';
      DOM.analysisContainer.innerHTML = `
        <div class="an-empty">
          <div class="an-empty-icon">${icon('insights')}</div>
          <h3>No mock results yet</h3>
          <p>Finish a timed exam test and this page will break down your accuracy, the units you are strong and weak in, your answering pace, and how you are trending over time.</p>
          <button id="anOpenLibrary" class="btn btn-primary" type="button">Choose a practice set</button>
        </div>`;
      const openBtn = DOM.analysisContainer.querySelector('#anOpenLibrary');
      if (openBtn) openBtn.addEventListener('click', () => switchMode('library'));
      return;
    }

    if (DOM.analysisSub) {
      const lastDate = mocks[mocks.length - 1].date;
      DOM.analysisSub.textContent = `${mocks.length} completed mock${mocks.length === 1 ? '' : 's'} · last on ${lastDate.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;
    }

    const answeredTotal = mocks.reduce((sum, row) => sum + row.answered, 0);
    const correctTotal = mocks.reduce((sum, row) => sum + row.correct, 0);
    const blankTotal = mocks.reduce((sum, row) => sum + row.skipped, 0);
    const timeTotal = mocks.reduce((sum, row) => sum + row.time, 0);
    const questionTotal = mocks.reduce((sum, row) => sum + row.total, 0);
    const overall = answeredTotal ? (correctTotal / answeredTotal) * 100 : 0;
    const best = mocks.reduce((max, row) => Math.max(max, row.accuracy), 0);
    const pace = questionTotal ? timeTotal / questionTotal : 0;
    const blankRate = (answeredTotal + blankTotal) ? (blankTotal / (answeredTotal + blankTotal)) * 100 : 0;
    const band = analysisBand(overall);

    const unitStats = {};
    mocks.forEach((row) => {
      if (!unitStats[row.unit]) {
        unitStats[row.unit] = { unit: row.unit, mocks: 0, correct: 0, wrong: 0, answered: 0, blank: 0 };
      }
      const stat = unitStats[row.unit];
      stat.mocks += 1;
      stat.correct += row.correct;
      stat.wrong += row.wrong;
      stat.answered += row.answered;
      stat.blank += row.skipped;
    });
    Object.values(unitStats).forEach((stat) => {
      stat.accuracy = stat.answered ? (stat.correct / stat.answered) * 100 : 0;
    });

    const scored = mocks.filter((row) => row.answered > 0);
    let trend = 'steady';
    if (scored.length >= 4) {
      const half = Math.floor(scored.length / 2);
      const average = (rows) => rows.reduce((sum, row) => sum + row.accuracy, 0) / rows.length;
      const delta = average(scored.slice(half)) - average(scored.slice(0, half));
      if (delta >= 5) trend = 'improving';
      else if (delta <= -5) trend = 'slipping';
    }
    const trendInfo = {
      improving: { label: 'Improving', icon: 'trending_up' },
      slipping: { label: 'Slipping', icon: 'trending_down' },
      steady: { label: 'Steady', icon: 'trending_flat' }
    }[trend];

    const ranked = Object.values(unitStats)
      .filter((stat) => stat.answered >= ANALYSIS_MIN_SAMPLE)
      .sort((a, b) => a.accuracy - b.accuracy);
    const weakest = ranked[0] || null;
    const strongest = ranked[ranked.length - 1] || null;

    let insight = 'Take a few more mocks — a unit needs at least six answered questions before it can be judged fairly.';
    if (strongest && weakest && strongest.unit !== weakest.unit) {
      insight = `${shortUnit(strongest.unit)} is your strongest area at ${formatPercent(strongest.accuracy)}, while ${shortUnit(weakest.unit)} is your weakest at ${formatPercent(weakest.accuracy)}.`;
    } else if (strongest && weakest) {
      insight = `${shortUnit(strongest.unit)} is the only unit with enough answers so far. Attempt another unit to compare strengths.`;
    }
    if (blankRate >= 10) {
      insight += ` You leave ${Math.round(blankRate)}% of questions blank, which gives away marks that cost nothing to attempt.`;
    }

    const statTiles = [
      { label: 'Mocks completed', value: String(mocks.length), sub: `${questionTotal} questions sat` },
      { label: 'Average accuracy', value: formatPercent(overall), sub: `${correctTotal} of ${answeredTotal} answered` },
      { label: 'Best mock', value: formatPercent(best), sub: 'Highest accuracy so far' },
      { label: 'Pace', value: `${Math.round(pace)}s`, sub: pace <= 60 ? 'Within the 60s target' : 'Slower than 60s a question' }
    ];

    const recentBars = scored.slice(-12);
    let barsHtml = '';
    recentBars.forEach((row) => {
      const barBand = analysisBand(row.accuracy);
      const height = Math.max(4, Math.round(row.accuracy));
      barsHtml += `
        <div class="an-bar-col" title="${escapeHtml(row.title)} · ${formatPercent(row.accuracy)}">
          <span class="an-bar-val">${Math.round(row.accuracy)}</span>
          <div class="an-bar-track"><i class="an-bar-fill ${barBand.cls}" style="height:${height}%"></i></div>
        </div>`;
    });

    const unitRows = Object.values(unitStats).sort((a, b) => {
      const aLow = a.answered < ANALYSIS_MIN_SAMPLE;
      const bLow = b.answered < ANALYSIS_MIN_SAMPLE;
      if (aLow !== bLow) return aLow ? 1 : -1;
      return a.accuracy - b.accuracy;
    });

    const attemptedUnits = new Set(Object.keys(unitStats));
    const untouchedUnits = [...new Set(modules
      .map((mod) => String((mod && mod.topic) || '').trim())
      .filter((unit) => unit && !attemptedUnits.has(unit)))]
      .sort((a, b) => {
        const numA = parseInt((a.match(/\d+/) || [])[0], 10) || 99;
        const numB = parseInt((b.match(/\d+/) || [])[0], 10) || 99;
        return numA - numB;
      });

    const setStats = {};
    mocks.forEach((row) => {
      if (!setStats[row.moduleId]) {
        setStats[row.moduleId] = { moduleId: row.moduleId, title: row.title, unit: row.unit, correct: 0, answered: 0, mocks: 0 };
      }
      const stat = setStats[row.moduleId];
      stat.mocks += 1;
      stat.correct += row.correct;
      stat.answered += row.answered;
    });
    Object.values(setStats).forEach((stat) => {
      stat.accuracy = stat.answered ? (stat.correct / stat.answered) * 100 : 0;
    });
    const revisit = Object.values(setStats)
      .filter((stat) => stat.answered >= ANALYSIS_MIN_SAMPLE && stat.accuracy < 75)
      .sort((a, b) => a.accuracy - b.accuracy)
      .slice(0, 3);

    const recentMocks = mocks.slice(-8).reverse();

    let html = `
      <div class="an-hero ${band.cls}">
        <div class="an-hero-main">
          <div class="an-hero-label">Overall accuracy</div>
          <div class="an-hero-value">${formatPercent(overall)}</div>
          <div class="an-hero-band">
            <span class="an-chip ${band.cls}">${band.label}</span>
            <span class="an-trend-pill">${icon(trendInfo.icon)}${trendInfo.label}</span>
          </div>
        </div>
        <p class="an-hero-copy">${escapeHtml(insight)}</p>
      </div>

      <div class="an-stats">
        ${statTiles.map((tile) => `
          <div class="an-stat">
            <b>${escapeHtml(tile.value)}</b>
            <span class="an-stat-label">${escapeHtml(tile.label)}</span>
            <span class="an-stat-sub">${escapeHtml(tile.sub)}</span>
          </div>`).join('')}
      </div>

      <div class="an-card">
        <div class="an-card-head">
          <h3>Accuracy by mock</h3>
          <span>Last ${recentBars.length} · oldest to newest</span>
        </div>
        <div class="an-trend">${barsHtml}</div>
      </div>

      <div class="an-card">
        <div class="an-card-head">
          <h3>Unit strengths &amp; weaknesses</h3>
          <span>Weakest first</span>
        </div>
        <div class="an-units">
          ${unitRows.map((stat) => {
            const lowData = stat.answered < ANALYSIS_MIN_SAMPLE;
            const unitBand = analysisBand(stat.accuracy);
            const chipCls = lowData ? 'neutral' : unitBand.cls;
            const chipText = lowData ? 'Low data' : formatPercent(stat.accuracy);
            return `
              <button class="an-unit-row" type="button" data-unit="${escapeHtml(stat.unit)}">
                <span class="an-unit-top">
                  <span class="an-unit-name">${escapeHtml(stat.unit)}</span>
                  <span class="an-chip ${chipCls}">${chipText}</span>
                </span>
                <span class="an-track"><i class="${unitBand.cls}" style="width:${lowData ? 0 : Math.round(stat.accuracy)}%"></i></span>
                <span class="an-unit-meta">${stat.mocks} mock${stat.mocks === 1 ? '' : 's'} · ${stat.answered} answered · ${stat.blank} blank</span>
              </button>`;
          }).join('')}
        </div>
        ${untouchedUnits.length ? `<p class="an-more">Not attempted yet: ${untouchedUnits.map((unit) => escapeHtml(shortUnit(unit))).join(', ')}</p>` : ''}
      </div>
    `;

    if (revisit.length) {
      html += `
        <div class="an-card">
          <div class="an-card-head">
            <h3>Sets to revisit</h3>
            <span>Lowest accuracy</span>
          </div>
          <div class="an-sets">
            ${revisit.map((stat) => `
              <div class="an-set-row">
                <div class="an-set-copy">
                  <b>${escapeHtml(stat.title)}</b>
                  <span>${escapeHtml(stat.unit)} · ${formatPercent(stat.accuracy)} accuracy</span>
                </div>
                <button class="btn btn-sm an-set-btn" type="button" data-module="${escapeHtml(stat.moduleId)}">Practice</button>
              </div>`).join('')}
          </div>
        </div>`;
    }

    html += `
      <div class="an-card">
        <div class="an-card-head">
          <h3>Recent mocks</h3>
          <span>Newest first</span>
        </div>
        <div class="an-attempts">
          ${recentMocks.map((row) => {
            const rowBand = analysisBand(row.accuracy);
            return `
              <div class="an-attempt">
                <div class="an-attempt-top">
                  <span class="an-attempt-title">${escapeHtml(row.title)}</span>
                  <span class="an-chip ${rowBand.cls}">${formatPercent(row.accuracy)}</span>
                </div>
                <div class="an-attempt-meta">${escapeHtml(shortUnit(row.unit))} · ${row.date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} · ${formatTime(row.time)} · ${row.score.toFixed(2)}/${row.max.toFixed(0)} marks</div>
                <div class="an-attempt-meta">${row.correct} correct · ${row.wrong} wrong · ${row.skipped} blank</div>
              </div>`;
          }).join('')}
        </div>
      </div>

      <p class="an-note">Accuracy counts only the questions you answered, so leaving questions blank never flatters it. Scores on the exam screen also apply −0.66 per wrong answer, which is why the marks shown after a test can sit lower than these percentages.</p>
    `;

    DOM.analysisContainer.innerHTML = html;

    DOM.analysisContainer.querySelectorAll('.an-unit-row').forEach((row) => {
      row.addEventListener('click', () => {
        State.libraryClass = row.getAttribute('data-unit');
        switchMode('library');
      });
    });

    DOM.analysisContainer.querySelectorAll('.an-set-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const entry = moduleIndex[btn.getAttribute('data-module')];
        if (entry && entry.mod) startLibraryMode(entry.mod, 'practice');
      });
    });
  }

  // ==========================================================================
  // FILE INGESTION
  // ==========================================================================
  async function processFile(file) {
    if (!file) return;
    const maxBytes = 60 * 1024 * 1024;
    if (file.size > maxBytes) {
      setFileStatus('This file is too large. Choose a file smaller than 60 MB.', 'error');
      showToast('File is too large to process safely.');
      return;
    }
    if (!Processing) {
      setFileStatus('Processing is unavailable. Reload the app and try again.', 'error');
      showToast('Processing is unavailable in this session.');
      return;
    }
    if (Processing.isBusy()) {
      processExpanded = true;
      openProcessingDialog();
      showToast('Another document is still being processed.');
      return;
    }

    setFileStatus(`Reading ${file.name}…`, '');
    processExpanded = true;
    completedModule = null;
    const started = Processing.startImport({
      file: file,
      title: file.name.replace(/\.[^/.]+$/, ''),
      readFile: (source, onProgress, options) => window.OfflineDocParser.readFileContentDetailed(source, onProgress, options)
    });
    if (!started.accepted) {
      processExpanded = true;
      paintProcessing(started.job || Processing.getCurrent());
      showToast('Another document is still being processed.');
    }
  }

  // ==========================================================================
  // EVENTS
  // ==========================================================================
  function initEvents() {
    DOM.modeItems.forEach((btn) => {
      btn.addEventListener('click', () => {
        const mode = btn.getAttribute('data-mode');
        if (mode === 'test') {
          State.testModeType = 'universal';
        }
        switchMode(mode);
      });
    });

    if (DOM.inQuizTopicTestBtn) {
      DOM.inQuizTopicTestBtn.addEventListener('click', () => {
        State.testModeType = 'chapter';
        switchMode('test');
      });
    }

    if (DOM.pillChapterTest) {
      DOM.pillChapterTest.addEventListener('click', () => {
        State.testModeType = 'chapter';
        renderTestSetup();
      });
    }

    if (DOM.pillUniversalTest) {
      DOM.pillUniversalTest.addEventListener('click', () => {
        State.testModeType = 'universal';
        renderTestSetup();
      });
    }

    if (DOM.chapterQuestionCount) {
      DOM.chapterQuestionCount.addEventListener('change', updateChapterTestTotalTime);
    }

    if (DOM.chapterSecondsPerQuestion) {
      DOM.chapterSecondsPerQuestion.addEventListener('change', updateChapterTestTotalTime);
    }

    if (DOM.chapterStartBtn) {
      DOM.chapterStartBtn.addEventListener('click', startChapterTest);
    }

    if (DOM.chapterBackToPracticeBtn) {
      DOM.chapterBackToPracticeBtn.addEventListener('click', () => switchMode('practice'));
    }

    if (DOM.prevBtn) {
      DOM.prevBtn.addEventListener('click', () => {
        if (State.currentIndex > 0) {
          State.currentIndex--;
          renderQuestion();
          renderPalette();
        }
      });
    }

    if (DOM.nextBtn) {
      DOM.nextBtn.addEventListener('click', () => {
        const qList = activeQuestionList();
        if (State.currentIndex < qList.length - 1) {
          State.currentIndex++;
          renderQuestion();
          renderPalette();
        }
      });
    }

    if (DOM.submitBtn) DOM.submitBtn.addEventListener('click', submitTest);
    if (DOM.examSubmitBtn) DOM.examSubmitBtn.addEventListener('click', submitTest);

    if (DOM.testQuestionCount) {
      DOM.testQuestionCount.addEventListener('change', () => {
        State.testQuestionLimit = Number(DOM.testQuestionCount.value) || State.testQuestionLimit;
        updateTestTotalTime();
      });
    }
    if (DOM.testSecondsPerQuestion) {
      DOM.testSecondsPerQuestion.addEventListener('change', () => {
        State.testSecondsPerQuestion = Number(DOM.testSecondsPerQuestion.value) || State.testSecondsPerQuestion;
        updateTestTotalTime();
      });
    }
    if (DOM.testStartBtn) DOM.testStartBtn.addEventListener('click', startTest);

    if (DOM.markBtn) {
      DOM.markBtn.addEventListener('click', () => {
        if (!State.currentModule) return;
        const q = activeQuestionList()[State.currentIndex];
        if (!q) return;
        const nowBookmarked = window.OfflineStorage.toggleBookmark(q.id, q);
        DOM.markBtn.innerHTML = icon('star') + `<span class="bookmark-text">${nowBookmarked ? 'Bookmarked' : 'Bookmark'}</span>`;
        DOM.markBtn.setAttribute('aria-pressed', nowBookmarked ? 'true' : 'false');
        showToast(nowBookmarked ? 'Saved to bookmarks.' : 'Removed from bookmarks.');
      });
    }

    if (DOM.printBtn) DOM.printBtn.addEventListener('click', () => window.print());

    if (DOM.brandLogo) {
      DOM.brandLogo.addEventListener('click', () => switchMode('library'));
      DOM.brandLogo.setAttribute('role', 'button');
      DOM.brandLogo.setAttribute('tabindex', '0');
      DOM.brandLogo.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          switchMode('library');
        }
      });
    }

    if (DOM.libraryGenerateBtn) {
      DOM.libraryGenerateBtn.addEventListener('click', () => switchMode('generator'));
    }

    if (DOM.dropZone) {
      const openPicker = () => DOM.fileInput && DOM.fileInput.click();
      DOM.dropZone.addEventListener('click', openPicker);
      DOM.dropZone.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openPicker();
        }
      });
      DOM.dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        DOM.dropZone.classList.add('dragover');
      });
      DOM.dropZone.addEventListener('dragleave', () => DOM.dropZone.classList.remove('dragover'));
      DOM.dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        DOM.dropZone.classList.remove('dragover');
        if (e.dataTransfer.files.length) processFile(e.dataTransfer.files[0]);
      });
    }

    if (DOM.fileInput) {
      DOM.fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length) {
          processFile(e.target.files[0]);
          e.target.value = '';
        }
      });
    }

    if (DOM.generateBtn) DOM.generateBtn.addEventListener('click', handleGenerate);

    if (DOM.revStartBtn) DOM.revStartBtn.addEventListener('click', startRevisionSession);
    if (DOM.revResumeBtn) DOM.revResumeBtn.addEventListener('click', resumeRevisionSession);
    if (DOM.revResetBtn) DOM.revResetBtn.addEventListener('click', resetRevisionProgress);
    if (DOM.revRevealBtn) DOM.revRevealBtn.addEventListener('click', revealRevisionAnswer);
    if (DOM.revPauseBtn) DOM.revPauseBtn.addEventListener('click', pauseRevisionSession);
    if (DOM.revPrevBtn) DOM.revPrevBtn.addEventListener('click', viewPreviousRevisionCard);
    if (DOM.revBackBtn) DOM.revBackBtn.addEventListener('click', returnToCurrentRevisionCard);
    if (DOM.revEvidenceToggle) DOM.revEvidenceToggle.addEventListener('click', toggleRevisionEvidence);
    if (DOM.revSummaryDoneBtn) DOM.revSummaryDoneBtn.addEventListener('click', () => {
      State.revision.session = null;
      renderRevisionDashboard();
      showRevisionPanel('dashboard');
      updateStats();
    });
    if (DOM.revRatings) {
      DOM.revRatings.querySelectorAll('[data-rating]').forEach((btn) => {
        btn.addEventListener('click', () => rateRevision(btn.getAttribute('data-rating')));
      });
    }

    if (DOM.scoreCloseBtn) DOM.scoreCloseBtn.addEventListener('click', closeScorecard);
    if (DOM.scoreReviewBtn) DOM.scoreReviewBtn.addEventListener('click', reviewAnswers);
    if (DOM.scoreRetakeBtn) DOM.scoreRetakeBtn.addEventListener('click', retakeTest);
    if (DOM.scoreAnalysisBtn) {
      DOM.scoreAnalysisBtn.addEventListener('click', () => {
        closeScorecard();
        switchMode('analysis');
      });
    }
    if (DOM.scoreModal) {
      DOM.scoreModal.addEventListener('click', (e) => {
        if (e.target === DOM.scoreModal) closeScorecard();
      });
    }

    
    if (DOM.examTabUgc) {
      DOM.examTabUgc.addEventListener('click', () => {
        State.libraryExam = 'ugc_net';
        State.libraryClass = null;
        updateExamTabs();
        renderLibrary();
      });
    }
    if (DOM.examTabCtet) {
      DOM.examTabCtet.addEventListener('click', () => {
        State.libraryExam = 'ctet';
        State.libraryClass = null;
        updateExamTabs();
        renderLibrary();
      });
    }
    if (DOM.libSearchInput) {
      DOM.libSearchInput.addEventListener('input', (e) => {
        State.librarySearch = e.target.value || '';
        renderLibrary();
      });
    }

    if (DOM.aboutBtn) DOM.aboutBtn.addEventListener('click', openAbout);
    if (DOM.aboutCloseBtn) DOM.aboutCloseBtn.addEventListener('click', closeAbout);
    if (DOM.aboutModal) {
      DOM.aboutModal.addEventListener('click', (e) => {
        if (e.target === DOM.aboutModal) closeAbout();
      });
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (DOM.processModal && DOM.processModal.classList.contains('open')) {
          closeProcessingDialog();
        } else if (DOM.scoreModal && DOM.scoreModal.classList.contains('open')) {
          closeScorecard();
        } else if (DOM.aboutModal && DOM.aboutModal.classList.contains('open')) {
          closeAbout();
        } else if (State.navOpen) {
          setNavOpen(false, { returnFocus: true });
        }
        return;
      }
      if (State.activeMode !== 'revision') return;
      const tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const session = State.revision.session;
      if (!session || session.completed) return;
      if (e.key === ' ' || e.key === 'Enter') {
        if (!State.revision.revealed && !State.revision.viewingPrev) {
          e.preventDefault();
          revealRevisionAnswer();
        }
        return;
      }
      if (State.revision.revealed && !State.revision.viewingPrev) {
        const key = (e.key || '').toLowerCase();
        const map = { '1': 'again', '2': 'hard', '3': 'good', '4': 'easy' };
        if (map[key]) {
          e.preventDefault();
          rateRevision(map[key]);
        }
      }
    });

    window.addEventListener('beforeunload', (e) => {
      if (State.activeMode === 'test' && State.testStarted && !State.testSubmitted) {
        e.preventDefault();
        e.returnValue = '';
      }
    });
  }

  // ==========================================================================
  // STARTUP
  // ==========================================================================
  function initApp() {
    initDOM();
    initNavigation();
    initInstallHandlers();
    initTheme();
    registerServiceWorker();
    initEvents();
    initProcessing();
    switchMode('library');
    requestPersistentStorage();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }
})();
