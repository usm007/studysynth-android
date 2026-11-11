import re

# 1. Update pwa/index.html
with open('pwa/index.html', 'r', encoding='utf-8') as f:
    html = f.read()

html = html.replace('placeholder="Search chapters or papers..."', 'placeholder="Search UGC NET questions or syllabus units..."')
html = html.replace('<h2 id="aboutTitle" class="about-title">StudySynth</h2>', '<h2 id="aboutTitle" class="about-title">UGC NET Education (Code 09)</h2>')
html = html.replace(
    'Turn your notes and PDFs into verified practice questions, adaptive revision, and timed exam tests. Everything runs on your device, fully offline.',
    'Offline Previous Years Question Papers (2009–2026) and Exam Simulator for UGC NET Education (Subject Code 09). Complete syllabus practice across 10 official units with verified answer keys, timed evaluation, and zero distraction.'
)

with open('pwa/index.html', 'w', encoding='utf-8') as f:
    f.write(html)
print('Updated pwa/index.html')

# 2. Update pwa/app.js
with open('pwa/app.js', 'r', encoding='utf-8') as f:
    app = f.read()

# Replace Level 2 & Level 3 in app.js
old_level2_target = """    if (!State.libraryClass) {
      if (DOM.libBreadcrumbBar) {
        DOM.libBreadcrumbBar.innerHTML = `
          <button id="libBackToSubjectsBtn" class="lib-back-btn" type="button">
            ${icon('arrow_back')}
            <span>All Subjects</span>
          </button>
          <div class="lib-crumb-trail">
            <button class="lib-crumb-link" type="button" id="libCrumbRoot">Library</button>
            <span class="lib-crumb-sep">›</span>
            <span class="lib-crumb-current">${escapeHtml(State.librarySubject)}</span>
          </div>
        `;
        const backBtn = DOM.libBreadcrumbBar.querySelector('#libBackToSubjectsBtn');
        const crumbRoot = DOM.libBreadcrumbBar.querySelector('#libCrumbRoot');
        const goBack = () => {
          State.librarySubject = null;
          State.libraryClass = null;
          renderLibrary();
        };
        if (backBtn) backBtn.addEventListener('click', goBack);
        if (crumbRoot) crumbRoot.addEventListener('click', goBack);
      }

      const classNames = Object.keys(currentSubjectObj.classes).sort((a, b) => {
        if (a === 'Child Development') return -1;
        if (b === 'Child Development') return 1;
        const isPyqA = a.includes('PYQ');
        const isPyqB = b.includes('PYQ');
        if (!isPyqA && isPyqB) return -1;
        if (isPyqA && !isPyqB) return 1;
        const numA = (a.match(/\d+/) || [99])[0];
        const numB = (b.match(/\d+/) || [99])[0];
        return Number(numA) - Number(numB);
      });

      let html = storageWarning ? `<p class="library-warning" role="status">${escapeHtml(storageWarning)}</p>` : '';
      html += `
        <div class="lib-level-header">
          <div>
            <h3>${escapeHtml(State.librarySubject)} — Select Class or Section</h3>
            <div class="lib-level-count">${classNames.length} sections available</div>
          </div>
        </div>
        <div class="lib-hierarchy-grid">
      `;

      classNames.forEach((cn) => {
        const cObj = currentSubjectObj.classes[cn];
        const cCount = cObj.modules.length;
        const qCount = cObj.totalQuestions;

        let desc = `${cCount} curated study modules with verified practice questions and adaptive revision.`;
        let iconName = 'school';
        if (cn.includes('Child Development')) {
          iconName = 'psychology';
          desc = 'Child Development & Pedagogy textbook chapters: Growth, Socialisation, Piaget, Vygotsky, Kohlberg, Intelligence & Inclusive Education.';
        } else if (cn.includes('Class 6')) {
          desc = 'Class 6 NCERT: History (Our Pasts I), Geography (The Earth Our Habitat), Civics (Social & Political Life I).';
        } else if (cn.includes('Class 7')) {
          desc = 'Class 7 NCERT: History (Our Pasts II), Geography (Our Environment), Civics (Social & Political Life II).';
        } else if (cn.includes('Class 8')) {
          desc = 'Class 8 NCERT: History (Our Pasts III), Geography (Resources & Dev), Civics (Social & Political Life III).';
        } else if (cn.includes('PYQ')) {
          iconName = 'assignment';
          desc = 'Official previous year CTET Paper 2 exam sets with comprehensive answers and explanations.';
        }

        html += `
          <div class="lib-nav-card" data-cls="${escapeHtml(cn)}">
            <div class="lib-nav-card-head">
              <div class="lib-nav-card-icon icon-cls">${icon(iconName)}</div>
              <div>
                <h4 class="lib-nav-card-title">${escapeHtml(cn)}</h4>
                <div class="lib-nav-card-sub">${cCount} chapter${cCount === 1 ? '' : 's'} · ${qCount} verified MCQs</div>
              </div>
            </div>
            <div class="lib-nav-card-desc">${escapeHtml(desc)}</div>
            <div class="lib-nav-card-foot">
              <span>View Chapters</span>
              ${icon('arrow_forward')}
            </div>
          </div>
        `;
      });

      html += `</div>`;
      DOM.libraryContainer.innerHTML = html;

      DOM.libraryContainer.querySelectorAll('.lib-nav-card').forEach((card) => {
        card.addEventListener('click', () => {
          const cls = card.getAttribute('data-cls');
          State.libraryClass = cls;
          renderLibrary();
        });
      });
      return;
    }

    // CASE 4: LEVEL 3 — CHAPTERS LIST (State.librarySubject !== null && State.libraryClass !== null)
    const currentClassObj = currentSubjectObj.classes[State.libraryClass];
    if (!currentClassObj) {
      State.libraryClass = null;
      renderLibrary();
      return;
    }

    if (DOM.libBreadcrumbBar) {
      DOM.libBreadcrumbBar.innerHTML = `
        <button id="libBackToClassesBtn" class="lib-back-btn" type="button">
          ${icon('arrow_back')}
          <span>Back to ${escapeHtml(State.librarySubject)}</span>
        </button>
        <div class="lib-crumb-trail">
          <button class="lib-crumb-link" type="button" id="libCrumbRoot">Library</button>
          <span class="lib-crumb-sep">›</span>
          <button class="lib-crumb-link" type="button" id="libCrumbSubject">${escapeHtml(State.librarySubject)}</button>
          <span class="lib-crumb-sep">›</span>
          <span class="lib-crumb-current">${escapeHtml(State.libraryClass)}</span>
        </div>
      `;

      const backBtn = DOM.libBreadcrumbBar.querySelector('#libBackToClassesBtn');
      const crumbSubject = DOM.libBreadcrumbBar.querySelector('#libCrumbSubject');
      const crumbRoot = DOM.libBreadcrumbBar.querySelector('#libCrumbRoot');

      if (backBtn) backBtn.addEventListener('click', () => {
        State.libraryClass = null;
        renderLibrary();
      });
      if (crumbSubject) crumbSubject.addEventListener('click', () => {
        State.libraryClass = null;
        renderLibrary();
      });
      if (crumbRoot) crumbRoot.addEventListener('click', () => {
        State.librarySubject = null;
        State.libraryClass = null;
        renderLibrary();
      });
    }

    const activeList = currentClassObj.modules;
    let html = storageWarning ? `<p class="library-warning" role="status">${escapeHtml(storageWarning)}</p>` : '';
    html += `
      <div class="lib-level-header">
        <div>
          <h3>${escapeHtml(State.libraryClass)}</h3>
          <div class="lib-level-count">${activeList.length} chapter${activeList.length === 1 ? '' : 's'} available</div>
        </div>
      </div>
    `;"""

new_level2_replacement = """    if (!State.libraryClass) {
      if (DOM.libBreadcrumbBar) {
        DOM.libBreadcrumbBar.innerHTML = `
          <div class="lib-crumb-trail">
            <span class="lib-crumb-current">UGC NET Education (Code 09) — 10 Syllabus Units</span>
          </div>
        `;
      }

      // Sort Units 1 to 10 strictly in numeric order
      const classNames = Object.keys(currentSubjectObj.classes).sort((a, b) => {
        const numA = parseInt((a.match(/\\d+/) || [99])[0], 10);
        const numB = parseInt((b.match(/\\d+/) || [99])[0], 10);
        return numA - numB;
      });

      const unitInfoMap = {
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
        }
      };

      let html = storageWarning ? `<p class="library-warning" role="status">${escapeHtml(storageWarning)}</p>` : '';
      html += `
        <div class="lib-level-header">
          <div>
            <h3>UGC NET Education (Code 09) — Syllabus Units</h3>
            <div class="lib-level-count">${classNames.length} official syllabus units · ${currentSubjectObj.totalQuestions} verified MCQs</div>
          </div>
        </div>
        <div class="lib-hierarchy-grid">
      `;

      classNames.forEach((cn) => {
        const cObj = currentSubjectObj.classes[cn];
        const cCount = cObj.modules.length;
        const qCount = cObj.totalQuestions;

        const uKey = (cn.match(/Unit\\s+\\d+/) || [''])[0];
        const matched = unitInfoMap[uKey] || {
          icon: 'school',
          desc: `${cCount} curated practice sets with verified UGC NET PYQs.`
        };
        const iconName = matched.icon;
        const desc = matched.desc;

        html += `
          <div class="lib-nav-card" data-cls="${escapeHtml(cn)}">
            <div class="lib-nav-card-head">
              <div class="lib-nav-card-icon icon-cls">${icon(iconName)}</div>
              <div>
                <h4 class="lib-nav-card-title">${escapeHtml(cn)}</h4>
                <div class="lib-nav-card-sub">${cCount} practice set${cCount === 1 ? '' : 's'} · ${qCount} verified MCQs</div>
              </div>
            </div>
            <div class="lib-nav-card-desc">${escapeHtml(desc)}</div>
            <div class="lib-nav-card-foot">
              <span>Explore Practice Sets</span>
              ${icon('arrow_forward')}
            </div>
          </div>
        `;
      });

      html += `</div>`;
      DOM.libraryContainer.innerHTML = html;

      DOM.libraryContainer.querySelectorAll('.lib-nav-card').forEach((card) => {
        card.addEventListener('click', () => {
          const cls = card.getAttribute('data-cls');
          State.libraryClass = cls;
          renderLibrary();
        });
      });
      return;
    }

    // CASE 4: LEVEL 3 — PRACTICE SETS LIST (State.librarySubject !== null && State.libraryClass !== null)
    const currentClassObj = currentSubjectObj.classes[State.libraryClass];
    if (!currentClassObj) {
      State.libraryClass = null;
      renderLibrary();
      return;
    }

    if (DOM.libBreadcrumbBar) {
      DOM.libBreadcrumbBar.innerHTML = `
        <button id="libBackToClassesBtn" class="lib-back-btn" type="button">
          ${icon('arrow_back')}
          <span>All Syllabus Units</span>
        </button>
        <div class="lib-crumb-trail">
          <button class="lib-crumb-link" type="button" id="libCrumbSubject">Syllabus</button>
          <span class="lib-crumb-sep">›</span>
          <span class="lib-crumb-current">${escapeHtml(State.libraryClass)}</span>
        </div>
      `;

      const backBtn = DOM.libBreadcrumbBar.querySelector('#libBackToClassesBtn');
      const crumbSubject = DOM.libBreadcrumbBar.querySelector('#libCrumbSubject');

      if (backBtn) backBtn.addEventListener('click', () => {
        State.libraryClass = null;
        renderLibrary();
      });
      if (crumbSubject) crumbSubject.addEventListener('click', () => {
        State.libraryClass = null;
        renderLibrary();
      });
    }

    const activeList = currentClassObj.modules;
    let html = storageWarning ? `<p class="library-warning" role="status">${escapeHtml(storageWarning)}</p>` : '';
    html += `
      <div class="lib-level-header">
        <div>
          <h3>${escapeHtml(State.libraryClass)}</h3>
          <div class="lib-level-count">${activeList.length} Practice Set${activeList.length === 1 ? '' : 's'} available (${currentClassObj.totalQuestions} Verified MCQs)</div>
        </div>
      </div>
    `;"""

# Normalize line endings for replacement
norm_app = app.replace('\r\n', '\n')
norm_old = old_level2_target.replace('\r\n', '\n')
norm_new = new_level2_replacement.replace('\r\n', '\n')

assert norm_old in norm_app, "Level 2 target not found in app.js!"
norm_app = norm_app.replace(norm_old, norm_new)

# Update renderChapterCard to hide delete button on bundled UGC NET sets
old_card_del = """            <button class="lib-del" type="button" data-id="${escapeHtml(mod.id)}" aria-label="Delete ${safeTitle}">${icon('delete')}</button>"""
new_card_del = """            ${String(mod.id || '').startsWith('ugc_net_') ? '' : `<button class="lib-del" type="button" data-id="${escapeHtml(mod.id)}" aria-label="Delete ${safeTitle}">${icon('delete')}</button>`}"""
norm_app = norm_app.replace(old_card_del, new_card_del)

# Update verified questions label
norm_app = norm_app.replace(
    """<span>${revisionOnly ? 'No verified MCQs' : `${questionCount} verified question${questionCount === 1 ? '' : 's'}`}</span>""",
    """<span>${questionCount} Verified UGC NET MCQs</span>"""
)

# Update icon in chapter card from picture_as_pdf to school
norm_app = norm_app.replace(
    """<div class="library-file-icon">${icon('picture_as_pdf')}</div>""",
    """<div class="library-file-icon">${icon('school')}</div>"""
)

with open('pwa/app.js', 'w', encoding='utf-8') as f:
    f.write(norm_app)
print('Updated pwa/app.js')

