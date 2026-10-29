# Tend

A gentle reminder app for Windows and Android. It's built for brains that find
starting hard, forget what they can't see, and run on small, immediate rewards.
It's designed with AuDHD in mind: see [docs/AUDHD_RESEARCH.md](docs/AUDHD_RESEARCH.md).

- **Reminders for today or any future day.** They can have an optional time and
  can repeat daily, on weekdays, weekly or monthly. You can type the time into the
  name ("call the dentist tomorrow at 10") and Tend picks it up.
- **Tiny steps with partial rewards.** Each step pays seeds the moment you tick
  it, and the card always shows what finishing adds. Reminders without steps have
  an "I did a bit" button.
- **Seeds, levels and a growing tree.** Levels go through ten stages, from a seed
  to a grove. Nothing resets and nothing wilts.
- **Optional surprise golden seeds** for finishing things.
- **Natural reward sounds:** woodblock for steps, a marimba run with wind chimes
  for finishing, a bird for bonuses, and a rolled chord for levelling up. They're
  synthesised live, so there are no audio files.
- **Animated throughout,** with a reduce-motion setting (on, off, or follow the
  device) plus volume and theme settings.
- **A tiny on-device model suggests rewards and steps.** It uses bge-micro, a
  17M-parameter language model: a 35 MB download, fetched automatically after
  onboarding.
  - Each time you type a task, it loads (memory-mapped), compares the task with
    ~215 built-in tasks and your own past reminders, and unloads. That takes
    about 25 ms on a desktop. The arm64 build takes 150–190 ms when run under
    ARM translation on an x86 emulator, so a real phone should be faster.
  - It suggests a seed value. You can nudge it up or down, and your own values
    count 11 times as much as the built-in ones, so it learns your scale.
  - It offers ready-made tiny steps, either from your own earlier breakdowns or
    from a library of 170 ADHD-friendly breakdowns, and you add them with one tap.
  - Exact repeats reuse your last value. If the model isn't downloaded or is
    switched off, a keyword estimate is used instead.
- **Android:**
  - A quiet "still to do" notification that comes back if you swipe it away.
  - Exact alarms with *Done* and *Snooze 15 min* buttons.
  - A "before you dive in" screen when you unlock your phone while things are
    waiting. It has a cooldown, quiet hours, and a one-tap way to pause it.
- **Desktop:**
  - Lives in the tray and fires due reminders.
  - Optional gentle nudge every few hours while things are waiting.
  - Can start with Windows.
- **Updates itself.** It checks this repository's releases at launch and every
  six hours, downloads a new version in the background, then asks before
  installing. Windows restarts into the new version; on Android the system
  installer asks you to confirm.
- **Sync over your Wi-Fi.** Pair by scanning the QR code shown on the computer,
  or by typing its 6-digit code.
  Edits merge last-writer-wins, and the seed history is append-only, so totals
  agree on both devices. Nothing goes to any cloud.

## Battery

- Nothing on the phone polls.
- Alarms use `AlarmManager`.
- The unlock screen is a sleeping foreground service. It holds a single
  `USER_PRESENT` receiver, with no threads, timers or wakelocks, and stops as soon
  as nothing is waiting.
- The model runs for about 25 ms only while the editor is asking for a
  suggestion, and then it's dropped from memory.
- The sound engine suspends after 4 seconds of silence.
- The phone syncs when you open or return to the app and after each change. It
  doesn't sync in the background.

## Building

Requirements: Node 20+, Rust stable, and for Android: SDK, NDK 27 and JDK 17+.

```sh
npm install
npm run tauri dev                    # desktop, hot reload
npm run dev                          # UI only, in a browser, with a mock backend
npm run tauri build                  # Windows installer (src-tauri/target/release/bundle)

# Android (NDK_HOME must point at the versioned NDK folder)
export NDK_HOME="$ANDROID_HOME/ndk/27.2.12479018"
npm run tauri android build -- --apk --target aarch64
```

Local release APKs are signed with the key named in
`src-tauri/gen/android/keystore.properties` (not committed). Without that file
they fall back to the debug key, which is fine for testing but cannot update an
installed official release.

## Releasing

1. Bump the version in `package.json`, `src-tauri/tauri.conf.json` and
   `src-tauri/Cargo.toml`.
2. Commit, then tag and push: `git tag v0.2.0 && git push origin v0.2.0`.
3. The **Release** workflow builds the Windows installer (with a signed
   `latest.json` for the updater) and the Android APK, and attaches them to the
   GitHub release. Installed copies pick the release up on their next check.

The workflow needs these repository secrets:

| Secret | What |
| --- | --- |
| `TAURI_SIGNING_PRIVATE_KEY` | Updater signing key (its public half is in `tauri.conf.json`) |
| `ANDROID_KEYSTORE_BASE64` | The release keystore, base64-encoded |
| `ANDROID_KEYSTORE_PASSWORD` | Its password |

Keep the private keys safe: if either is lost, installed copies can no longer
update and need a manual reinstall.

## First run on Android

1. Allow notifications when asked.
2. In **Settings → Phone permissions**, allow on-time alarms and showing over
   other apps (this is what lets the unlock screen appear). Allowing background
   running is also recommended on aggressive OEM skins.
3. In **Settings → Sync**, tap *Scan QR code* and point the camera at the code
   in the desktop app's Settings. Typing the address and code works too. If Windows asks about the firewall, allow private networks.

## Layout

| Path | What |
| --- | --- |
| `src/` | React UI (views, components, sound engine, store) |
| `src-tauri/src/` | Rust backend: SQLite (`db.rs`), rewards maths (`rewards.rs`, `actions.rs`), LAN sync (`sync.rs`), tray/scheduler (`desktop.rs`), suggestions (`suggest.rs`) |
| `crates/tend-llm/` | Tiny on-device model (candle + bge-micro embeddings): reward and step suggestions, heuristic fallback; the older SmolLM2-360M path is behind the `large` feature |
| `plugins/tauri-plugin-tend-native/` | Android plugin: alarms, persistent notification, unlock service, permissions |
| `docs/AUDHD_RESEARCH.md` | Research notes and the design principles they led to |

## Licence

Copyright (c) 2026 Dani Fullerton. All rights reserved. The source is public to
read, but it is not open source: see [LICENSE](LICENSE).
