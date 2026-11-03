import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { useStore } from "../lib/store";
import { appVersion, compareVersions } from "../lib/updater";
import { Leaf } from "./Icons";

/** What each release changed, newest first. Shown once after updating; new installs never see it. */
export const CHANGES: { version: string; title: string; items: string[] }[] = [
  {
    version: "0.3.0",
    title: "A calmer Tend",
    items: [
      "Fewer, gentler nudges by default: a reminder chimes at its time and once more, then rests. Pick Quiet, Gentle or Persistent in Settings.",
      "“Quiet for today” hushes chimes and the unlock screen until tomorrow. Doses still remind.",
      "The unlock screen can show Done, Tomorrow and Not now buttons instead of swiping (Settings → Nudges).",
      "Things from earlier days fold away under Today. Bring them in, or let them rest in Someday.",
      "Press and hold a task to move it: tomorrow, next week, any day, or Someday.",
      "Add things from anywhere: the home-screen widget, the quick settings tile, sharing text to Tend, or Ctrl+Alt+Space on Windows.",
      "Your phone's calendar can show on Today, read-only (Settings → Your day).",
      "On a stormy day Tend can offer to keep just one thing and let the rest wait.",
      "Skipping a dose now earns a few seeds too. Logging it honestly is what counts.",
    ],
  },
];

/** The note for this version, if it's newer than the last one seen. */
function pending(version: string, lastSeen: string | null) {
  const forced = new URLSearchParams(location.search).has("whatsnew");
  // Browser preview: ?whatsnew shows the newest note until it's dismissed.
  if (forced) return lastSeen === CHANGES[0].version ? null : CHANGES[0];
  if (version === "dev") return null;
  return CHANGES.find((c) => compareVersions(c.version, version) <= 0 && (!lastSeen || compareVersions(c.version, lastSeen) > 0)) ?? null;
}

/** A calm, dismissible "what changed" card, shown once per release. Waits while anything else is open. */
export function WhatsNew() {
  const { settings, updateSettings, nag, snap } = useStore();
  const [version, setVersion] = useState<string | null>(null);
  useEffect(() => void appVersion().then(setVersion), []);

  const note = version && settings.onboarded ? pending(version, settings.lastSeenVersion) : null;

  // A release without a note just moves the marker on, so an older note never shows later.
  useEffect(() => {
    if (version && version !== "dev" && settings.onboarded && !note && settings.lastSeenVersion !== version) updateSettings({ lastSeenVersion: version });
  }, [version, note, settings.onboarded, settings.lastSeenVersion, updateSettings]);

  const dismiss = () => updateSettings({ lastSeenVersion: version === "dev" ? (note?.version ?? null) : version });
  const show = !!note && !nag && !!snap;

  return (
    <AnimatePresence>
      {show && (
        <motion.div className="sheet-scrim" key="whats-new" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={dismiss}>
          <motion.div
            className="sheet whats-new"
            role="dialog"
            aria-labelledby="whats-new-title"
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: "spring", stiffness: 330, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.key === "Escape" && dismiss()}
          >
            <div className="sheet-head">
              <div>
                <p className="view-kicker">What changed in {note.version}</p>
                <h2 id="whats-new-title">{note.title}</h2>
              </div>
            </div>
            <div className="sheet-body">
              <ul className="whats-new-list">
                {note.items.map((t) => (
                  <li key={t}>
                    <Leaf size={14} />
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
              <p className="row-hint">Your reminders, seeds and settings are all still here. Settings has a new order: nudges come first.</p>
            </div>
            <div className="sheet-foot">
              <button className="btn btn-primary btn-wide" autoFocus onClick={dismiss}>
                Got it
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
