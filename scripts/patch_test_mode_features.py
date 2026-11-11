import re
import os

print("--- Updating pwa/index.html with Official Mocks & Custom Test Controls ---")

with open('pwa/index.html', 'r', encoding='utf-8') as f:
    html = f.read()

# Replace testSetup section
test_setup_regex = re.compile(
    r'<section id="testSetup" class="test-setup"[^>]*>.*?</section>',
    re.DOTALL
)

new_test_setup_html = """<section id="testSetup" class="test-setup" hidden aria-labelledby="testSetupTitle">
                <div class="test-setup-card">
                  <div class="test-setup-header">
                    <div class="test-header-icon"><span class="ms-icon" aria-hidden="true">timer</span></div>
                    <div>
                      <h2 id="testSetupTitle">Exam Test Mode</h2>
                      <p class="test-setup-sub">Timed exam simulator with randomized questions &amp; live scoring</p>
                    </div>
                  </div>

                  <!-- Official Full Exam Mocks -->
                  <div class="test-section-box">
                    <div class="test-box-title">
                      <span class="ms-icon" aria-hidden="true">verified</span>
                      <span>Official Exam Mocks (Full Syllabus Format)</span>
                    </div>
                    <p class="test-box-desc">Official question count, time limit, and topic-balanced distribution:</p>
                    
                    <div class="official-mock-grid">
                      <!-- UGC NET Education Paper 2 Mock -->
                      <div class="official-mock-card">
                        <div class="mock-card-top">
                          <span class="mock-badge ugc-badge">UGC NET Education</span>
                          <span class="mock-time"><span class="ms-icon" aria-hidden="true">schedule</span> 120 Mins</span>
                        </div>
                        <div class="mock-card-title">Paper 2 Complete Mock</div>
                        <div class="mock-card-meta">
                          <span><b>100</b> Questions (10 per Unit)</span>
                          <span><b>200</b> Marks (+2 / 0)</span>
                        </div>
                        <button type="button" class="btn btn-primary mock-start-btn" data-preset="ugc_net_full">
                          <span class="ms-icon" aria-hidden="true">play_arrow</span> Start UGC NET Mock (100 Qs · 120 Mins)
                        </button>
                      </div>

                      <!-- CTET Paper 2 Social Science & CDP Mock -->
                      <div class="official-mock-card">
                        <div class="mock-card-top">
                          <span class="mock-badge ctet-badge">CTET Paper-II</span>
                          <span class="mock-time"><span class="ms-icon" aria-hidden="true">schedule</span> 90 Mins</span>
                        </div>
                        <div class="mock-card-title">Social Science &amp; CDP Complete Mock</div>
                        <div class="mock-card-meta">
                          <span><b>90</b> Questions (30 CDP + 60 SST)</span>
                          <span><b>90</b> Marks (+1 / 0)</span>
                        </div>
                        <button type="button" class="btn btn-primary mock-start-btn" data-preset="ctet_p2_full">
                          <span class="ms-icon" aria-hidden="true">play_arrow</span> Start CTET Paper-II Mock (90 Qs · 90 Mins)
                        </button>
                      </div>

                      <!-- CTET CDP Section Mock -->
                      <div class="official-mock-card">
                        <div class="mock-card-top">
                          <span class="mock-badge ctet-badge">CTET CDP</span>
                          <span class="mock-time"><span class="ms-icon" aria-hidden="true">schedule</span> 30 Mins</span>
                        </div>
                        <div class="mock-card-title">Child Development &amp; Pedagogy Section</div>
                        <div class="mock-card-meta">
                          <span><b>30</b> Questions (Units 1–6)</span>
                          <span><b>30</b> Marks (+1 / 0)</span>
                        </div>
                        <button type="button" class="btn btn-secondary mock-start-btn" data-preset="ctet_p1_cdp">
                          <span class="ms-icon" aria-hidden="true">play_arrow</span> Start CTET CDP Mock (30 Qs · 30 Mins)
                        </button>
                      </div>
                    </div>
                  </div>

                  <!-- Custom Test Builder -->
                  <div class="test-section-box custom-test-box">
                    <div class="test-box-title">
                      <span class="ms-icon" aria-hidden="true">tune</span>
                      <span>Custom Exam Test (Choose Questions &amp; Time)</span>
                    </div>
                    <p id="testSetupModule" class="test-setup-module" style="margin-top:0;margin-bottom:12px;"></p>
                    
                    <div class="test-setup-grid custom-grid">
                      <label class="test-field" for="testScopeSelect" style="grid-column: 1 / -1;">
                        <span>Choose Exam / Subject / Topic</span>
                        <select id="testScopeSelect"></select>
                      </label>
                      
                      <label class="test-field" for="testQuestionCount">
                        <span>Number of Questions</span>
                        <select id="testQuestionCount"></select>
                      </label>
                      
                      <label class="test-field" for="testSecondsPerQuestion">
                        <span>Time Per Question</span>
                        <select id="testSecondsPerQuestion">
                          <option value="30">30 seconds (Fast pace)</option>
                          <option value="45">45 seconds</option>
                          <option value="60" selected>60 seconds (1 min · CTET pace)</option>
                          <option value="72">72 seconds (1.2 min · UGC NET pace)</option>
                          <option value="90">90 seconds (1.5 min)</option>
                          <option value="120">120 seconds (2 mins)</option>
                        </select>
                      </label>
                    </div>

                    <div class="test-setup-summary">
                      <div><span>Questions</span><strong id="testSummaryQuestions">10</strong></div>
                      <div><span>Total Time</span><strong id="testTotalTime">10:00</strong></div>
                      <div><span>Marking</span><strong id="testSummaryMarking">+2.00 / 0</strong></div>
                      <div><span>Order</span><strong style="color:var(--accent);">Randomized</strong></div>
                    </div>

                    <button id="testStartBtn" class="btn btn-primary test-start-btn" type="button">
                      <span class="ms-icon" aria-hidden="true">play_arrow</span> Start Custom Test
                    </button>
                  </div>

                  <p class="test-setup-note">Questions are shuffled randomly every test session. The timer starts immediately and auto-submits when time runs out.</p>
                </div>
              </section>"""

assert test_setup_regex.search(html), "Could not find testSetup section in index.html"
html = test_setup_regex.sub(new_test_setup_html, html)

with open('pwa/index.html', 'w', encoding='utf-8') as f:
    f.write(html)
print("Updated pwa/index.html successfully.")

# --------------------------------------------------------------------------
# Update pwa/styles.css
# --------------------------------------------------------------------------
print("\n--- Updating pwa/styles.css ---")
with open('pwa/styles.css', 'r', encoding='utf-8') as f:
    css = f.read()

extra_css = """
/* Enhanced Exam Test Mode Styles */
.test-setup-card {
  max-width: 620px;
  margin: 0 auto;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: 24px;
  box-shadow: var(--shadow-sm);
}
.test-setup-header {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 20px;
}
.test-header-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  background: var(--surface-2);
  color: var(--accent);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.test-header-icon .ms-icon { font-size: 26px; }
.test-setup-header h2 {
  font-size: 20px;
  font-weight: 800;
  margin: 0;
  letter-spacing: -0.015em;
}
.test-setup-sub {
  font-size: 13px;
  color: var(--muted);
  margin: 2px 0 0;
}
.test-section-box {
  background: var(--surface-2);
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 16px;
  margin-bottom: 18px;
}
.test-box-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 700;
  color: var(--ink);
  margin-bottom: 4px;
}
.test-box-title .ms-icon {
  font-size: 18px;
  color: var(--accent);
}
.test-box-desc {
  font-size: 12px;
  color: var(--muted);
  margin: 0 0 12px 0;
}
.official-mock-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
}
.official-mock-card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.official-mock-card:hover {
  border-color: var(--accent);
  box-shadow: var(--shadow-sm);
}
.mock-card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.mock-badge {
  font-size: 11px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 6px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.mock-badge.ugc-badge {
  background: rgba(33, 150, 243, 0.12);
  color: #1976d2;
}
.mock-badge.ctet-badge {
  background: rgba(76, 175, 80, 0.12);
  color: #2e7d32;
}
.mock-time {
  font-size: 12px;
  font-weight: 600;
  color: var(--muted);
  display: flex;
  align-items: center;
  gap: 4px;
}
.mock-time .ms-icon { font-size: 14px; }
.mock-card-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--ink);
}
.mock-card-meta {
  display: flex;
  gap: 14px;
  font-size: 12px;
  color: var(--muted);
}
.mock-start-btn {
  margin-top: 4px;
  min-height: 38px;
  font-size: 13px;
  font-weight: 700;
  padding: 6px 14px;
  justify-content: center;
  border-radius: 8px;
}
"""

if "/* Enhanced Exam Test Mode Styles */" not in css:
    css += extra_css
    with open('pwa/styles.css', 'w', encoding='utf-8') as f:
        f.write(css)
    print("Added test mode styles to pwa/styles.css.")
else:
    print("Test mode styles already present.")

