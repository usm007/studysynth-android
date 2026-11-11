#!/usr/bin/env python3
"""
Patch pwa/app.js to cleanly separate UGC NET Education and CTET:
- Add Exam Switcher handling (UGC NET vs CTET)
- Direct topic cards with Practice & Exam Test buttons for all 10 UGC units and CTET topics
- Remove retired subject filters that blocked CTET
- Update Analysis view to support both exams cleanly
"""

import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APP_JS = os.path.join(ROOT, "pwa", "app.js")

with open(APP_JS, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add libraryExam to State if not present
if "libraryExam:" not in content:
    content = content.replace(
        "libraryClass: null,",
        "libraryClass: null,\n    libraryExam: 'ugc_net',"
    )

# 2. Add DOM element bindings
if "DOM.examTabUgc" not in content:
    content = content.replace(
        "DOM.libBreadcrumbBar = document.getElementById('libBreadcrumbBar');",
        "DOM.libBreadcrumbBar = document.getElementById('libBreadcrumbBar');\n    DOM.examTabUgc = document.getElementById('examTabUgc');\n    DOM.examTabCtet = document.getElementById('examTabCtet');"
    )

# 3. Add updateExamTabs helper and event bindings
if "function updateExamTabs" not in content:
    update_tabs_fn = """
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
    if (DOM.libSearchInput) {
      DOM.libSearchInput.placeholder = isUgc
        ? 'Search UGC NET Education syllabus units or questions...'
        : 'Search CTET syllabus topics, papers, or questions...';
    }
  }
"""
    content = content.replace("function parseModuleHierarchy(mod) {", update_tabs_fn + "\n  function parseModuleHierarchy(mod) {")

# 4. Bind exam tab click handlers in initEvents
if "DOM.examTabUgc.addEventListener" not in content:
    tab_events = """
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
"""
    content = content.replace(
        "if (DOM.libSearchInput) {",
        tab_events + "    if (DOM.libSearchInput) {"
    )

# 5. Replace parseModuleHierarchy and renderLibrary
new_hierarchy_and_library = """  function parseModuleHierarchy(mod) {
    if (!mod) return { subject: 'General', cls: 'General', chapter: 'Untitled set', originalTitle: 'Untitled set' };
    const title = (mod.title || '').trim();
    const parts = title.split(/\\s*-\\s*/);
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

    // Topic metadata definitions for UGC NET Education (10 Units) and CTET (Syllabus & Solved Papers)
    const topicInfoMap = {
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
      'cdp': {
        icon: 'psychology',
        desc: 'Child Development & Pedagogy: concept of development, Piaget, Vygotsky, Kohlberg, inclusive education, and child-centred learning.'
      },
      'sst': {
        icon: 'public',
        desc: 'Social Studies / Social Science: History, Geography, Social and Political Life (Civics), and pedagogical issues.'
      },
      'english': {
        icon: 'translate',
        desc: 'Language: English: Reading comprehension passages, prose/poetry analysis, language teaching principles, and LSRW skills.'
      },
      'math': {
        icon: 'calculate',
        desc: 'Mathematics & Pedagogy: Number system, shapes & spatial understanding, geometry, measurement, and Van Hiele levels.'
      },
      'evs': {
        icon: 'eco',
        desc: 'Environmental Studies: Family, food, shelter, water, travel, things we make & do, and environmental pedagogy.'
      },
      'science': {
        icon: 'science',
        desc: 'Science & Pedagogy: Food, materials, the world of the living, moving things, natural phenomena, and scientific inquiry.'
      },
      'solved': {
        icon: 'library_books',
        desc: 'Complete 150-minute exam simulation with full answer keys, scoring, and printed explanations.'
      }
    };

    function getTopicMeta(mod) {
      const id = String(mod.id || '').toLowerCase();
      const topic = String(mod.topic || '').toLowerCase();
      if (id.includes('unit_10')) return topicInfoMap['Unit 10'];
      for (let i = 1; i <= 9; i++) {
        if (id.includes(`unit_${i}`)) return topicInfoMap[`Unit ${i}`];
      }
      if (id.includes('cdp') || topic.includes('child development')) return topicInfoMap['cdp'];
      if (id.includes('sst') || topic.includes('social')) return topicInfoMap['sst'];
      if (id.includes('eng') || topic.includes('english')) return topicInfoMap['english'];
      if (id.includes('math')) return topicInfoMap['math'];
      if (id.includes('evs') || topic.includes('environmental')) return topicInfoMap['evs'];
      if (id.includes('science')) return topicInfoMap['science'];
      if (id.includes('paper') || topic.includes('solved')) return topicInfoMap['solved'];
      return { icon: 'school', desc: 'Comprehensive practice set with verified exam MCQs.' };
    }

    // Helper to render a topic card with direct Practice & Test buttons
    function renderTopicCard(mod) {
      const parsed = parseModuleHierarchy(mod);
      const meta = getTopicMeta(mod);
      const last = latestByModule[mod.id];
      const attemptCount = countByModule[mod.id] || 0;
      const questionCount = moduleQuestionCount(mod);
      const revisionOnly = questionCount === 0;
      const date = mod.createdAt ? new Date(mod.createdAt).toLocaleDateString() : '';
      
      let displayTitle = mod.title || 'Untitled set';
      if (parsed.cls && parsed.chapter) {
        displayTitle = parsed.cls;
      }
      displayTitle = cleanSetTitle(displayTitle);

      const isSolvedPaper = String(mod.id || '').includes('ctet_paper_');
      if (isSolvedPaper) {
        displayTitle = parsed.chapter || displayTitle;
      }

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
                ${revisionOnly ? '<span class="library-badge">Revision only</span>' : ''}
              </div>
              <div class="library-meta">
                <span><b>${questionCount}</b> Verified MCQs</span>
                ${isSolvedPaper ? '<span>Timed 150-Min Mock</span>' : '<span>Complete Topic Set</span>'}
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
        html += renderTopicCard(mod);
      });
      html += `</div>`;
      DOM.libraryContainer.innerHTML = html;
      wireCardListeners(DOM.libraryContainer, searchResults);
      return;
    }

    renderBackButton('', null);

    // CASE 2: FILTER BY SELECTED EXAM SYLLABUS
    let examSets = list.filter((mod) => {
      const id = String(mod.id || '');
      const exam = String(mod.exam || '');
      if (activeExam === 'ugc_net') {
        return exam === 'ugc_net' || id.startsWith('ugc_net_');
      } else {
        return exam === 'ctet' || id.startsWith('ctet_');
      }
    });

    // Custom user-imported modules are displayed under UGC NET if not tagged
    const userSets = list.filter((mod) => {
      const id = String(mod.id || '');
      return !id.startsWith('ugc_net_') && !id.startsWith('ctet_');
    });
    if (activeExam === 'ugc_net' && userSets.length) {
      examSets = examSets.concat(userSets);
    }

    // Sort: UGC NET Units 1 to 10
    if (activeExam === 'ugc_net') {
      examSets.sort((a, b) => {
        const numA = parseInt((String(a.id || '').match(/unit_(\d+)/i) || [])[1], 10) || 99;
        const numB = parseInt((String(b.id || '').match(/unit_(\d+)/i) || [])[1], 10) || 99;
        return numA - numB;
      });
    } else {
      // CTET: Topic Sets first, then Solved Mock Papers
      const topicOrder = ['cdp', 'sst', 'english', 'math', 'evs', 'science'];
      examSets.sort((a, b) => {
        const isSolvedA = String(a.id || '').includes('ctet_paper_');
        const isSolvedB = String(b.id || '').includes('ctet_paper_');
        if (!isSolvedA && isSolvedB) return -1;
        if (isSolvedA && !isSolvedB) return 1;
        if (isSolvedA && isSolvedB) {
          const yrA = parseInt((String(a.id || '').match(/\d{4}/) || [])[0], 10) || 0;
          const yrB = parseInt((String(b.id || '').match(/\d{4}/) || [])[0], 10) || 0;
          return yrB - yrA;
        }
        const idxA = topicOrder.findIndex(k => String(a.id || '').includes(k));
        const idxB = topicOrder.findIndex(k => String(b.id || '').includes(k));
        return (idxA >= 0 ? idxA : 99) - (idxB >= 0 ? idxB : 99);
      });
    }

    const totalQuestions = examSets.reduce((sum, mod) => sum + moduleQuestionCount(mod), 0);
    const examHeading = activeExam === 'ugc_net' ? 'UGC NET Education (Code 09)' : 'CTET (Central Teacher Eligibility Test)';
    const examSub = activeExam === 'ugc_net'
      ? '10 Official Syllabus Units · 1 Comprehensive Practice Set Per Topic'
      : 'Official Syllabus Topics (Paper I & II) + Full Previous Year Solved Papers';

    let html = storageWarning ? `<p class="library-warning" role="status">${escapeHtml(storageWarning)}</p>` : '';
    html += `
      <div class="lib-level-header" style="margin-bottom:14px;">
        <div>
          <h3>${escapeHtml(examHeading)}</h3>
          <div class="lib-level-count">${examSets.length} topic study sets · ${totalQuestions} verified MCQs · ${escapeHtml(examSub)}</div>
        </div>
      </div>
      <div class="lib-hierarchy-grid">
    `;

    examSets.forEach((mod) => {
      html += renderTopicCard(mod);
    });

    html += `</div>`;
    DOM.libraryContainer.innerHTML = html;
    wireCardListeners(DOM.libraryContainer, examSets);
  }
"""

# Replace between "function parseModuleHierarchy(mod) {" and "function shortUnitLabel(unit)"
start_idx = content.find("function parseModuleHierarchy(mod) {")
end_idx = content.find("function shortUnitLabel(unit)")
if start_idx != -1 and end_idx != -1:
    content = content[:start_idx] + new_hierarchy_and_library + "\n  " + content[end_idx:]

# 6. Update shortUnitLabel and renderAnalysis
updated_short_unit = """  function shortUnitLabel(unit) {
    const str = String(unit || '').trim();
    const match = str.match(/Unit\\s+(\\d+)/i);
    if (match) return 'Unit ' + match[1];
    if (/child development|cdp/i.test(str)) return 'CDP';
    if (/social|sst/i.test(str)) return 'SST';
    if (/english|language/i.test(str)) return 'English';
    if (/math/i.test(str)) return 'Math';
    if (/environmental|evs/i.test(str)) return 'EVS';
    if (/science/i.test(str)) return 'Science';
    if (/solved/i.test(str)) return 'Solved PYQs';
    return str.length > 18 ? str.slice(0, 16) + '…' : str;
  }"""

content = re.sub(
    r'function shortUnitLabel\(unit\)\s*\{[^}]*\}',
    lambda m: updated_short_unit,
    content
)

# 7. Remove retiredSubjects filter in renderAnalysis
content = re.sub(
    r'const retiredSubjects = new Set\(\[[^\]]*\]\);\s*modules = modules\.filter\(\(mod\)\s*=>\s*\{[^}]*\}\);',
    '// All modules eligible for analysis across UGC NET and CTET',
    content
)

with open(APP_JS, 'w', encoding='utf-8') as f:
    f.write(content)

print("Successfully patched pwa/app.js!")
