# StudySynth — Education Version

**A fully offline, zero-network competitive exam study workspace and test simulator for Android and desktop browsers.**

Targeted specifically for **UGC NET Education (Paper 2 - Subject Code 09)** and **CTET Paper-II (Child Development & Pedagogy and Social Studies / Social Science)**.

---

## 🎯 Highlights & Features

- **8,519 Verified Questions**:
  - **UGC NET Education (Code 09)**: 2,024 questions accurately mapped across all 10 official NTA syllabus units:
    - Unit 1: Educational Studies
    - Unit 2: History, Politics and Economics of Education
    - Unit 3: Learner and Learning Process
    - Unit 4: Teacher Education
    - Unit 5: Curriculum Studies
    - Unit 6: Research in Education
    - Unit 7: Pedagogy, Andragogy and Assessment
    - Unit 8: Technology in / for Education
    - Unit 9: Educational Management, Administration and Leadership
    - Unit 10: Inclusive Education
  - **CTET Paper-II PYQs**: 6,495 questions categorized methodically into:
    - Child Development & Pedagogy (Growth & Development, Learning Theories, Inclusive Education, Assessment, Progressive Education, Learning & Pedagogy)
    - Social Studies / Social Science (History, Geography, Social & Political Life / Civics, Subject Pedagogy)
- **Official Exam Simulation & Test Mode**:
  - **UGC NET Education (Paper 2)**: 100 Questions | 120 Minutes | 200 Marks (+2 / 0) — 10 questions systematically sampled across each of the 10 units.
  - **CTET Paper-II (SST + CDP)**: 90 Questions | 90 Minutes | 90 Marks (+1 / 0) — 30 CDP + 60 SST questions balanced across History, Geography, Polity, and Pedagogy.
  - **CTET CDP Mock**: 30 Questions | 30 Minutes | 30 Marks (+1 / 0).
  - **Custom Test Builder**: Select any subject scope, set custom question limits (5 to 100), and choose custom pacing (30s to 120s per question).
- **True Randomization**: Test mode automatically randomizes question order using the Fisher-Yates algorithm on every attempt to simulate authentic exam conditions. Practice mode retains sequential order for structured learning.
- **Ultra-Compact APK (~25 MB)**: Zero PDF bloat, bundling optimized question modules, local Tesseract OCR engine, and Material Design UI.
- **100% Offline & Private**: Works completely air-gapped without requiring internet access or account logins.

---

## 🚀 Running Locally

To run the web app locally on desktop:

```bash
# Start a local HTTP server
python -m http.server 8899 --directory pwa
```

Open `http://localhost:8899` in your web browser.

---

## 🧪 Running Tests

Verify engine logic and question bank integrity:

```bash
# Run PWA test suites
npm test --prefix pwa
```

All 6 test suites validate question parsing, schema conformance, reasoning engine, icon font subsets, and state management.

---

## 📦 Building the Android APK

Build the standalone Android APK using Capacitor and Gradle:

```bash
# 1. Build web distribution
node scripts/build-web.js

# 2. Sync web assets with Capacitor Android
npx cap sync android

# 3. Compile Android debug APK
cd android
./gradlew clean assembleDebug
cd ..

# The APK will be generated at:
# android/app/build/outputs/apk/debug/app-debug.apk (~25.2 MB)
```

---

## 📁 Repository Layout

```
studysynth-android/
├── android/                 # Capacitor Android native project & Gradle build
├── pwa/                     # Progressive Web App source
│   ├── assets/              # Icons, logos, and bundled font subsets
│   ├── ctet/                # 20 classified question modules (UGC NET & CTET)
│   ├── engine/              # Scoring, timer, offline storage, and parser engines
│   ├── tests/               # Automated test suites
│   ├── app.js               # Main application controller (randomization, exam modes)
│   ├── ctet_index.js        # Question index registry
│   ├── ctet_manifest.js     # Exam structure & topic metadata
│   ├── index.html           # Material 3 UI shell
│   ├── styles.css           # Responsive styles and dark mode support
│   └── sw.js                # Service worker for offline asset caching
├── scripts/                 # Data classification, build, and packaging scripts
├── capacitor.config.json    # Capacitor configuration
├── package.json             # Root npm workspace configuration
└── README.md                # Project documentation
```

---

## 📜 License

MIT License.

