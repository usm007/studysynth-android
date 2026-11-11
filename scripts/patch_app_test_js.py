import re

with open('pwa/app.js', 'r', encoding='utf-8') as f:
    code = f.read()

# 1. Add DOM elements caching in DOM setup section
dom_cache_target = """DOM.testSetupModule = document.getElementById('testSetupModule');"""
dom_cache_replacement = """DOM.testSetupModule = document.getElementById('testSetupModule');
    DOM.testScopeSelect = document.getElementById('testScopeSelect');
    DOM.testSummaryQuestions = document.getElementById('testSummaryQuestions');
    DOM.testSummaryMarking = document.getElementById('testSummaryMarking');"""

if dom_cache_target in code and "DOM.testScopeSelect" not in code:
    code = code.replace(dom_cache_target, dom_cache_replacement)
    print("Cached new DOM test elements.")

# 2. Add shuffleArray function near the top or utilities
shuffle_fn = """
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
"""

if "function shuffleArray(" not in code:
    code = shuffle_fn + "\n" + code
    print("Added shuffleArray function.")

# 3. Replace the entire EXAM TIMER & TEST SETUP section
old_setup_block_target = """  // ==========================================================================
  // EXAM TIMER & TEST SETUP
  // ==========================================================================
  function renderTestSetup() {
    const mod = State.currentModule;
    if (!DOM.testSetup || !mod) return;
    const available = Array.isArray(mod.questions) ? mod.questions.length : 0;
    if (DOM.testSetupModule) {
      DOM.testSetupModule.textContent = `${mod.title || 'Untitled set'} · ${available} verified question${available === 1 ? '' : 's'} available`;
    }
    if (DOM.testQuestionCount) {
      const counts = [5, 10, 15, 20, 30, 50].filter((n) => n < available);
      counts.push(available);
      const previous = Number(DOM.testQuestionCount.value) || State.testQuestionLimit;
      const selected = counts.indexOf(previous) >= 0 ? previous : Math.min(10, available);
      DOM.testQuestionCount.innerHTML = counts.map((n) =>
        `<option value="${n}"${n === selected ? ' selected' : ''}>${n} question${n === 1 ? '' : 's'}${n === available ? ' (all)' : ''}</option>`
      ).join('');
      State.testQuestionLimit = selected;
    }
    if (DOM.testSecondsPerQuestion) {
      const previous = Number(DOM.testSecondsPerQuestion.value);
      if (previous) State.testSecondsPerQuestion = previous;
      DOM.testSecondsPerQuestion.value = String(State.testSecondsPerQuestion);
    }
    updateTestTotalTime();
  }

  function updateTestTotalTime() {
    const count = Number(DOM.testQuestionCount && DOM.testQuestionCount.value) || 0;
    const seconds = Number(DOM.testSecondsPerQuestion && DOM.testSecondsPerQuestion.value) || 60;
    if (DOM.testTotalTime) DOM.testTotalTime.textContent = formatTime(count * seconds);
  }

  function updateTestScreen() {
    const showSetup = State.activeMode === 'test' && !State.testStarted && !State.testSubmitted;
    document.body.setAttribute('data-test-setup', showSetup ? 'true' : 'false');
    if (DOM.quizView) DOM.quizView.classList.toggle('is-test-setup', showSetup);
    if (DOM.testSetup) DOM.testSetup.hidden = !showSetup;
    if (showSetup) renderTestSetup();
  }

  function startTest() {
    const mod = State.currentModule;
    if (!mod || !Array.isArray(mod.questions) || !mod.questions.length) return;
    const count = Math.min(
      Math.max(1, Number(DOM.testQuestionCount && DOM.testQuestionCount.value) || 1),
      mod.questions.length
    );
    const seconds = Math.max(10, Number(DOM.testSecondsPerQuestion && DOM.testSecondsPerQuestion.value) || 60);

    State.testQuestionLimit = count;
    State.testSecondsPerQuestion = seconds;
    State.testQuestions = mod.questions.slice(0, count);
    State.testAnswers = {};
    State.testSubmitted = false;
    State.currentIndex = 0;
    State.testDurationSeconds = count * seconds;
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
    showToast(`Test started: ${count} question${count === 1 ? '' : 's'} · ${formatTime(seconds)} per question.`);
  }"""

new_setup_block = """  // ==========================================================================
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

  function renderTestSetup() {
    if (!DOM.testSetup) return;
    const mod = State.currentModule;
    const indexList = (typeof globalThis !== 'undefined' && globalThis.CTET_INDEX) || window.CTET_INDEX || [];

    // Populate testScopeSelect
    if (DOM.testScopeSelect) {
      const currentScope = DOM.testScopeSelect.value || 'current';
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
  }"""

assert old_setup_block_target in code, "Could not find old test setup block in app.js"
code = code.replace(old_setup_block_target, new_setup_block)
print("Replaced test setup block with full official mocks + custom test builder + randomization.")

# 4. Update computeScore for official marking scheme (+2 / 0 UGC NET, +1 / 0 CTET)
old_compute_score = """function computeScore(answers, list) {
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

    const score = correct * MARKS_CORRECT - wrong * MARKS_WRONG;
    const max = qList.length * MARKS_CORRECT;
    return { total: qList.length, correct, wrong, skipped, score, max };
  }"""

new_compute_score = """function computeScore(answers, list) {
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
  }"""

if old_compute_score in code:
    code = code.replace(old_compute_score, new_compute_score)
    print("Updated computeScore for official marking scheme.")

# 5. Wire testScopeSelect change listener in wireEvents
old_wire_test = """if (DOM.testQuestionCount) DOM.testQuestionCount.addEventListener('change', updateTestTotalTime);
    if (DOM.testSecondsPerQuestion) DOM.testSecondsPerQuestion.addEventListener('change', updateTestTotalTime);"""

new_wire_test = """if (DOM.testScopeSelect) {
      DOM.testScopeSelect.addEventListener('change', () => {
        updateTestQuestionCountOptions();
        updateTestTotalTime();
      });
    }
    if (DOM.testQuestionCount) DOM.testQuestionCount.addEventListener('change', updateTestTotalTime);
    if (DOM.testSecondsPerQuestion) DOM.testSecondsPerQuestion.addEventListener('change', updateTestTotalTime);"""

if old_wire_test in code:
    code = code.replace(old_wire_test, new_wire_test)
    print("Wired testScopeSelect change event.")

with open('pwa/app.js', 'w', encoding='utf-8') as f:
    f.write(code)

print("Updated pwa/app.js successfully!")

