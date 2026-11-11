# Release guide

How to build, verify, and publish StudySynth. Two paths exist: the automated
GitHub Actions release (preferred) and a local release for testing a build before
it is published.

---

## 1. Prerequisites

| Tool | Version | Notes |
| --- | --- | --- |
| Node.js | 22+ | CI uses 22; 24 also works locally |
| JDK | 21 | Required by the Android Gradle plugin used here |
| Android SDK | build-tools 36.0.0 | `ANDROID_HOME` must point at it |
| Chrome | current | Only for `scripts/verify-ui.js` |

Local environment used for the 2.1.0 build:

```
JAVA_HOME=E:\Java\jdk-21.0.13+9
ANDROID_HOME=E:\Android\Sdk
```

Install dependencies:

```bash
npm ci
npm ci --prefix pwa
```

---

## 2. Versioning

`version.json` at the repository root is the single source of truth:

```json
{
  "packageId": "com.usm007.studysynth",
  "channel": "stable",
  "versionName": "2.1.0",
  "versionCode": 4,
  "minSupportedVersionCode": 3,
  "runtimeVersion": "capacitor-8",
  "contentVersion": "2026.11.1",
  "minSdk": 24
}
```

To bump:

1. Edit `version.json`.
   - `versionCode` must increase by at least 1 for every published APK.
   - `versionName` is user-visible and must look like `2.1.0`.
   - `contentVersion` changes only when the question bank changes.
   - `runtimeVersion` changes only when the native shell changes.
2. Run `node scripts/version.js --sync` to update `pwa/version.js`.
3. Add `docs/release-notes/<versionName>.md`. The manifest and the GitHub
   Release both use it.
4. Run `npm run web:build`. It fails if `pwa/version.js` drifted.

Gradle reads `version.json` directly, so the APK version can never disagree with
the web build.

---

## 3. Signing

### Android APK

The app id is `com.usm007.studysynth` and the current signing identity is the
**legacy debug identity** inherited from the first published APK:

```
certificate SHA-256: 62377a571b33c348a2ed61f08e538108b0b76338dcdaa7e029e0e3172a17a374
keystore (local):    %USERPROFILE%\.android\debug.keystore
alias:               androiddebugkey
store/key password:  android
```

This identity is preserved on purpose: changing it would make 2.1.0 impossible to
install over 1.2, and users would have to uninstall and lose local data. It is a
compatibility decision, not a security boundary. A future release may migrate to
a dedicated release key, but only with an explicit, documented migration path.

Local release builds read signing details from `keystore.properties` at the
repository root (git-ignored). See `android/keystore.properties.example`.

A release build without signing configured fails on purpose:

```
Release signing is not configured. Create keystore.properties ...
```

### Update artifacts

One RSA-3072 key signs the manifest, the web bundle, and the content package.

- Public key: `pwa/updates/keys.js` and `capacitor.config.json`.
- Private key: `~/.studysynth/update-signing-key.pem` locally, `OTA_SIGNING_KEY`
  in CI.
- Generate a new pair with `node scripts/updates/keygen.js` (do not do this
  casually; it requires a new APK).

---

## 4. Local release

```bash
# 1. Build the web payload
npm run web:build

# 2. Sync it into the Android project
npx cap sync android

# 3. Build the signed APK
cd android
./gradlew assembleRelease --no-daemon
cd ..

# 4. Check the APK identity
node scripts/updates/check-apk.js \
  android/app/build/outputs/apk/release/app-release.apk \
  --expect-cert 62377a571b33c348a2ed61f08e538108b0b76338dcdaa7e029e0e3172a17a374

# 5. Build and sign the web bundle and content package
npm run release:web
npm run release:content

# 6. Build the manifest (stages artifacts into updates-site/)
npm run updates:manifest -- --apk android/app/build/outputs/apk/release/app-release.apk

# 7. Verify the published set end to end
npm run release:verify
```

Windows note: the Gradle daemon fails in this environment with
`Got socket exception ... Permission denied: getsockopt`. Always use
`--no-daemon`.

`release:verify` must print `All checks passed.` before anything is published.
It verifies the manifest signature, every checksum, every artifact signature,
and the APK package identity and certificate.

---

## 5. Automated release (GitHub Actions)

Three workflows:

| Workflow | Trigger | Purpose |
| --- | --- | --- |
| `test.yml` | Pull requests, pushes, manual | Unit/contract tests, web build, DOM id check, manifest check, headless browser checks |
| `build-ota.yml` | Manual, reusable | Rebuild web + content for an existing release, republish the update site |
| `release-android.yml` | Tag `v*`, manual | Signed APK, OTA bundle, content package, GitHub Release, Pages deploy |

### Required repository secrets

Set these under **Settings → Secrets and variables → Actions → New repository
secret**:

| Secret | Value |
| --- | --- |
| `OTA_SIGNING_KEY` | Base64 PKCS#8 DER of the update private key, or the full PEM. Generate with `base64 -w0 ~/.studysynth/update-signing-key.pem` on Linux, or `[Convert]::ToBase64String([IO.File]::ReadAllBytes("$HOME\.studysynth\update-signing-key.pem"))` in PowerShell. |
| `ANDROID_KEYSTORE_BASE64` | Base64 of the signing keystore. |
| `ANDROID_KEYSTORE_PASSWORD` | Keystore password. |
| `ANDROID_KEY_ALIAS` | Key alias. |
| `ANDROID_KEY_PASSWORD` | Key password. |

Optional repository **variable**:

| Variable | Value |
| --- | --- |
| `ANDROID_CERT_SHA256` | Expected signing certificate digest. Defaults to the 2.1.0 identity above if unset. |

Do not commit any of these values. `.gitignore` excludes `*.keystore`, `*.jks`,
`*.pem`, and `keystore.properties`.

### GitHub Pages

1. **Settings → Pages → Source: GitHub Actions.**
2. The manifest URL is
   `https://usm007.github.io/studysynth-android/updates/stable/manifest.json`.
3. Both publishing workflows deploy `updates-site/` as a Pages artifact. The
   manifest is written last and staged with its artifacts, so a deploy is
   all-or-nothing from the reader's point of view.

### Cutting a release

```bash
git tag v2.1.0
git push origin v2.1.0
```

The workflow:

1. Asserts the tag matches `version.json`.
2. Builds the web payload and syncs Capacitor.
3. Builds the signed APK with JDK 21.
4. Checks package id, version code/name, certificate digest, and APK Signature
   Scheme v2.
5. Builds and signs the OTA bundle and content package.
6. Builds the manifest with all three artifacts.
7. Runs `verify-release`.
8. Publishes the APK, its SHA-256 file, and the manifest to the GitHub Release.
9. Deploys the update site to Pages.

A web-only update (no native changes) can use **Publish OTA update** after
editing `version.json`'s `contentVersion` (for a question-bank change) or
`versionName` (for an interface change). It downloads the APK attached to the
existing release and carries it into the new manifest unchanged.

---

## 6. Verification checklist

Before announcing a release:

- [ ] `npm test --prefix pwa` passes.
- [ ] `node scripts/check-ids.js` reports no missing ids.
- [ ] `node scripts/verify-ui.js` prints `All UI checks passed.`
- [ ] `node scripts/updates/check-manifest.js` prints `Manifest OK`.
- [ ] `node scripts/updates/check-apk.js ...` prints `APK OK`.
- [ ] `npm run release:verify` prints `All checks passed.`
- [ ] The APK installs over the previous version without uninstalling.
- [ ] The app opens offline, and the Library shows all bundled sets.
- [ ] An existing bookmark, attempt, and revision card survive the update.
- [ ] The Update Centre reports the installed version and the content version.

---

## 7. Rollback

- **Web bundle:** the LiveUpdate plugin rolls back automatically if a new bundle
  does not become ready. A bad bundle can also be blocked in the Update Centre.
- **Content:** the previous package is retained. Roll back from the Update
  Centre; the active pointer swaps back atomically.
- **APK:** Android does not allow installing an older version code over a newer
  one. To go back, publish a new APK with a higher `versionCode` containing the
  previous behavior.

Never delete the previous content package or bundle from the update site while
any device might still need to roll back to it.

---

## 8. Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `pwa/version.js is out of date` | Version bumped in one file only | `node scripts/version.js --sync` |
| `Release signing is not configured` | No `keystore.properties` or env vars | Create it from the example |
| `Got socket exception ... getsockopt` | Gradle daemon on this Windows box | Add `--no-daemon` |
| `APK check failed ... certificate` | Wrong keystore | Use the identity in section 3 |
| Manifest verification fails after deploy | Artifacts not staged, or manifest edited by hand | Re-run the release workflow |
| Update Centre shows "Could not check" | Pages not deployed or offline | Check Pages status and the manifest URL |
