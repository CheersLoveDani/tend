import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { useStore } from "../lib/store";
import { appVersion, compareVersions } from "../lib/updater";
import { Leaf } from "./Icons";

/** What each release changed, newest first. Shown once after updating; new installs never see it. */
export const CHANGES: { version: string; title: string; items: string[] }[] = [
  {
    version: "0.5.2-1",
    title: "Someone's moved in",
    items: [
      "A little wren moves into your tree and lives there, happy whatever the weather. Give it a name in Settings.",
      "Visitors come and go with the seasons: swallows, a hedgehog, a robin in winter. Blue tits nest in spring, and sometimes a chick stays on.",
      "Nothing ever leaves because you were away. Field notes in the Garden keep everyone who's visited.",
      "Settings now has tabs and a search bar.",
    ],
  },
  {
    version: "0.5.1",
    title: "Pick your updates",
    items: [
      "Choose stable or unstable updates. Stable is tried and tested; unstable gets new things first. Switch any time in Settings → Updates.",
    ],
  },
  {
    version: "0.5.0",
    title: "Your weather, mapped",
    items: [
      "Expand Tend's notification to see everything that's waiting, each with its own Done or Taken button. Ticking one off leaves the rest be.",
      "After a weather check-in, tap what's behind it or type your own. Tend picks an emoji for new ones, and you can change it.",
      "A weather map in the Garden: daily charts, a calendar, what brightens your days, and a short note on each month.",
      "Steps can now be counted by your phone itself, so they show up even when your fitness app hasn't synced (Settings → Movement).",
      "New things you haven't tried yet are offered once when you open Tend. Everything stays in Settings.",
    ],
  },
  {
    version: "0.4.1",
    title: "One notification",
    items: [
      "Tend now keeps a single notification on Android: your list of what's still waiting. It comes back if swiped away.",
      "Reminders, doses and chimes ring through that one notification, with Taken, Done or Snooze right on it.",
    ],
  },
  {
    version: "0.4.0",
    title: "Weather in you",
    items: [
      "The mood check-in is now faces. Tap one and watch it turn into its weather.",
      "A daily check-in at a time you choose (Settings → Your day): tap a face right in the notification, or in a small window on Windows.",
      "Things on screen now glide into place instead of jumping.",
      "The unlock screen keeps working through the day, even if Android stops it in the background.",
    ],
  },
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

/** The "what changed" note still to show, if any. null while the version is loading too, so others can wait. */
export function useWhatsNewNote() {
  const { settings } = useStore();
  const [version, setVersion] = useState<string | null>(null);
  useEffect(() => void appVersion().then(setVersion), []);
  const note = version && settings.onboarded ? pending(version, settings.lastSeenVersion) : null;
  return { version, note, waiting: !version || !!note };
}

/** A calm, dismissible "what changed" card, shown once per release. Waits while anything else is open. */
export function WhatsNew() {
  const { settings, updateSettings, nag, snap } = useStore();
  const { version, note } = useWhatsNewNote();

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
