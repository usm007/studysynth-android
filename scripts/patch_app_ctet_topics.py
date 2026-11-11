import re

with open('pwa/app.js', 'r', encoding='utf-8') as f:
    code = f.read()

# 1. Update line 854: sheetContext fallback
code = re.sub(
    r"if\s*\(DOM\.sheetContext\)\s*DOM\.sheetContext\.textContent\s*=\s*q\.source_title\s*\|\|\s*'General Studies';",
    "if (DOM.sheetContext) DOM.sheetContext.textContent = q.source_title || '';",
    code
)

# 2. Update line 882: q-context source tag only if q.source_title is present
old_qcontext = '<div class="q-context">${escapeHtml(q.cognitive_level || \'recall\')}<span class="sep">/</span>${escapeHtml(q.source_title || \'source\')}</div>'
new_qcontext = '<div class="q-context">${escapeHtml(q.cognitive_level || \'recall\')}${q.source_title ? `<span class="sep">/</span><span class="source-tag">${escapeHtml(q.source_title)}</span>` : \'\'}</div>'

if old_qcontext in code:
    code = code.replace(old_qcontext, new_qcontext)
else:
    # try regex replacement
    code = re.sub(
        r'<div class="q-context">\$\{escapeHtml\(q\.cognitive_level \|\| \'recall\'\)\}<span class="sep">/</span>\$\{escapeHtml\(q\.source_title \|\| \'source\'\)\}</div>',
        new_qcontext,
        code
    )

# 3. Update topicMetaMap in renderLibrary()
topic_meta_target = """    const topicMetaMap = {
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
    };"""

new_topic_meta = """    const topicMetaMap = {
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
    };"""

if topic_meta_target in code:
    code = code.replace(topic_meta_target, new_topic_meta)
    print("Replaced topicMetaMap successfully.")
else:
    print("WARNING: topicMetaMap target exact match not found, looking for block...")

# 4. Update getMeta(mod)
old_get_meta = """    function getMeta(mod) {
      const id = String(mod.id || '').toLowerCase();
      if (id.includes('pyq')) return topicMetaMap['all_pyq'];
      if (id.includes('cdp')) return topicMetaMap['cdp'];
      if (id.includes('sst')) return topicMetaMap['sst'];
      if (id.includes('unit_10')) return topicMetaMap['Unit 10'];
      for (let i = 1; i <= 9; i++) {
        if (id.includes(`unit_${i}`)) return topicMetaMap[`Unit ${i}`];
      }
      return { icon: 'school', desc: 'Comprehensive practice set with verified exam MCQs.' };
    }"""

new_get_meta = """    function getMeta(mod) {
      const id = String(mod.id || '').toLowerCase();
      if (topicMetaMap[id]) return topicMetaMap[id];
      if (id.includes('unit_10')) return topicMetaMap['Unit 10'];
      for (let i = 1; i <= 9; i++) {
        if (id.includes(`unit_${i}`) && !id.startsWith('ctet_')) return topicMetaMap[`Unit ${i}`];
      }
      return { icon: 'school', desc: 'Comprehensive practice set with verified exam MCQs.' };
    }"""

if old_get_meta in code:
    code = code.replace(old_get_meta, new_get_meta)
    print("Replaced getMeta successfully.")

# 5. Update displayTitle and subjectBadge in renderCard
old_render_card_head = """      let displayTitle = parsed.cls || mod.topic || mod.title || 'Untitled set';
      displayTitle = cleanSetTitle(displayTitle);"""

new_render_card_head = """      let displayTitle = mod.topic || parsed.cls || mod.title || 'Untitled set';
      displayTitle = cleanSetTitle(displayTitle);
      const subjectBadge = mod.subject ? `<span class="library-badge" style="background:var(--surface-variant, #e0e0e0);color:var(--on-surface-variant, #333);font-size:11px;">${escapeHtml(mod.subject)}</span>` : '';"""

if old_render_card_head in code:
    code = code.replace(old_render_card_head, new_render_card_head)
    print("Replaced renderCard title successfully.")

# Also update the title row to display subjectBadge if available
old_title_row = """              <div class="library-title-row">
                <h3>${escapeHtml(displayTitle)}</h3>
                ${isAllInOne ? '<span class="library-badge" style="background:var(--accent);color:#fff;">Master PYQ Bank</span>' : ''}
                ${revisionOnly ? '<span class="library-badge">Revision only</span>' : ''}
              </div>"""

new_title_row = """              <div class="library-title-row">
                <h3>${escapeHtml(displayTitle)}</h3>
                ${subjectBadge}
                ${revisionOnly ? '<span class="library-badge">Revision only</span>' : ''}
              </div>"""

if old_title_row in code:
    code = code.replace(old_title_row, new_title_row)
    print("Replaced title row successfully.")

# 6. Update CTET sorting in renderLibrary
old_ctet_sort = """    } else {
      // CTET: All-in-one PYQ set first, then CDP, then SST
      examSets.sort((a, b) => {
        const order = { 'ctet_all_pyq': 1, 'ctet_topic_cdp': 2, 'ctet_topic_sst': 3 };
        return (order[a.id] || 99) - (order[b.id] || 99);
      });
    }"""

new_ctet_sort = """    } else {
      // CTET: Sort by setNumber (CDP Units 1-6 first, then SST Units 1-4)
      examSets.sort((a, b) => {
        const setA = Number(a.setNumber) || 99;
        const setB = Number(b.setNumber) || 99;
        return setA - setB;
      });
    }"""

if old_ctet_sort in code:
    code = code.replace(old_ctet_sort, new_ctet_sort)
    print("Replaced ctet sort successfully.")

# 7. Update examSub
old_exam_sub = """    const examSub = activeExam === 'ugc_net'
      ? '10 Official Syllabus Units · 1 Comprehensive Practice Set Per Unit'
      : 'All Solved PYQs in One Place · Child Development & Social Science Only';"""

new_exam_sub = """    const examSub = activeExam === 'ugc_net'
      ? '10 Official Syllabus Units · 1 Comprehensive Practice Set Per Unit'
      : 'Official Syllabus Topics · Child Development & Social Science Only';"""

if old_exam_sub in code:
    code = code.replace(old_exam_sub, new_exam_sub)
    print("Replaced examSub successfully.")

with open('pwa/app.js', 'w', encoding='utf-8') as f:
    f.write(code)

print("Updated pwa/app.js successfully!")

