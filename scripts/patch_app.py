with open(r'pwa\app.js', 'r', encoding='utf-8') as f:
    code = f.read()

# 1. Update startLibraryMode to handle 'view-pdf' and 'view-key'
target_start_mode = "async function startLibraryMode(mod, mode) {"
replacement_start_mode = """async function startLibraryMode(mod, mode) {
    if (!mod) return;
    if (mode === 'view-pdf') {
      if (window.PdfViewer && mod.pdfFilename) {
        window.PdfViewer.openPdf(mod.pdfFilename, mod.title, mod.ansKeyFilename);
      } else {
        showToast('PDF file not specified for this set.');
      }
      return;
    }
    if (mode === 'view-key') {
      if (window.PdfViewer && mod.ansKeyFilename) {
        window.PdfViewer.openPdf(mod.ansKeyFilename, mod.title + ' (Official Answer Key)', mod.pdfFilename);
      } else {
        showToast('Answer key not available for this set.');
      }
      return;
    }"""

if target_start_mode in code:
    code = code.replace(target_start_mode, replacement_start_mode, 1)

# 2. Add PDF buttons to renderChapterCard
target_card_modes = """            <button class="lib-mode lib-mode-test" type="button" data-id="${escapeHtml(mod.id)}" data-action="test" aria-label="Take an exam test on ${safeTitle}"${revisionOnly ? ' disabled aria-disabled="true"' : ''}>
              ${icon('timer')}
              <span class="lib-mode-copy"><b>Exam Test</b><small>${revisionOnly ? 'No MCQs' : 'Timed'}</small></span>
            </button>
          </div>"""

replacement_card_modes = """            <button class="lib-mode lib-mode-test" type="button" data-id="${escapeHtml(mod.id)}" data-action="test" aria-label="Take an exam test on ${safeTitle}"${revisionOnly ? ' disabled aria-disabled="true"' : ''}>
              ${icon('timer')}
              <span class="lib-mode-copy"><b>Exam Test</b><small>${revisionOnly ? 'No MCQs' : 'Timed'}</small></span>
            </button>
            ${mod.pdfFilename ? `
            <button class="lib-mode lib-mode-pdf" type="button" data-id="${escapeHtml(mod.id)}" data-action="view-pdf" aria-label="View original PDF for ${safeTitle}">
              ${icon('picture_as_pdf')}
              <span class="lib-mode-copy"><b>Paper PDF</b><small>Official Paper</small></span>
            </button>` : ''}
            ${mod.ansKeyFilename ? `
            <button class="lib-mode lib-mode-key" type="button" data-id="${escapeHtml(mod.id)}" data-action="view-key" aria-label="View answer key for ${safeTitle}">
              ${icon('check_circle')}
              <span class="lib-mode-copy"><b>Answer Key</b><small>Official Key</small></span>
            </button>` : ''}
          </div>"""

if target_card_modes in code:
    code = code.replace(target_card_modes, replacement_card_modes, 1)

# 3. Update subjectOrder and subject descriptions
code = code.replace(
    "const subjectOrder = ['Social Science', 'Pedagogy', 'English'];",
    "const subjectOrder = ['Education', 'UGC NET Education', 'Social Science', 'Pedagogy', 'English'];"
)

target_soc_desc = "if (subName === 'Social Science') {"
replacement_soc_desc = """if (subName === 'Education' || subName === 'UGC NET Education') {
          iconName = 'school';
          iconClass = 'icon-ped';
          desc = 'UGC NET Education (Code 09) official question papers (2009–2026), verified answer keys, and exam simulator.';
        } else if (subName === 'Social Science') {"""

if target_soc_desc in code:
    code = code.replace(target_soc_desc, replacement_soc_desc, 1)

with open(r'pwa\app.js', 'w', encoding='utf-8') as f:
    f.write(code)

print("Updated pwa/app.js successfully!")

