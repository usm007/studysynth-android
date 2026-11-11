# Update system

StudySynth can update three independent things:

1. **The APK** — native code, permissions, and the bundled web payload.
2. **The web bundle (OTA)** — the interface and app logic, delivered by the
   Capacitor LiveUpdate plugin.
3. **The content package** — question banks and explanations, delivered as
   signed JSON.

All three are described by one signed manifest. The app only trusts that
manifest and the artifacts it names.

---

## 1. Trust model

- One RSA-3072 key pair signs everything. Signatures use **SHA-256 with
  PKCS#1 v1.5** (`SHA256withRSA`), which is what the native plugin verifies.
- The **public key** is embedded in the app twice: `pwa/updates/keys.js` (web
  verification) and `capacitor.config.json` (native LiveUpdate verification).
  Both must match.
- The **private key** never enters the repository. Local builds read it from
  `~/.studysynth/update-signing-key.pem` or `OTA_SIGNING_KEY_FILE`. CI reads it
  from the `OTA_SIGNING_KEY` secret (base64 PKCS#8 DER or PEM).
- Rotating the key requires shipping a new APK, because the public key is baked
  into the installed app.

A compromised signing key means an attacker can produce a valid update. Treat it
like a release credential: no shared machines, no repository secrets in plain
text, rotate deliberately with a migration release.

---

## 2. The manifest

Published at:

```
https://usm007.github.io/studysynth-android/updates/stable/manifest.json
```

Shape:

```json
{
  "schemaVersion": 1,
  "packageId": "com.usm007.studysynth",
  "channel": "stable",
  "generatedAt": "2026-11-11T12:21:16.453Z",
  "release": {
    "versionName": "2.1.0",
    "versionCode": 4,
    "minSupportedVersionCode": 3,
    "mandatory": false,
    "releaseNotes": "# StudySynth 2.1.0\n..."
  },
  "apk": {
    "url": "https://.../stable/apk/studysynth-2.1.0.apk",
    "sha256": "f759...1447",
    "size": 23722300,
    "certSha256": "62377a57...a374"
  },
  "web": {
    "bundleId": "2.1.0-4-116e1ffcff04",
    "runtimeVersion": "capacitor-8",
    "url": "https://.../stable/web/2.1.0-4-116e1ffcff04.zip",
    "sha256": "116e...6e7a",
    "size": 18928187,
    "signature": "Q4mV...f9B",
    "minAppVersionCode": 4
  },
  "content": {
    "version": "2026.11.1",
    "url": "https://.../stable/content/content-2026.11.1.json",
    "sha256": "76af...424c",
    "size": 11607741,
    "signature": "MMOq...WZ3",
    "minAppVersionCode": 4
  },
  "signature": "F4o8...jRj"
}
```

Rules enforced by `pwa/updates/UpdateManifest.js`:

- `schemaVersion` must be `1`.
- `packageId` and `channel` must match the installed app.
- URLs must be HTTPS.
- Checksums must be 64 hex characters; signatures must be 512-character base64.
- `apk`, `web`, and `content` are individually optional, but at least one
  artifact must be present.
- `minAppVersionCode` prevents an app from applying an artifact that needs a
  newer APK than it has.

The top-level `signature` is computed over the canonical JSON of the manifest
with the `signature` field removed. Canonicalization sorts object keys and uses
no insignificant whitespace, so both the signer and the verifier agree on the
exact bytes.

The manifest is written **last** during a release. A reader can never see a
manifest that points at an artifact that has not been uploaded yet.

---

## 3. When the app checks

`UpdateCoordinator` decides. The rules:

| Situation | Behavior |
| --- | --- |
| Fresh install | Check is due immediately |
| Last check < 12 hours ago | Automatic check skipped |
| Automatic check while a timed exam is unsubmitted | Skipped |
| Manual check while a timed exam is unsubmitted | Manifest may be fetched; nothing is downloaded or applied |
| Metered connection with Wi-Fi-only on | Download deferred |
| `saveData` connection | Download never starts |
| Network error | Last known-good state is kept; error is shown in Update Centre |
| Corrupt stored state | Falls back to defaults |

The coordinator emits events (`check-ok`, `check-failed`, `web-staged`,
`content-applied`, `apk-downloaded`, `apply-failed`, `deferred`) that the Update
Centre renders. Startup never waits for an update check.

---

## 4. Web bundle (OTA)

Built from `www/` into a ZIP and signed. The bundle id is
`<versionName>-<versionCode>-<sha256 prefix>`, so an identical build produces an
identical id.

Flow:

1. Coordinator selects the `web` block when `minAppVersionCode` is satisfied and
   the bundle id differs from the installed one.
2. `LiveUpdateService.download()` passes the URL, checksum, and signature to the
   native plugin. The plugin verifies `SHA256withRSA` over the ZIP bytes before
   extracting anything.
3. The bundle is staged as the **next** bundle. It does not replace the running
   one.
4. The app calls `ready()` after startup succeeds. The plugin marks the bundle
   healthy. If the app fails to become ready within `readyTimeout` (10 s), the
   plugin rolls back automatically.
5. `autoDeleteBundles` and `autoBlockRolledBackBundles` keep the device from
   accumulating broken bundles.

Activation happens on the next launch, never mid-session, and never while a
timed exam is running. The Update Centre tells the user an interface update is
staged.

---

## 5. APK updates

The APK is the only way to change native behavior. Android does not allow silent
installation by ordinary apps, and StudySynth does not pretend otherwise.

Flow:

1. Coordinator selects the `apk` block when its version code is newer than the
   installed one.
2. `ApkUpdate.download()` downloads to the app cache with HTTP `Range` resume and
   reports progress.
3. Before installing, the native plugin verifies:
   - SHA-256 of the downloaded file,
   - `PackageManager.getPackageArchiveInfo` package id and version code,
   - the signing certificate digest against `certSha256` from the manifest.
4. If `canRequestPackageInstalls()` is false, the app explains why and opens the
   system "Install unknown apps" screen for this app.
5. Installation is handed to Android through a FileProvider and `ACTION_VIEW`.
   The system installer is always shown.
6. A failed or cancelled download leaves the installed app untouched.

The manifest's `certSha256` is the identity of the release key. A mismatch means
the APK would not install over the current app, so it is rejected before the
installer opens.

---

## 6. Content packages

A content package is one JSON document:

```json
{
  "schemaVersion": 1,
  "contentVersion": "2026.11.1",
  "mode": "full",
  "index": [ { "id": "ugc_net_unit_1", "title": "...", "questionCount": 543 } ],
  "modules": { "ugc_net_unit_1": { "id": "ugc_net_unit_1", "questions": [] } }
}
```

`mode` is `full` or `delta`. A delta package is still **self-contained**: it
contains every module that should exist after activation. A module that is
omitted is not "kept from an older package"; it is absent, which prevents silent
fallback to stale content.

Validation before activation:

- schema version and content version match the manifest,
- every index entry has a body,
- every module id agrees with its key,
- every answer key matches one of the module's options,
- no duplicate question ids or index ids,
- no empty index.

Activation:

1. Verify the signature over the raw JSON bytes and the SHA-256 checksum.
2. Validate the package.
3. Write modules into `contentModules`.
4. Swap the active pointer in `contentMeta` in one transaction, keeping the
   previous pointer.

Rollback restores the previous pointer. Bookmarks, attempts, and revision
progress live in separate stores and are never touched by activation or
rollback.

The Update Centre shows the active content version, the previous version, and a
rollback action. Rolling back with nothing to restore fails loudly instead of
pretending to succeed.

---

## 7. Failure behavior

| Failure | User sees | System state |
| --- | --- | --- |
| Manifest fetch fails | "Could not check for updates" with retry | Last good check retained |
| Manifest signature invalid | Update rejected; details in Update Centre | Nothing applied |
| Web checksum mismatch | Download rejected | Current bundle keeps running |
| Web bundle never becomes ready | Automatic rollback on next launch | Previous bundle restored |
| APK checksum/identity mismatch | Install blocked with reason | Downloaded file discarded |
| Content validation failure | Update rejected before activation | Active package unchanged |
| Content activation interrupted | Pointer swap does not happen | Active package unchanged |

No failure path clears user data or leaves a half-applied artifact.

---

## 8. Operating the update site

The update site is a static GitHub Pages deployment of `updates-site/`:

```
updates-site/
├── index.html
├── .nojekyll
└── updates/
    └── stable/
        ├── manifest.json
        ├── manifest.json.sig
        ├── apk/studysynth-2.1.0.apk
        ├── web/2.1.0-4-<hash>.zip
        └── content/content-2026.11.1.json
```

Artifacts are staged next to the manifest by `scripts/updates/build-manifest.js`.
`scripts/updates/verify-release.js` checks the published set the same way the
app does: schema, signature, every checksum, every artifact signature, and the
APK identity.

To publish, use the workflows in `.github/workflows/`. Do not hand-edit the
manifest: it must be signed, and a hand edit will fail verification on every
installed app.
