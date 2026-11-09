import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { useStore } from "../lib/store";
import { api, isAndroid } from "../lib/api";
import { native } from "../lib/native";
import { NUDGE_PRESETS, PRESET_TEXT } from "../lib/settings";
import { markJustOnboarded, seenOnInstall } from "../lib/features";
import { sounds } from "../lib/sound";
import { appVersion } from "../lib/updater";
import { Tree } from "../components/Tree";
import { Seed } from "../components/Icons";

type Preset = keyof typeof NUDGE_PRESETS;

/** Mobile data, where the browser can tell. Desktop and unknown count as Wi-Fi. */
const onMobileData = () => (navigator as Navigator & { connection?: { type?: string } }).connection?.type === "cellular";

export function Welcome() {
  const { settings, updateSettings, toast } = useStore();
  const [page, setPage] = useState(0);
  const [preset, setPreset] = useState<Preset>("gentle");
  const [helper, setHelper] = useState(false);
  const [mb, setMb] = useState(35);
  useEffect(
    () =>
      void api
        .modelStatus()
        .then((m) => m.size && setMb(Math.round(m.size / 1e6)))
        .catch(() => null),
    [],
  );

  async function finish(skipped: boolean) {
    sounds.finish();
    // Only notifications are asked for up front. Anything else (on-time alarms, showing over other apps)
    // is offered in Settings when a feature that needs it is switched on.
    if (isAndroid) await native.request("notifications").catch(() => null);
    const version = await appVersion().catch(() => null);
    const consent = skipped ? null : helper;
    const patch = {
      ...NUDGE_PRESETS[skipped ? "gentle" : preset],
      onboarded: true,
      // A new install has nothing to catch up on, so the "what changed" note starts from here.
      lastSeenVersion: version,
      modelConsent: consent,
      useModel: consent !== false,
    };
    // What's on by default counts as seen. Anything needing a permission is offered on a later visit.
    markJustOnboarded();
    updateSettings({ ...patch, seenFeatures: seenOnInstall({ ...settings, ...patch }) });
    if (consent) {
      if (onMobileData()) toast("You're on mobile data, so the helper waits. Download it from Settings when you're on Wi-Fi.");
      else
        void api
          .modelStatus()
          .then((m) => (m.present ? null : api.downloadModel()))
          .catch(() => null);
    }
  }

  return (
    <motion.div className="welcome" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.4 } }}>
      <AnimatePresence mode="wait">
        {page === 0 ? (
          <motion.div
            key="hello"
            className="welcome-page"
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -30 }}
            transition={{ duration: 0.25 }}
          >
            <Tree level={5} progress={0.5} size={200} />
            <h1>Tend</h1>
            <p>A gentle place for the things you mean to do. Break them into tiny steps: each one gives seeds that grow your tree.</p>
            <div className="welcome-demo">
              <span>
                <Seed size={13} /> +6 for a step
              </span>
              <span>
                <Seed size={13} /> +30 for the whole thing
              </span>
            </div>
            <p className="welcome-small">Nothing wilts and nothing resets. Quiet days are just rest days.</p>
          </motion.div>
        ) : (
          <motion.div
            key="nudges"
            className="welcome-page"
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -30 }}
            transition={{ duration: 0.25 }}
          >
            <h1>How much nudging?</h1>
            <p>You can change this any time in Settings.</p>
            <div className="preset-cards" role="radiogroup" aria-label="How much nudging">
              {PRESET_TEXT.map((o) => (
                <button
                  key={o.value}
                  role="radio"
                  aria-checked={preset === o.value}
                  className={`preset-card ${preset === o.value ? "is-on" : ""}`}
                  onClick={() => setPreset(o.value)}
                >
                  <span className="preset-label">{o.label}</span>
                  <span className="row-hint">{o.hint}</span>
                </button>
              ))}
            </div>
            <label className="check-row welcome-helper">
              <input type="checkbox" checked={helper} onChange={(e) => setHelper(e.target.checked)} />
              <span>
                Download the suggestion helper
                <span className="row-hint">
                  About {mb} MB, once. It runs on your device and suggests seeds and steps. Best on Wi-Fi. Without it Tend makes a simple guess.
                </span>
              </span>
            </label>
            {isAndroid && <p className="welcome-small">Tend asks for anything else it needs when you turn on a feature that uses it.</p>}
          </motion.div>
        )}
      </AnimatePresence>
      <div className="welcome-dots" aria-hidden>
        {[0, 1].map((i) => (
          <span key={i} className={i === page ? "is-on" : ""} />
        ))}
      </div>
      <button
        className="btn btn-primary btn-wide"
        onClick={() => {
          if (page === 1) void finish(false);
          else {
            sounds.step(0);
            setPage(1);
          }
        }}
      >
        {page === 1 ? "Start tending" : "Next"}
      </button>
      {page === 0 && (
        <button className="link" onClick={() => void finish(true)}>
          Skip
        </button>
      )}
    </motion.div>
  );
}
