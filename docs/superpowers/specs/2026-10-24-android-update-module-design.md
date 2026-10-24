# In-app update module — Android build

Date: 2026-10-24
Status: design, awaiting approval

## Intent

People who installed the APK should be able to move to a newer release from
inside the app: the app notices the newer version, shows what changed, downloads
the APK with visible progress, checks it, and opens Android's installer.

The web-installed app is out of scope. Only the Android package matters here.

## Why

Today the Android build ships its assets inside the APK and ignores the web
update path entirely. Users have no way to learn that a newer version exists
short of revisiting the releases page, and no in-app path to install it.

A second, quieter reason: releases are currently debug-signed. Android only
installs an update signed by the same key, so without a permanent key the
update path can die at any time. This release establishes that key.

## Goals

- Detect a newer release reliably without depending on the GitHub API.
- Never nag: one compact card, only when an update exists; silent when offline.
- Download, verify and hand the APK to Android's installer from inside the app.
- Show the installed version and a manual "Check for updates" action.
- Make the signing key permanent so future releases stay installable.

## Non-goals

- Updating the web/PWA install.
- Silent or background installation (Android does not allow it).
- Play Store distribution, beta channels, staged rollout, or delta updates.
- Rollback to an older version.
- Remote web-bundle hot updates (would break the all-assets-in-APK design).

## Anti-goals

Anything that makes the app worse even if it works:

- blocking startup, or a failed check delaying the Library;
- repeated prompts, badges or toasts about updates;
- downloading without an explicit tap;
- installing bytes that were not checksum- and signature-verified;
- interrupting an exam or changing the timer;
- sending any telemetry or device identifier.

## Constraints

- Android only. Capacitor 8, `BridgeActivity`, Java, minSdk 24, targetSdk 36.
- Android always shows its own confirmation screen; the app cannot install
  silently. First install also requires the "install unknown apps" grant.
- Signature continuity: every release signed with the same permanent key;
  `versionCode` strictly increasing. A key change requires uninstall/reinstall.
- The app must keep opening and working with no network. The update module may
  never be on the startup critical path.
- Same application id and signature means app data survives an update.
- Public repo `usm007/studysynth-lite`; releases are the distribution channel.
- Verification happens on a physical device connected over USB; no emulator.

## Approaches considered

1. **Notify and hand off** — show the version and open the release page in the
   browser. Cheapest, but leaves download and sideloading to the user. Rejected:
   the user asked for the installer to open from inside the app.
2. **In-app download and install** — chosen. Notice, download with progress,
   verify, open Android's installer.
3. **Remote web bundle / live update** — replaces the UI outside the APK.
   Rejected: contradicts the fully offline package, adds a hosting dependency
   and a trust surface far larger than this problem.

For discovery, the GitHub REST API was considered and dropped: it is
rate-limited per IP, can change shape, and returns more than is needed. Release
assets served from the stable `releases/latest/download/...` URLs answer the
same question with one small JSON file.

## Release contract

Every release publishes two assets under the same names:

- `update.json`
- `StudySynth.apk`

Stable URLs (constants in the app):

- `https://github.com/usm007/studysynth-lite/releases/latest/download/update.json`
- `https://github.com/usm007/studysynth-lite/releases/latest/download/StudySynth.apk`

`update.json`:

```json
{
  "schema": 1,
  "versionCode": 4,
  "versionName": "1.3",
  "minSdk": 24,
  "apk": "StudySynth.apk",
  "sha256": "<hex>",
  "size": 24716443,
  "notes": "Short, learner-facing summary of what changed.",
  "publishedAt": "2026-10-24T12:00:00Z"
}
```

Rules:

- `versionCode` is the only value compared. `versionName` is display only.
- `sha256` and `size` describe exactly the published APK.
- `notes` is plain text, short (about two lines), no markup.
- A release must contain both assets or it is not offered.

## How it works

### Version knowledge

A small native bridge exposes the installed `versionCode` and `versionName` to
the page at startup, alongside the existing back-handler bridge. The page never
guesses its own version from the build files.

### Check timing

- Automatic: native only, roughly four seconds after launch, at most once per
  24 hours, using a timestamp in local storage. Skipped entirely when offline.
- The timestamp is only written after a successful check (update or up to date),
  so a failed check retries on the next launch.
- Manual: the About panel's "Check for updates" always runs a fresh check and
  always reports an outcome (checking, up to date, update available, offline,
  failed).
- Failures during automatic checks are silent.

### Presentation

- **Library**: one compact "Update available" card above the subject grid, only
  when a newer version is known. Shows the new version, the notes, the download
  size, and one primary action. Dismissible for the session; it returns on the
  next launch while the update is still outstanding.
- The card becomes a progress state while downloading (percentage, cancel), then
  "Opening installer…", an inline error with retry, or "Installer opened".
- **About**: current version (`1.3 (4)`) plus "Check for updates" with inline
  status text. No pop-ups, no auto-opening modals, no badges elsewhere.
- Hidden during an exam (test setup, running test, scorecard). Checking is still
  allowed; installing is not, and the About panel says why.
- A download already in progress when an exam starts keeps running but does not
  open the installer. Once the exam ends, the card returns in a "Ready to
  install" state. Nothing is discarded and the timed test is never interrupted.
- Web build: no update UI at all.
- Native owns the download state. If the page reloads mid-download, it asks the
  bridge for the current state on load and re-renders progress instead of
  losing it.

### Download and install

All network and filesystem work happens natively; the page only requests and
renders states. This avoids WebView CORS, memory-heavy blob handling, and
exposes no download path to page script.

1. Validate the manifest URL and the APK URL against the trusted prefix. Follow
   redirects only to GitHub-owned hosts (`github.com`, `*.githubusercontent.com`);
   anything else aborts.
2. Confirm free space, clear stale files, download to the app cache as
   `<name>.part`, reporting progress at a sane cadence.
3. On completion verify `size` and `sha256`. Mismatch: delete, report an error,
   never install.
4. Verify the APK's signing certificate matches the installed app's certificate.
   Mismatch: delete, report an error. (This also blocks the old debug-signed
   build from being replaced by the release-signed one — expected; that
   transition needs one uninstall.)
5. Check the install-packages permission. On Android 8+ if it is not granted,
   explain and open this app's "install unknown apps" settings; retry when the
   user returns. On Android 7 the per-app grant does not exist, so read the
   global "unknown sources" setting first and, when it is off, explain and open
   the Security settings instead of dropping the user into a dead-end installer.
6. Launch the installer with a FileProvider content URI and read permission.
   Android's confirmation screen is the last step.
7. Keep the verified APK until the install is confirmed, so cancelling Android's
   prompt does not force another download; clear it on the next launch or once
   the installed version is seen to be current. Re-check the installed version
   when the app resumes and when the page reloads, and clear the card as soon as
   the update is actually installed.

Cancelling a download deletes the partial file. A new attempt always starts
from zero.

### Failure handling

| Situation | Behaviour |
| --- | --- |
| Offline / timeout on auto check | Nothing shown |
| Offline / timeout on manual check | "Couldn't check. You're offline." |
| Manifest unreadable or fails schema | Manual: "Couldn't check." Auto: silent |
| Version equal or older | "You're up to date." |
| Download interrupted / cancelled | Partial file removed, retry offered |
| Size or checksum mismatch | Error, file removed, retry offered |
| Signature mismatch | Error, file removed, no install |
| Manifest `minSdk` above this device | Card explains the newer Android requirement; no install offered |
| Install permission missing | Explanation + open settings, retry |
| No installer activity | Error with a short explanation |
| Not enough storage | Error before download starts |

## Signing and release tooling

- Generate one permanent release keystore (RSA, long validity). Store it outside
  the repository, back it up, and never commit it or its passwords.
- Gradle reads signing details from a local, gitignored properties file (or
  environment variables). Release builds use it; the debug key stays for
  development only.
- Add a release script that: refuses to build if `versionCode` does not exceed
  the last published value, builds the release APK, verifies its signature and
  packaged version, computes `sha256` and `size`, writes `update.json`, and
  prints the upload checklist. It must refuse a debug-signed artifact.
- "Last published" comes from the previous `output/release/update.json`, so the
  step works offline. When online, the script additionally compares against the
  published manifest and warns if the repository is ahead.
- This release: `versionCode 4`, `versionName 1.3`, published with both assets.
  The currently installed debug-signed copy must be uninstalled once (on-device
  data is lost) before installing the new signed build.

## Privacy and network

Exactly two kinds of outbound request, both to `github.com`: the manifest check
and the APK download. Both are explicit or scheduled as described above. No
headers beyond defaults, no identifiers, no analytics, no third-party services.
A device that never opens the app online simply never checks.

## Accessibility and layout

The card follows existing patterns: real button elements, `aria-live` status for
progress and errors, keyboard reachable, no nested scroll containers, holds at
320×640 and 844×390, and respects reduced-motion preferences. Icons come from
the bundled Material 3 symbol font; `download` is added to the icon list and the
bundled subset is rebuilt.

## Testing and verification

- Page logic (covered by the existing Node test suite, with the native bridge
  stubbed): version gating, 24-hour window, native-only guard, exam suppression,
  dismissal, and each card/About state.
- Native unit tests: manifest parsing and validation, URL allow-list, version
  comparison, checksum helpers.
- Release script tests: rejects equal/lower version codes, rejects debug-signed
  input, writes a valid `update.json` with real size and checksum.
- Existing suites must keep passing (page tests and the Python pipeline tests).
- End-to-end runs on a **physical device over USB**, never an emulator:
  1. Uninstall the debug-signed build, install the release-signed `1.3 (4)`.
  2. Publish a newer build (`1.4`, code 5) to the release page.
  3. On the device, let the app find it, download it, and install it through
     Android's prompt.
  4. Confirm the installed version changed, saved study data survived, and the
     update card cleared.
  5. Use `adb logcat` for the native download/verify states and
     `adb shell dumpsys package` to confirm the installed version code.
- ADB on this machine is unreliable (connections drop), so verification may need
  more than one attempt; that is an environment problem, not a release blocker
  for the code itself, but the result is reported exactly as observed.
- If no device is attached when the work is finished, the end-to-end step stays
  explicitly unverified.

## Rollout

1. Generate and back up the permanent key; wire release signing; keep secrets
   out of git.
2. Build `1.3 (4)`, publish the release with `StudySynth.apk` and `update.json`.
3. Uninstall the debug-signed app once, install `1.3`, confirm the app opens and
   the About panel shows the version.
4. Next release: bump the version, run the release script, upload both assets.
   Installed copies then show the update card.

## Left to the builder

- Exact card styling, wording, and progress cadence within the existing design
  system.
- Keystore file name and `keystore.properties` shape; both stay outside the repo,
  backed up, and gitignored.
- Test doubles for the bridge and the precise extraction of page-side gating.

## Calls made during review

- The 24-hour timestamp lives in local storage (simple, survives updates).
- Redirects are allowed only on GitHub-owned hosts.
- The downloaded APK is kept until the install is confirmed, not deleted when
  the installer opens.
- A download that finishes during an exam waits for the exam to end.
- Android 7 checks the global unknown-sources setting before opening the
  installer.
- The release script reads the last published version from the previous local
  `update.json`, with an online cross-check when available.
