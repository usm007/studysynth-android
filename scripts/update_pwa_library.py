#!/usr/bin/env python3
"""
Replace parseModuleHierarchy and renderLibrary in pwa/app.js:
- Support UGC NET Education (10 units) and CTET (All PYQs mixed + CDP + SST).
- Directly render Practice and Exam Test buttons on every topic card.
- Clean search and navigation.
"""

import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APP_JS = os.path.join(ROOT, "pwa", "app.js")

with open(APP_JS, 'r', encoding='utf-8') as f:
    code = f.read()

start_marker = "  function parseModuleHierarchy(mod) {"
end_marker = "  // ==========================================================================\n  // ANALYSIS"

start_idx = code.find(start_marker)
end_idx = code.find(end_marker)

if start_idx == -1 or end_idx == -1:
    print(f"Error: Markers not found! start_idx={start_idx}, end_idx={end_idx}")
    exit(1)

new_code = '''  function parseModuleHierarchy(mod) {
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

  function cleanSetTitle(title) {
    return String(title || 'Practice set').replace(/\\s*\\(\\d+\\s*MCQs?\\)\\s*$/i, '').trim() || 'Practice set';
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
      'all_pyq': {
        icon: 'library_books',
        desc: 'Master CTET Question Bank: All previous years questions across Child Development & Pedagogy and Social Science unified into one practice set.'
      },
      'cdp': {
        icon: 'psychology',
        desc: 'All CTET Child Development & Pedagogy questions: development concepts, Piaget, Vygotsky, Kohlberg, inclusive education, and child-centred pedagogy.'
      },
      'sst': {
        icon: 'public',
        desc: 'All CTET Social Studies / Social Science questions: History, Geography, Social & Political Life (Civics), and pedagogical issues.'
      }
    };

    function getMeta(mod) {
      const id = String(mod.id || '').toLowerCase();
      if (id.includes('all_pyq')) return topicMetaMap['all_pyq'];
      if (id.includes('cdp')) return topicMetaMap['cdp'];
      if (id.includes('sst')) return topicMetaMap['sst'];
      if (id.includes('unit_10')) return topicMetaMap['Unit 10'];
      for (let i = 1; i <= 9; i++) {
        if (id.includes(`unit_${i}`)) return topicMetaMap[`Unit ${i}`];
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

      let displayTitle = parsed.cls || mod.topic || mod.title || 'Untitled set';
      displayTitle = cleanSetTitle(displayTitle);

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
                ${isAllInOne ? '<span class="library-badge" style="background:var(--accent);color:#fff;">Master PYQ Bank</span>' : ''}
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
        const numA = parseInt((String(a.id || '').match(/unit_(\\d+)/i) || [])[1], 10) || 99;
        const numB = parseInt((String(b.id || '').match(/unit_(\\d+)/i) || [])[1], 10) || 99;
        return numA - numB;
      });
    } else {
      // CTET: All-in-one PYQ set first, then CDP, then SST
      examSets.sort((a, b) => {
        const order = { 'ctet_all_pyq': 1, 'ctet_topic_cdp': 2, 'ctet_topic_sst': 3 };
        return (order[a.id] || 99) - (order[b.id] || 99);
      });
    }

    const totalQuestions = examSets.reduce((sum, mod) => sum + moduleQuestionCount(mod), 0);
    const examHeading = activeExam === 'ugc_net' ? 'UGC NET Education (Code 09)' : 'CTET (Central Teacher Eligibility Test)';
    const examSub = activeExam === 'ugc_net'
      ? '10 Official Syllabus Units · 1 Comprehensive Practice Set Per Unit'
      : 'All Solved PYQs in One Place · Child Development & Social Science Only';

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
'''

updated_content = code[:start_idx] + new_code + "\n" + code[end_idx:]

with open(APP_JS, 'w', encoding='utf-8') as f:
    f.write(updated_content)

print("Successfully updated pwa/app.js with clean Library rendering!")

