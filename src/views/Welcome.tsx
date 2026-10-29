import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { useStore } from "../lib/store";
import { api, isAndroid } from "../lib/api";
import { native } from "../lib/native";
import { sounds } from "../lib/sound";
import { Tree } from "../components/Tree";
import { Seed } from "../components/Icons";

const PAGES = [
  {
    title: "Tend",
    body: "A gentle place for the things you mean to do. Plant a reminder for today or any day ahead.",
    level: 1,
  },
  {
    title: "Every bit counts",
    body: "Break things into tiny steps. Each step gives you seeds straight away, and you can always see what finishing is worth.",
    level: 5,
  },
  {
    title: "Watch it grow",
    body: "Seeds grow your tree, level by level. Nothing wilts and nothing resets — quiet days are just rest days.",
    level: 14,
  },
];

export function Welcome() {
  const { updateSettings } = useStore();
  const [page, setPage] = useState(0);
  const last = page === PAGES.length - 1;
  const p = PAGES[page];

  async function finish() {
    sounds.finish();
    if (isAndroid) {
      await native.request("notifications").catch(() => null);
    }
    updateSettings({ onboarded: true });
    // The suggester is only ~35 MB: fetch it quietly so suggestions are smart from the start.
    void api.modelStatus().then((m) => (m.present ? null : api.downloadModel())).catch(() => null);
  }

  return (
    <motion.div className="welcome" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.4 } }}>
      <AnimatePresence mode="wait">
        <motion.div key={page} className="welcome-page" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} transition={{ duration: 0.25 }}>
          <Tree level={p.level} progress={0.5} size={220} />
          <h1>{p.title}</h1>
          <p>{p.body}</p>
          {page === 1 && (
            <div className="welcome-demo">
              <span>
                <Seed size={13} /> +6 for a step
              </span>
              <span>
                <Seed size={13} /> +30 for the whole thing
              </span>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
      <div className="welcome-dots" aria-hidden>
        {PAGES.map((_, i) => (
          <span key={i} className={i === page ? "is-on" : ""} />
        ))}
      </div>
      <button
        className="btn btn-primary btn-wide"
        onClick={() => {
          if (last) void finish();
          else {
            sounds.step(page);
            setPage(page + 1);
          }
        }}
      >
        {last ? "Start tending" : "Next"}
      </button>
      {!last && (
        <button className="link" onClick={() => void finish()}>
          Skip
        </button>
      )}
    </motion.div>
  );
}
