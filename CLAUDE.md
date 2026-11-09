# Tend

A gentle reminder app for brains that find starting hard (AuDHD-friendly). Tauri 2 app for
Windows and Android.

- `src/` — React 19 + TypeScript frontend (`motion/react` for animation, no chart library).
- `src-tauri/` — Rust backend: SQLite data, sync between devices, rewards, desktop tray/windows.
- `crates/tend-llm/` — the tiny on-device model (seed, step and emoji suggestions).
- `plugins/tauri-plugin-tend-native/` — the Android side in Kotlin: notifications, alarms, the
  unlock screen, widget, Health Connect and the phone's step counter.
- Browser preview: `npm run dev` runs on a mock backend (`src/lib/mock.ts`). Add `?moods` for
  sample mood history, `?welcome` for onboarding, `?whatsnew` for the release note.

Tone matters: calm, kind, never guilt-tripping (no streaks, no red, low moods aren't "bad").

## Checks before a release

```sh
npx tsc --noEmit -p .                      # frontend types
(cd src-tauri && cargo test)               # backend
(cd crates/tend-llm && cargo test)         # on-device model
# Android Kotlin (needs the Android SDK):
(cd src-tauri/gen/android && ./gradlew :tauri-plugin-tend-native:compileDebugKotlin --offline)
```

## Releases: stable and unstable

Releases are built by GitHub Actions (`.github/workflows/release.yml`) when a `v*` tag is pushed.
Nothing is built locally. Installed apps update themselves from GitHub releases, and each person
chooses a channel in **Settings → Updates → Update channel**:

- **Stable** follows GitHub's "latest" release, which never includes pre-releases.
- **Unstable** follows the newest release of any kind, including pre-releases. When a stable
  release is newer, unstable apps get that too.

| | Branch | Version / tag | GitHub release |
|---|---|---|---|
| Stable | `main` | `0.6.0` / `v0.6.0` | normal release |
| Unstable | `unstable` | `0.6.0-1`, `0.6.0-2`… / `v0.6.0-1` | pre-release (automatic for any tag with a `-`) |

The part after the dash **must be a plain number** (`0.6.0-1`, not `0.6.0-beta.1`): Windows MSI
installers can't hold anything else, and the build fails. An unstable version sorts *before* its
stable version (`0.6.0-2` < `0.6.0`), so unstable `0.6.0-N` builds lead up to stable `0.6.0`.

### Version bump (both kinds)

Set the same version in all of these (a "Release X" commit touches exactly these files):

- `package.json` → `"version"`, then `npm install --package-lock-only` to update `package-lock.json`
- `src-tauri/tauri.conf.json` → `"version"`
- `src-tauri/Cargo.toml` → `version`, then `cargo check` in `src-tauri` to update `Cargo.lock`

Add a note for the version to `CHANGES` at the top of `src/components/WhatsNew.tsx` (newest first,
short, friendly, plain words). Notes show once after updating; a stable note is keyed by its stable
version.

### Unstable release

```sh
git checkout unstable
git merge main                # or work on unstable directly / merge your feature branch
# bump to the next unstable number, e.g. 0.6.0-1 (or 0.6.0-2 after that)
git commit -am "Unstable 0.6.0-1"
git tag v0.6.0-1
git push origin unstable
git push origin v0.6.0-1
```

### Stable release

```sh
git checkout main
git merge unstable            # bring in what was tried on unstable (if anything)
# bump to the plain version, e.g. 0.6.0
git commit -am "Release 0.6.0"
git tag v0.6.0
git push origin main
git push origin v0.6.0
git checkout unstable && git merge main && git push origin unstable   # keep unstable level with main
```

### After pushing a tag

- Watch the build: `gh run watch` (or the Actions tab). On Windows there's a progress-bar watcher:
  `pwsh -File scripts/watch-release.ps1 v0.6.0`.
- The Windows job creates the release and its signed `latest.json`; the Android job then attaches
  the APK. Apps only offer an update once the files they need are attached.
- Rebuild just the APK for an existing release: run the workflow by hand ("Run workflow") with the
  tag and "APK only" ticked.
- Never re-use or move a tag that's been pushed; bump to the next number instead.
- Signing keys live in the repo's Actions secrets. Every release must be signed with the same keys,
  or installed apps can't update.
