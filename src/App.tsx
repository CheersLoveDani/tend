import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { StoreProvider, useStore } from "./lib/store";
import type { Reminder } from "./lib/api";
import { Today } from "./views/Today";
import { Upcoming } from "./views/Upcoming";
import { Garden } from "./views/Garden";
import { SettingsView } from "./views/SettingsView";
import { Nag } from "./views/Nag";
import { Welcome } from "./views/Welcome";
import { Editor } from "./components/Editor";
import { RewardLayer } from "./components/RewardLayer";
import { Tree } from "./components/Tree";
import { Calendar, Gear, Plus, Seed, Sprout, Sun } from "./components/Icons";
import { sounds } from "./lib/sound";
import { isAndroid } from "./lib/api";
import { appUpdater, appVersion, type UpdateState } from "./lib/updater";

type Tab = "today" | "upcoming" | "garden" | "settings";

const TABS: { id: Tab; label: string; icon: typeof Sun }[] = [
  { id: "today", label: "Today", icon: Sun },
  { id: "upcoming", label: "Coming up", icon: Calendar },
  { id: "garden", label: "Garden", icon: Sprout },
  { id: "settings", label: "Settings", icon: Gear },
];

const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const UPDATE_RETRY_INTERVAL_MS = 2 * 60 * 1000;

/**
 * Keep Tend itself up to date: look for a new version at launch and every few hours.
 * Updates download by themselves (when allowed) but are only installed when asked.
 * Returns the version to offer, once per launch per version.
 */
function useAppUpdates(autoUpdate: boolean) {
  const [state, setState] = useState<UpdateState>(appUpdater.getState());
  const [offer, setOffer] = useState<string | null>(null);
  const auto = useRef(autoUpdate);
  auto.current = autoUpdate;

  useEffect(() => {
    if (!appUpdater.supported) return;
    const offered = new Set<string>();
    const stop = appUpdater.subscribe((next) => {
      setState(next);
      if ((next.status !== "ready" && next.status !== "available") || !next.version) return;
      if (next.status === "available" && auto.current) return; // about to download
      if (offered.has(next.version)) return;
      offered.add(next.version);
      setOffer(next.version);
    });
    const check = () => void appUpdater.check(auto.current);
    check();
    const interval = window.setInterval(check, UPDATE_CHECK_INTERVAL_MS);
    // A dropped download, or a launch without a connection, is tried again rather than left until the next start.
    const retry = window.setInterval(() => appUpdater.getState().status === "failed" && check(), UPDATE_RETRY_INTERVAL_MS);
    window.addEventListener("online", check);
    return () => {
      stop();
      window.clearInterval(interval);
      window.clearInterval(retry);
      window.removeEventListener("online", check);
    };
  }, []);

  // Android's installer is its own screen; only desktop restarts in place.
  const updating = state.status === "installing" && !isAndroid ? state.version : null;
  return { updating, offer, dismissOffer: () => setOffer(null) };
}

function UpdateOffer({ version, onClose }: { version: string; onClose: () => void }) {
  const [current, setCurrent] = useState("");
  useEffect(() => void appVersion().then(setCurrent), []);
  return (
    <motion.div className="sheet-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div
        className="sheet update-sheet"
        role="dialog"
        aria-label="An update is ready"
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 40, opacity: 0 }}
        transition={{ type: "spring", stiffness: 330, damping: 30 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-head">
          <h2>A new Tend is ready</h2>
        </div>
        <div className="sheet-body">
          <p>
            Version {version} is ready{current ? ` (you have ${current})` : ""}. Your reminders and seeds stay exactly as they are.
          </p>
          <p className="row-hint">{isAndroid ? "Android will ask you to confirm the install." : "Tend will close for a moment and reopen."}</p>
        </div>
        <div className="sheet-foot update-foot">
          <button className="btn btn-soft" onClick={onClose}>
            Later
          </button>
          <button
            className="btn btn-primary"
            onClick={() => {
              onClose();
              void appUpdater.install();
            }}
          >
            Update now
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function Shell() {
  const store = useStore();
  const { snap, settings, reduceMotion } = store;
  const [tab, setTab] = useState<Tab>("today");
  const [editing, setEditing] = useState<{ r: Reminder | null; date?: string } | null>(null);
  const { updating, offer, dismissOffer } = useAppUpdates(settings.autoUpdate);

  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", settings.theme);
    root.toggleAttribute("data-reduce-motion", reduceMotion);
  }, [settings.theme, reduceMotion]);

  // "N" anywhere opens a new reminder on desktop.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (editing || el.closest("input,textarea,select")) return;
      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        setEditing({ r: null });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing]);

  if (!snap || updating) {
    return (
      <div className="boot">
        <Tree level={1} progress={0.3} size={120} still />
        {updating && <p className="boot-note">Updating to Tend {updating}…</p>}
      </div>
    );
  }

  const level = snap.level;
  const progress = level.intoLevel / level.levelSize;
  const edit = (r: Reminder) => setEditing({ r });
  const add = (date?: string) => setEditing({ r: null, date });

  return (
    <div className="app">
      <aside className="rail">
        <div className="rail-tree" onClick={() => setTab("garden")} role="button" tabIndex={-1} aria-hidden>
          <Tree level={level.level} progress={progress} size={150} still={reduceMotion} />
        </div>
        <LevelBadge />
        <nav className="rail-nav" aria-label="Main">
          {TABS.map((t) => (
            <button key={t.id} className={`rail-link ${tab === t.id ? "is-on" : ""}`} onClick={() => setTab(t.id)} aria-current={tab === t.id ? "page" : undefined}>
              {tab === t.id && <motion.span layoutId="rail-pill" className="pill-bg" transition={{ type: "spring", stiffness: 400, damping: 34 }} />}
              <t.icon size={18} />
              <span>{t.label}</span>
            </button>
          ))}
        </nav>
        <button className="btn btn-primary rail-add" onClick={() => add()}>
          <Plus size={18} /> New reminder
        </button>
      </aside>

      <main className="main">
        <div className="topbar">
          <LevelBadge compact />
        </div>
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: reduceMotion ? 0 : 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: reduceMotion ? 0 : -6 }}
            transition={{ duration: 0.18 }}
          >
            {tab === "today" && <Today onEdit={edit} onAdd={() => add()} />}
            {tab === "upcoming" && <Upcoming onEdit={edit} onAdd={(d) => add(d)} />}
            {tab === "garden" && <Garden />}
            {tab === "settings" && <SettingsView />}
          </motion.div>
        </AnimatePresence>
      </main>

      {tab !== "settings" && (
        <motion.button
          className="fab"
          aria-label="New reminder"
          onClick={() => {
            sounds.tap();
            add(tab === "upcoming" ? undefined : undefined);
          }}
          whileTap={{ scale: 0.9 }}
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 400, damping: 20 }}
        >
          <Plus size={26} />
        </motion.button>
      )}

      <nav className="tabbar" aria-label="Main">
        {TABS.map((t) => (
          <button key={t.id} className={`tab ${tab === t.id ? "is-on" : ""}`} onClick={() => setTab(t.id)} aria-current={tab === t.id ? "page" : undefined}>
            {tab === t.id && <motion.span layoutId="tab-pill" className="pill-bg" transition={{ type: "spring", stiffness: 400, damping: 34 }} />}
            <t.icon size={20} />
            <span>{t.label}</span>
          </button>
        ))}
      </nav>

      <AnimatePresence>{editing && <Editor key="editor" initial={editing.r} defaultDate={editing.date} onClose={() => setEditing(null)} />}</AnimatePresence>
      <AnimatePresence>{store.nag && <Nag key="nag" />}</AnimatePresence>
      <AnimatePresence>{!settings.onboarded && <Welcome key="welcome" />}</AnimatePresence>
      {/* Never interrupts: the offer waits until nothing else is open. */}
      <AnimatePresence>
        {offer && settings.onboarded && !editing && !store.nag && <UpdateOffer key="update" version={offer} onClose={dismissOffer} />}
      </AnimatePresence>
      <Toasts />
      <RewardLayer />
    </div>
  );
}

function LevelBadge({ compact }: { compact?: boolean }) {
  const { snap } = useStore();
  if (!snap) return null;
  const l = snap.level;
  return (
    <div className={`level-badge ${compact ? "is-compact" : ""}`}>
      <span className="level-num">Level {l.level}</span>
      {!compact && <span className="level-stage">{l.stage}</span>}
      <span className="level-track" aria-hidden>
        <motion.span className="level-fill" initial={false} animate={{ width: `${(l.intoLevel / l.levelSize) * 100}%` }} transition={{ type: "spring", stiffness: 80, damping: 18 }} />
      </span>
      <span className="seed-counter" id={compact ? "seed-counter-top" : "seed-counter-rail"}>
        <Seed size={14} />
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span key={l.xp} initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -10, opacity: 0 }}>
            {l.xp}
          </motion.span>
        </AnimatePresence>
      </span>
    </div>
  );
}

function Toasts() {
  const { toasts } = useStore();
  return (
    <div className="toasts" aria-live="polite">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div key={t.id} className="toast" layout initial={{ opacity: 0, y: 20, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}>
            <span>{t.text}</span>
            {t.undo && (
              <button className="link" onClick={t.undo}>
                Undo
              </button>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}
