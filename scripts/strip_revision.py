import re

# 1. Update pwa/index.html
with open(r'pwa\index.html', 'r', encoding='utf-8') as f:
    html = f.read()

# Replace mode-list in nav
old_nav = '''        <nav class="mode-list" aria-label="Study modes">
          <button class="mode-item active" data-mode="library" aria-current="page">
            <span class="mode-icon ms-icon" aria-hidden="true">library_books</span>
            <div>
              <b>Library</b>
              <small>PDFs &amp; saved sets</small>
            </div>
          </button>
          <button class="mode-item" data-mode="practice">
            <span class="mode-icon ms-icon" aria-hidden="true">lightbulb</span>
            <div>
              <b>Practice</b>
              <small>Instant feedback &amp; citation</small>
            </div>
          </button>
          <button class="mode-item" data-mode="revision">
            <span class="mode-icon ms-icon" aria-hidden="true">style</span>
            <div>
              <b>Revision</b>
              <small>Adaptive spaced recall</small>
            </div>
          </button>
          <button class="mode-item" data-mode="test">
            <span class="mode-icon ms-icon" aria-hidden="true">timer</span>
            <div>
              <b>Exam Test</b>
              <small>Timed evaluation</small>
            </div>
          </button>
          <button class="mode-item" data-mode="generator">
            <span class="mode-icon ms-icon" aria-hidden="true">bolt</span>
            <div>
              <b>Generator</b>
              <small>Extract from notes / PDF</small>
            </div>
          </button>
        </nav>'''

new_nav = '''        <nav class="mode-list" aria-label="Study modes">
          <button class="mode-item active" data-mode="library" aria-current="page">
            <span class="mode-icon ms-icon" aria-hidden="true">library_books</span>
            <div>
              <b>Library</b>
              <small>Question Papers (2009–2026)</small>
            </div>
          </button>
          <button class="mode-item" data-mode="practice">
            <span class="mode-icon ms-icon" aria-hidden="true">lightbulb</span>
            <div>
              <b>Practice Mode</b>
              <small>Instant feedback &amp; explanations</small>
            </div>
          </button>
          <button class="mode-item" data-mode="test">
            <span class="mode-icon ms-icon" aria-hidden="true">timer</span>
            <div>
              <b>Exam Test Mode</b>
              <small>Timed evaluation &amp; scoring</small>
            </div>
          </button>
        </nav>'''

html = html.replace(old_nav, new_nav)
# In case of CRLF
html = html.replace(old_nav.replace('\n', '\r\n'), new_nav.replace('\n', '\r\n'))

with open(r'pwa\index.html', 'w', encoding='utf-8') as f:
    f.write(html)

print("Updated pwa/index.html nav to only have Library, Practice, and Exam Test!")

# 2. Update pwa/app.js
with open(r'pwa\app.js', 'r', encoding='utf-8') as f:
    app_js = f.read()

# Remove the Revision button from renderChapterCard
# Old:
# <button class="lib-mode lib-mode-revision" ... </button>
pattern_rev_btn = r'<button class="lib-mode lib-mode-revision"[^>]*>[\s\S]*?<\/button>\s*'
app_js = re.sub(pattern_rev_btn, '', app_js)

# Also update scoreline in renderChapterCard so it doesn't mention "Revision-only set"
app_js = app_js.replace("revisionOnly ? 'Revision-only set — no verified MCQs' : 'Not attempted yet'", "'Not attempted yet'")
app_js = app_js.replace("revisionOnly ? 'Revision-only set \x97 no verified MCQs' : 'Not attempted yet'", "'Not attempted yet'")

with open(r'pwa\app.js', 'w', encoding='utf-8') as f:
    f.write(app_js)

print("Updated pwa/app.js to remove Revision button from cards!")

