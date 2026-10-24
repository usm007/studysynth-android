# StudySynth Android

**A fully offline competitive exam study workspace and simulator for Android and desktop browsers.**

StudySynth is a zero-network, zero-AI, 100% offline study app. It bundles NCERT curriculum materials and CTET prep modules, supports local document ingestion and on-device OCR, and provides comprehensive Practice, Adaptive Revision, and Exam Test modes with real-time scoring.

---

## 🚀 Running Locally

To run the web app locally on desktop:

```bash
# Start a threaded HTTP server (threaded server required for Service Worker and WebAssembly)
python -m http.server 8899 --directory pwa
```

Then open `http://localhost:8899` in your browser.

---

## 🧪 Running Tests

Run the client engine and content test suites:

```bash
# 1. PWA engine and integration tests (four suites)
npm test --prefix pwa

# 2. Content and gate validation tests
python -m pytest tests/ -q
```

---

## 📦 Building the Android APK

To build the native Android application:

```bash
# 1. Install dependencies
npm install
npm install --prefix pwa

# 2. Build the web payload and compile the Android APK
npm run android:apk

# 3. Publish the release artifact
mkdir -p output
cp android/app/build/outputs/apk/debug/app-debug.apk output/StudySynth.apk
```

The resulting package is stored at `output/StudySynth.apk`.

---

## 📋 Requirements

- **Node.js**: 22+
- **JDK**: Eclipse Temurin / OpenJDK 21
- **Android SDK**: Platform 36 and Build-Tools 36
- **Python**: 3.12+ (for content tooling and tests)

---

## 📚 Content Pipeline

The bundled curriculum and exam sets are prepared using the Python content tools in `scripts/`:

```bash
# Convert NCERT chapters
python scripts/convert_ncert_ctet.py

# Convert pedagogy content
python scripts/convert_pedagogy_chapters.py

# Build bundled CTET payload and manifest
python scripts/build_ctet_payload.py

# Verify the bundled Material Symbols font subset
python scripts/build_icon_font.py --check
```

Gate decisions and audit logs are tracked in `data/ctet_gate/`.

---

## 📁 Repository Layout

```
studysynth-android/
├── android/                 # Capacitor Android project
├── pwa/                     # Progressive Web App source
│   ├── assets/              # Icons, logos, and bundled font subsets
│   ├── ctet/                # Bundled study modules and question sets
│   ├── engine/              # Client generator, parser, storage, and revision engines
│   ├── tests/               # PWA test suites
│   ├── app.js               # Application lifecycle controller
│   ├── index.html           # Main UI shell
│   ├── styles.css           # Responsive styling and dark mode
│   └── sw.js                # Offline caching service worker
├── data/                    # Gate decisions and audit records
├── scripts/                 # Web packaging and content pipeline scripts
├── tests/                   # Python content and gate validation tests
├── docs/                    # Design specifications and architecture notes
├── capacitor.config.json    # Capacitor configuration
├── package.json             # Root npm configuration and build scripts
└── requirements.txt         # Python dependencies for content tools
```

---

## 📜 License

MIT License.
