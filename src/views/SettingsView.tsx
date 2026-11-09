import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { listen } from "@tauri-apps/api/event";
import { AnimatePresence, motion } from "motion/react";
import { OPEN_SETTINGS_EVENT, takeSettingsSection } from "../lib/features";
import { api, isAndroid, type Hello, type SyncInfo } from "../lib/api";
import { useStore } from "../lib/store";
import { native, type PermissionKind, type Permissions } from "../lib/native";
import { configureSound, preview, SOUND_NAMES, sounds, type SoundName } from "../lib/sound";
import { DEFAULT_MOOD_REASONS, endOfToday, isPaused, NUDGE_PRESETS, PRESET_TEXT, type Settings } from "../lib/settings";
import { calendar, type CalendarAccess, type DeviceCalendar } from "../lib/calendar";
import { Chevron, Close, Minus, Plus, Sync } from "../components/Icons";
import { ReasonOptionsEditor } from "../components/MoodReasons";
import { openInsights } from "../lib/weather";
import { guessSouth } from "../lib/wildlife";
import { SPECIES_INFO, type Species } from "../components/Critters";
import { appUpdater, appVersion } from "../lib/updater";
import { backup, type BackupSource, type BackupStatus } from "../lib/backup";
import { fitness, fitSupported, minuteMilestones, stepMilestones, type FitStatus } from "../lib/fitness";
import { clock, today } from "../lib/dates";
import { format, formatDistanceToNow, isToday, parseISO } from "date-fns";
import QRCode from "qrcode";
import { Format, checkPermissions as scanPermissions, requestPermissions as requestScan, scan } from "@tauri-apps/plugin-barcode-scanner";
import { disable as disableAutostart, enable as enableAutostart, isEnabled as autostartEnabled } from "@tauri-apps/plugin-autostart";

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="row">
      <span className="row-text">
        <span className="row-label">{label}</span>
        {hint && <span className="row-hint">{hint}</span>}
      </span>
      <button
        role="switch"
        aria-checked={checked}
        className={`switch ${checked ? "is-on" : ""}`}
        onClick={() => {
          sounds.tap();
          onChange(!checked);
        }}
      >
        <motion.span className="switch-knob" layout transition={{ type: "spring", stiffness: 500, damping: 32 }} />
      </button>
    </label>
  );
}

// ---- tabs and search ---------------------------------------------------------------------------

type SettingsTab = "nudges" | "day" | "look" | "movement" | "data";

const SETTINGS_TABS: { id: SettingsTab; label: string }[] = [
  { id: "nudges", label: "Nudges" },
  { id: "day", label: "Your day" },
  { id: "look", label: "Look & rewards" },
  { id: "movement", label: "Movement" },
  { id: "data", label: "Data & sync" },
];

/** Where each section (Group `id`) lives, for links from elsewhere (the new-feature pop-up). */
const SECTION_TAB: Record<string, SettingsTab> = {
  nudges: "nudges",
  "your-day": "day",
  look: "look",
  rewards: "look",
  wildlife: "look",
  movement: "movement",
  data: "data",
  sync: "data",
  updates: "data",
};

const SettingsFilter = createContext<{ tab: SettingsTab; query: string; report: (id: string, n: number) => void }>({
  tab: "nudges",
  query: "",
  report: () => {},
});

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
const matches = (text: string, q: string) => q.split(/\s+/).every((w) => norm(text).includes(w));

/**
 * One section of Settings. Shown on its tab; while searching, every section shows only its matching
 * rows (or all of them when the section's title or `keywords` match). Rows are matched by their text,
 * so nothing needs registering. `keywords` covers what's tucked away in closed "Fine-tune" style
 * disclosures and other words people might search for.
 */
function Group({ title, id, tab, keywords = "", children }: { title: string; id?: string; tab: SettingsTab; keywords?: string; children: ReactNode }) {
  const { tab: current, query, report } = useContext(SettingsFilter);
  const card = useRef<HTMLDivElement>(null);
  const [hidden, setHidden] = useState(false);
  const q = norm(query.trim());
  const key = id ?? title;

  useLayoutEffect(() => {
    const el = card.current;
    if (!el) return;
    // Matching rows show on their own. The whole section shows when its title matches, or when
    // only its keywords do (the match is tucked inside something closed, like "Fine-tune").
    const apply = () => {
      if (!filter(!q || matches(title, q)) && q && matches(keywords, q)) filter(true);
    };
    const filter = (whole: boolean) => {
      let shown = 0;
      for (const child of Array.from(el.children) as HTMLElement[]) {
        const rows = child.matches(".row") ? [child] : (Array.from(child.querySelectorAll(".row")) as HTMLElement[]);
        if (rows.length > 1 || (rows.length === 1 && rows[0] !== child)) {
          let any = false;
          for (const r of rows) {
            const ok = whole || matches(r.textContent ?? "", q);
            r.toggleAttribute("data-search-hidden", !ok);
            any ||= ok;
          }
          child.toggleAttribute("data-search-hidden", !any);
          if (any) shown++;
        } else {
          const ok = whole || matches(child.textContent ?? "", q);
          child.toggleAttribute("data-search-hidden", !ok);
          if (ok) shown++;
        }
      }
      setHidden(!!q && shown === 0);
      report(key, q ? shown : -1);
      return shown > 0;
    };
    apply();
    // Rows come and go (disclosures open, data loads): keep the filter applied.
    const watch = new MutationObserver(() => {
      watch.disconnect();
      apply();
      watch.observe(el, { childList: true, subtree: true });
    });
    watch.observe(el, { childList: true, subtree: true });
    return () => watch.disconnect();
  }, [q, title, keywords, key, report]);

  if (!q && tab !== current) return null;
  return (
    <section className="settings-group" id={id ? `settings-${id}` : undefined} hidden={hidden}>
      <h2 className="section-title">{title}</h2>
      <div className="settings-card" ref={card}>
        {children}
      </div>
    </section>
  );
}

/** The tab strip and search box above Settings. */
function SettingsNav({
  tab,
  setTab,
  query,
  setQuery,
}: {
  tab: SettingsTab;
  setTab: (t: SettingsTab) => void;
  query: string;
  setQuery: (q: string) => void;
}) {
  const searching = !!query.trim();
  return (
    <div className="settings-nav">
      <div className="settings-search">
        <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden>
          <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M16 16l4.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <input
          type="search"
          value={query}
          placeholder="Search settings"
          aria-label="Search settings"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && setQuery("")}
        />
        {query && (
          <button className="btn btn-quiet btn-icon" aria-label="Clear search" onClick={() => setQuery("")}>
            <Close size={15} />
          </button>
        )}
      </div>
      <AnimatePresence initial={false}>
        {!searching && (
          <motion.div
            key="tabs"
            className="segmented settings-tabs"
            role="tablist"
            aria-label="Settings sections"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
          >
            {SETTINGS_TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                className={tab === t.id ? "is-on" : ""}
                onClick={() => {
                  if (t.id !== tab) sounds.tap();
                  setTab(t.id);
                }}
              >
                {tab === t.id && <motion.span layoutId="settings-tab-pill" className="pill-bg" />}
                <span>{t.label}</span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Tab and search state, plus "how many sections matched" for the empty state. */
function useSettingsNav() {
  const [tab, setTab] = useState<SettingsTab>(() => {
    const pending = takeSettingsSection();
    if (pending && SECTION_TAB[pending]) return SECTION_TAB[pending];
    try {
      const saved = localStorage.getItem("tend.settings.tab") as SettingsTab | null;
      if (saved && SETTINGS_TABS.some((t) => t.id === saved)) return saved;
    } catch {
      /* fine */
    }
    return "nudges";
  });
  const [query, setQuery] = useState("");
  const counts = useRef(new Map<string, number>());
  const [found, setFound] = useState(-1);
  const report = useRef((id: string, n: number) => {
    counts.current.set(id, n);
    const vals = [...counts.current.values()];
    setFound(vals.some((v) => v < 0) ? -1 : vals.reduce((a, b) => a + b, 0));
  }).current;

  useEffect(() => {
    try {
      localStorage.setItem("tend.settings.tab", tab);
    } catch {
      /* fine */
    }
  }, [tab]);
  // Sections unmount when leaving a tab; start counting afresh on each new search.
  useEffect(() => {
    if (!query.trim()) counts.current.clear();
  }, [query]);
  // A link to a section while Settings is already open.
  useEffect(() => {
    const on = (e: Event) => {
      const t = SECTION_TAB[(e as CustomEvent<string>).detail];
      takeSettingsSection();
      if (t) {
        setQuery("");
        setTab(t);
      }
    };
    window.addEventListener(OPEN_SETTINGS_EVENT, on);
    return () => window.removeEventListener(OPEN_SETTINGS_EVENT, on);
  }, []);
  return { tab, setTab, query, setQuery, report, found };
}

function Choice<T extends string>({
  label,
  hint,
  value,
  options,
  onChange,
}: {
  label: string;
  hint?: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="row">
      {hint ? (
        <span className="row-text">
          <span className="row-label">{label}</span>
          <span className="row-hint">{hint}</span>
        </span>
      ) : (
        <span className="row-label">{label}</span>
      )}
      <div className="segmented small" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button key={o.value} role="radio" aria-checked={value === o.value} className={value === o.value ? "is-on" : ""} onClick={() => onChange(o.value)}>
            {value === o.value && <motion.span layoutId={`seg-${label}`} className="pill-bg" />}
            <span>{o.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Copy (and on desktop, save) every medication, dose and diary entry; read one back in. */
function HealthData() {
  const { refresh, toast } = useStore();
  const [busy, setBusy] = useState(false);

  async function exportAll() {
    setBusy(true);
    try {
      const json = await api.exportHealth();
      await navigator.clipboard?.writeText(json).catch(() => null);
      if (!isAndroid) {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([json], { type: "application/json" }));
        a.download = `tend-health-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(a.href);
      }
      toast(isAndroid ? "Copied to the clipboard. Paste it anywhere to keep it." : "Saved, and copied to the clipboard.");
    } catch (e) {
      toast(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function importText(json: string) {
    setBusy(true);
    try {
      const [meds, doses, entries] = await api.importHealth(json);
      await refresh();
      toast(`Brought in ${meds} medications, ${doses} doses and ${entries} diary entries.`);
    } catch (e) {
      toast(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="row">
        <span className="row-text">
          <span className="row-label">Export medicine and diary</span>
          <span className="row-hint">Everything on the Medicine tab, as a file you can keep or move.</span>
        </span>
        <button className="btn btn-soft" disabled={busy} onClick={() => void exportAll()}>
          Export
        </button>
      </div>
      <div className="row">
        <span className="row-text">
          <span className="row-label">Import</span>
          <span className="row-hint">From a Tend export file. Adds to what's here; nothing is removed.</span>
        </span>
        <span className="row-actions">
          <button
            className="btn btn-quiet"
            disabled={busy}
            onClick={() =>
              void navigator.clipboard
                ?.readText()
                .then(importText)
                .catch(() => toast("Couldn't read the clipboard"))
            }
          >
            Paste
          </button>
          <label className={`btn btn-soft file-btn ${busy ? "is-disabled" : ""}`}>
            Choose file
            <input
              type="file"
              accept=".json,application/json,text/plain"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void f.text().then(importText);
              }}
            />
          </label>
        </span>
      </div>
    </>
  );
}

/** Encrypted daily backups to a place the user picks, and restoring from one. */
function BackupSettings() {
  const { refresh, toast } = useStore();
  const [status, setStatus] = useState<BackupStatus | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const [pass, setPass] = useState("");
  const [pass2, setPass2] = useState("");
  const [changing, setChanging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [source, setSource] = useState<BackupSource | null>(null);
  const [restorePass, setRestorePass] = useState("");

  const load = () =>
    void Promise.all([backup.status(), backup.target()])
      .then(([s, t]) => {
        setStatus(s);
        setTarget(t);
      })
      .catch(() => null);
  useEffect(load, []);

  async function step(work: () => Promise<unknown>, done?: string) {
    setBusy(true);
    try {
      await work();
      if (done) toast(done);
    } catch (e) {
      toast(String(e));
    } finally {
      setBusy(false);
      load();
    }
  }

  const passOk = pass.length >= 8 && pass === pass2;
  const askPass = !status?.hasKey || changing;

  return (
    <>
      <div className="row">
        <span className="row-text">
          <span className="row-label">Daily backup</span>
          <span className="row-hint">
            {status?.last
              ? `Last saved ${formatDistanceToNow(status.last, { addSuffix: true })}${target ? ` to ${target}` : ""}.`
              : status?.hasKey && target
                ? "Set up. The first backup runs now."
                : "Everything, encrypted with a passphrase only you know, saved once a day when Tend opens."}
          </span>
          {status?.error && <span className="row-hint warn">Last try failed: {status.error}</span>}
        </span>
        {status?.hasKey && target && (
          <button className="btn btn-soft" disabled={busy} onClick={() => void step(backup.run, "Backed up")}>
            Back up now
          </button>
        )}
      </div>

      {askPass && (
        <div className="row stack">
          <span className="row-text">
            <span className="row-label">{changing ? "New passphrase" : "Choose a passphrase"}</span>
            <span className="row-hint">At least 8 characters. Write it down: without it a backup can't be opened, by anyone.</span>
          </span>
          <div className="pass-form">
            <input
              className="field-input"
              type="password"
              autoComplete="new-password"
              placeholder="Passphrase"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
            />
            <input
              className="field-input"
              type="password"
              autoComplete="new-password"
              placeholder="Same again"
              value={pass2}
              onChange={(e) => setPass2(e.target.value)}
            />
            <button
              className="btn btn-primary"
              disabled={busy || !passOk}
              onClick={() =>
                void step(
                  async () => {
                    await backup.setPassphrase(pass);
                    setPass("");
                    setPass2("");
                    setChanging(false);
                  },
                  changing ? "New passphrase set. Older backups still open with the old one." : "Passphrase set",
                )
              }
            >
              Save
            </button>
          </div>
          {pass2 && pass !== pass2 && <span className="row-hint warn">Those don't match yet.</span>}
        </div>
      )}

      {status?.hasKey && (
        <div className="row">
          <span className="row-text">
            <span className="row-label">{isAndroid ? "Backup file" : "Backup folder"}</span>
            <span className="row-hint">
              {target ?? (isAndroid ? "Pick where to keep it. Google Drive works and keeps older versions too." : "Pick a folder. The last 7 days are kept.")}
            </span>
          </span>
          <button
            className="btn btn-soft"
            disabled={busy}
            onClick={() =>
              void step(async () => {
                const t = await backup.chooseTarget();
                setTarget(t);
                if (t) await backup.run();
              })
            }
          >
            {target ? "Change" : "Choose"}
          </button>
        </div>
      )}

      <div className="row stack">
        <span className="row-text">
          <span className="row-label">Restore from a backup</span>
          <span className="row-hint">Adds it to what's here. Anything changed more recently on this device stays.</span>
        </span>
        {source ? (
          <div className="pass-form">
            <span className="row-hint">{source.name}</span>
            <input
              className="field-input"
              type="password"
              autoComplete="current-password"
              placeholder="Its passphrase"
              value={restorePass}
              onChange={(e) => setRestorePass(e.target.value)}
            />
            <span className="row-actions">
              <button className="btn btn-quiet" onClick={() => (setSource(null), setRestorePass(""))}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                disabled={busy || !restorePass}
                onClick={() =>
                  void step(async () => {
                    const r = await backup.restore(source, restorePass);
                    setSource(null);
                    setRestorePass("");
                    await refresh();
                    toast(`Restored the backup from ${new Date(r.createdAt).toLocaleDateString()}: ${r.changed} things updated.`);
                  })
                }
              >
                Restore
              </button>
            </span>
          </div>
        ) : (
          <span className="row-actions">
            {status?.hasKey && !changing && (
              <button className="btn btn-quiet" onClick={() => setChanging(true)}>
                Change passphrase
              </button>
            )}
            <button className="btn btn-soft" disabled={busy} onClick={() => void step(async () => setSource(await backup.pick()))}>
              Choose a backup
            </button>
          </span>
        )}
      </div>
    </>
  );
}

function Stepper({
  label,
  hint,
  value,
  step,
  min,
  max,
  unit,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  step: number;
  min: number;
  max: number;
  unit: string;
  onChange: (v: number) => void;
}) {
  const set = (v: number) => {
    sounds.tap();
    onChange(Math.min(max, Math.max(min, v)));
  };
  return (
    <div className="row">
      <span className="row-text">
        <span className="row-label">{label}</span>
        {hint && <span className="row-hint">{hint}</span>}
      </span>
      <span className="stepper">
        <button className="btn btn-soft btn-icon" aria-label={`Less: ${label}`} disabled={value <= min} onClick={() => set(value - step)}>
          <Minus size={15} />
        </button>
        <span className="stepper-value">
          {value.toLocaleString()} <span className="row-hint">{unit}</span>
        </span>
        <button className="btn btn-soft btn-icon" aria-label={`More: ${label}`} disabled={value >= max} onClick={() => set(value + step)}>
          <Plus size={15} />
        </button>
      </span>
    </div>
  );
}

/** Steps and workouts from Health Connect, where Google Fit and most fitness apps keep them. */
function MovementSettings() {
  const { settings: s, updateSettings, syncFit, toast } = useStore();
  const [st, setSt] = useState<FitStatus | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(
    () =>
      void fitness
        .status()
        .then(setSt)
        .catch(() => null),
    [],
  );

  // Read straight away after connecting or turning off, once the new setting has landed.
  const prevSince = useRef(s.fitSince);
  useEffect(() => {
    if (prevSince.current === s.fitSince) return;
    prevSince.current = s.fitSince;
    void syncFit(true);
  }, [s.fitSince, syncFit]);

  // New goals can mean new milestones reached: look again once they've settled.
  const goalKey = `${s.stepGoal}/${s.stepSeeds}/${s.moveGoal}/${s.moveSeeds}`;
  const firstGoal = useRef(goalKey);
  useEffect(() => {
    if (firstGoal.current === goalKey) return;
    const t = setTimeout(() => void syncFit(true), 1200);
    return () => clearTimeout(t);
  }, [goalKey, syncFit]);

  const rules = "Seeds come as you get closer to your goals, and keep coming past them, up to double.";
  const stepPlan = stepMilestones(s.stepSeeds);
  const minutePlan = minuteMilestones(s.moveSeeds);
  const lead = (plan: { pct: number; seeds: number }[]) => plan.filter((m) => m.pct < 100);
  const goals = (
    <>
      <Stepper
        label="Daily step goal"
        hint={`${lead(stepPlan)
          .map((m) => `${m.pct}%`)
          .join(
            ", ",
          )} pay ${lead(stepPlan)[0].seeds} each, the goal pays ${stepPlan.find((m) => m.pct === 100)!.seeds}, and every extra quarter pays ${stepPlan.at(-1)!.seeds}.`}
        value={s.stepGoal}
        step={500}
        min={1000}
        max={30000}
        unit="steps"
        onChange={(v) => updateSettings({ stepGoal: v })}
      />
      <Stepper label="Seeds for reaching it" value={s.stepSeeds} step={5} min={5} max={100} unit="seeds" onChange={(v) => updateSettings({ stepSeeds: v })} />
      <Stepper
        label="Daily exercise goal"
        hint={`Minutes of logged workouts. Halfway pays ${minutePlan[0].seeds}, the goal pays ${minutePlan[1].seeds}, and each workout adds 2 for showing up.`}
        value={s.moveGoal}
        step={5}
        min={5}
        max={180}
        unit="min"
        onChange={(v) => updateSettings({ moveGoal: v })}
      />
      <Stepper label="Seeds for reaching it" value={s.moveSeeds} step={5} min={5} max={100} unit="seeds" onChange={(v) => updateSettings({ moveSeeds: v })} />
    </>
  );

  if (!fitSupported()) {
    return (
      <div className="row">
        <span className="row-text">
          <span className="row-label">Steps & workouts</span>
          <span className="row-hint">Connect them in Tend on your phone. The seeds arrive here when your devices sync.</span>
        </span>
      </div>
    );
  }

  async function connect() {
    setBusy(true);
    try {
      const r = await fitness.connect();
      setSt(r);
      if (r.steps || r.workouts) {
        if (!s.fitSince) updateSettings({ fitSince: today() });
        else void syncFit(true);
      } else if (r.status === "available") {
        toast("Nothing was allowed. You can try again any time.");
      }
    } catch (e) {
      toast(String(e));
    } finally {
      setBusy(false);
    }
  }

  const allowed = !!st && (st.steps || st.workouts);
  const on = !!s.fitSince && allowed;
  const hint = !st
    ? "Checking…"
    : st.status === "unsupported"
      ? "Needs Android 9 or newer."
      : st.status === "unavailable"
        ? "Health Connect isn't available on this phone."
        : st.status === "update"
          ? "Tend reads them from Health Connect. Install or update it first, then come back."
          : on
            ? `Counting since ${format(parseISO(s.fitSince!), "d MMM")}.${st.phoneSteps ? " Steps come from this phone too, so they count even when your fitness app hasn't synced." : ""} ${rules}`
            : `From Google Fit, Samsung Health, Fitbit or any app that saves to Health Connect. Tend only reads, and nothing leaves your phone. ${rules}`;

  return (
    <>
      <div className="row">
        <span className="row-text">
          <span className="row-label">Steps & workouts</span>
          <span className="row-hint">{hint}</span>
          {on && (!st!.steps || !st!.workouts) && (
            <span className="row-hint warn">
              {st!.steps ? "Workouts aren't allowed, so only steps count." : "Steps aren't allowed, so only workouts count."}
            </span>
          )}
          {s.fitSince && st?.status === "available" && !allowed && (
            <span className="row-hint warn">Health Connect access was removed. Connect again to keep counting.</span>
          )}
        </span>
        {st?.status === "update" && (
          <button className="btn btn-soft" disabled={busy} onClick={() => void connect()}>
            Get Health Connect
          </button>
        )}
        {st?.status === "available" && !on && (
          <button className="btn btn-primary" disabled={busy} onClick={() => void connect()}>
            Connect
          </button>
        )}
        {on && (
          <span className="row-actions">
            {(!st!.steps || !st!.workouts) && (
              <button className="btn btn-soft" disabled={busy} onClick={() => void connect()}>
                Allow both
              </button>
            )}
            <button className="btn btn-quiet" onClick={() => updateSettings({ fitSince: null })}>
              Turn off
            </button>
          </span>
        )}
      </div>
      {on && st?.phoneSensor && !st.phoneSteps && (
        <div className="row">
          <span className="row-text">
            <span className="row-label">Count steps on this phone</span>
            <span className="row-hint">Some apps (Google Fit, for one) only share steps when they're opened. Tend can count them itself with the phone's step sensor, in the background.</span>
          </span>
          <button
            className="btn btn-soft"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const r = await fitness.allowPhoneSteps();
                setSt(r);
                if (r.phoneSteps) void syncFit(true);
                else toast("Tend needs “Physical activity” to count steps. You can allow it in Android's app settings.");
              } catch (e) {
                toast(String(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            Allow
          </button>
        </div>
      )}
      {on && goals}
    </>
  );
}

/** Each permission, and whether something the user has switched on needs it. */
const NEEDS: { kind: PermissionKind; label: string; why: string; when: (s: Settings, p: Permissions, timed: boolean) => boolean }[] = [
  { kind: "notifications", label: "Notifications", why: "Reminders arrive as notifications.", when: () => true },
  { kind: "exactAlarm", label: "On-time alarms", why: "So timed reminders and doses arrive at the exact minute.", when: (_, __, timed) => timed },
  { kind: "overlay", label: "Show over other apps", why: "The unlock screen needs this to appear when you unlock.", when: (s) => s.nagOnUnlock },
  // Only a fallback for the unlock screen, so it's offered only when the main way isn't allowed.
  { kind: "fullScreenIntent", label: "Full-screen reminders", why: "A backup way to show the unlock screen.", when: (s, p) => s.nagOnUnlock && !p.overlay },
  {
    kind: "batteryUnrestricted",
    label: "Run in the background",
    why: "Stops Android from silencing Tend. It only wakes for your reminders.",
    when: (s) => s.chimeMinutes > 0 || s.nagOnUnlock,
  },
];

/** Only the permissions that something switched on actually needs, each with a "Fix" button. Nothing when all is well. */
export function PermissionBanner() {
  const { settings: s, snap } = useStore();
  const [perms, setPerms] = useState<Permissions | null>(null);

  // Allowing usually happens in Android's own settings, so look again on the way back.
  useEffect(() => {
    if (!isAndroid) return;
    const load = () =>
      document.visibilityState === "visible" &&
      void native
        .permissions()
        .then(setPerms)
        .catch(() => null);
    load();
    document.addEventListener("visibilitychange", load);
    return () => document.removeEventListener("visibilitychange", load);
  }, []);

  if (!isAndroid || !perms) return null;
  const timed = !!snap && (snap.meds.some((m) => !m.paused) || snap.reminders.some((r) => r.status === "open" && !!r.time));
  const missing = NEEDS.filter((n) => !perms[n.kind] && n.when(s, perms, timed));
  if (missing.length === 0) return null;

  return (
    <motion.section className="perm-banner" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} aria-label="Permissions Tend needs">
      <p className="perm-banner-title">{missing.length === 1 ? "One thing needs a yes from Android" : `${missing.length} things need a yes from Android`}</p>
      {missing.map((n) => (
        <div className="perm-row" key={n.kind}>
          <span className="row-text">
            <span className="row-label">{n.label}</span>
            <span className="row-hint">{n.why}</span>
          </span>
          <button
            className="btn btn-soft"
            onClick={() =>
              void native
                .request(n.kind)
                .then(setPerms)
                .catch(() => null)
            }
          >
            Fix
          </button>
        </div>
      ))}
    </motion.section>
  );
}

/** "midnight", "18:30", or "Tue 08:00". */
function untilText(ms: number) {
  const d = new Date(ms);
  if (d.getHours() === 23 && d.getMinutes() === 59) return isToday(d) ? "midnight" : `${format(d, "EEE")} midnight`;
  const t = clock(format(d, "HH:mm"));
  return isToday(d) ? t : `${format(d, "EEE")} ${t}`;
}

const presetOf = (s: Settings) =>
  (Object.keys(NUDGE_PRESETS) as (keyof typeof NUDGE_PRESETS)[]).find((k) =>
    Object.entries(NUDGE_PRESETS[k]).every(([f, v]) => s[f as keyof Settings] === v),
  ) ?? "custom";

/** Everything about when and how Tend gets your attention. First in Settings because it matters most. */
function NudgeSettings({ autostart, setAutostart }: { autostart: boolean | null; setAutostart: (v: boolean) => void }) {
  const { settings: s, updateSettings: set, toast } = useStore();
  const [fine, setFine] = useState(false);
  const paused = isPaused(s);
  const preset = presetOf(s);

  return (
    <>
      {isAndroid && (
        <Choice
          label="Start from"
          hint={PRESET_TEXT.find((p) => p.value === preset)?.hint ?? "Your own mix. Pick one to start again from it."}
          value={preset}
          onChange={(v) => v !== "custom" && set(NUDGE_PRESETS[v])}
          options={PRESET_TEXT.map((p) => ({ value: p.value, label: p.label }))}
        />
      )}
      <Toggle
        label="Quiet for today"
        hint={
          paused ? `Quiet until ${untilText(s.pausedUntil!)}. Doses still remind.` : "Hush chimes and the unlock screen until tomorrow. Doses still remind."
        }
        checked={paused}
        onChange={(v) => set({ pausedUntil: v ? endOfToday() : null })}
      />
      <Choice
        label="Gentle chime"
        hint="A sound and buzz while something's time has passed. Things without a time wait quietly."
        value={String(s.chimeMinutes)}
        onChange={(v) => set({ chimeMinutes: Number(v) })}
        options={[
          { value: "0", label: "Off" },
          ...(s.chimeMinutes === 15 ? [{ value: "15", label: "Every 15 min" }] : []),
          { value: "30", label: "Every 30 min" },
          { value: "60", label: "Hourly" },
        ]}
      />
      {isAndroid && (
        <>
          <Toggle
            label="Show what's waiting when I unlock"
            hint="A calm screen before you dive into your phone."
            checked={s.nagOnUnlock}
            onChange={(v) => set({ nagOnUnlock: v })}
          />
          {s.nagOnUnlock && (
            <>
              <Choice
                label="At most"
                value={String(s.nagEvery < 0 && s.chimeMinutes === 0 ? 30 : s.nagEvery)}
                onChange={(v) => set({ nagEvery: Number(v) })}
                options={[
                  ...(s.chimeMinutes > 0 ? [{ value: "-1", label: "After a chime" }] : []),
                  { value: "0", label: "Every unlock" },
                  { value: "30", label: "Every 30 min" },
                  { value: "60", label: "Hourly" },
                ]}
              />
              <Choice
                label="Times a day"
                value={String(s.nagDailyCap)}
                onChange={(v) => set({ nagDailyCap: Number(v) })}
                options={[
                  { value: "3", label: "Up to 3" },
                  { value: "6", label: "Up to 6" },
                  { value: "10", label: "Up to 10" },
                  { value: "0", label: "No limit" },
                ]}
              />
              <Toggle
                label="Use buttons instead of swiping"
                hint="Each row on the unlock screen shows Done, Tomorrow and Not now buttons."
                checked={s.unlockButtons}
                onChange={(v) => set({ unlockButtons: v })}
              />
            </>
          )}
        </>
      )}
      {!isAndroid && autostart !== null && (
        <Toggle
          label="Start with Windows"
          hint="Tend waits quietly in the tray so reminders arrive on time."
          checked={autostart}
          onChange={(v) =>
            void (v ? enableAutostart() : disableAutostart()).then(() => setAutostart(v)).catch(() => toast("Couldn't change that. Try again in a moment."))
          }
        />
      )}
      <Toggle
        label="Quiet hours"
        hint={s.quietHours ? `No nudges from ${s.quietHours.start} to ${s.quietHours.end}.` : "Nudges can arrive at any time."}
        checked={!!s.quietHours}
        onChange={(v) => set({ quietHours: v ? { start: "22:30", end: "07:30" } : null })}
      />
      {s.quietHours && (
        <div className="row">
          <span className="row-label">From</span>
          <span className="time-pair">
            <input
              type="time"
              value={s.quietHours.start}
              onChange={(e) => set({ quietHours: { ...s.quietHours!, start: e.target.value } })}
              aria-label="Quiet hours start"
            />
            <span>to</span>
            <input
              type="time"
              value={s.quietHours.end}
              onChange={(e) => set({ quietHours: { ...s.quietHours!, end: e.target.value } })}
              aria-label="Quiet hours end"
            />
          </span>
        </div>
      )}
      {isAndroid && (
        <>
          <button className="row disclosure" aria-expanded={fine} onClick={() => setFine(!fine)}>
            <span className="row-text">
              <span className="row-label">Fine-tune</span>
              <span className="row-hint">How nudges sound, repeats, heads-ups and dose reminders.</span>
            </span>
            <Chevron size={16} className={fine ? "is-open" : ""} />
          </button>
          {fine && (
            <div className="disclosure-body">
              <Choice
                label="How nudges arrive"
                hint="For everything except doses."
                value={s.cueStyle}
                onChange={(v) => set({ cueStyle: v })}
                options={[
                  { value: "sound", label: "Sound" },
                  { value: "vibrate", label: "Buzz only" },
                  { value: "silent", label: "Silent" },
                ]}
              />
              <Choice
                label="Remind me again"
                hint="A timed reminder nudges at its time, once more after this, then rests."
                value={String(s.nudgeAgainMinutes)}
                onChange={(v) => set({ nudgeAgainMinutes: Number(v) })}
                options={[
                  { value: "0", label: "Never" },
                  { value: "15", label: "15 min" },
                  { value: "30", label: "30 min" },
                  { value: "60", label: "1 hour" },
                ]}
              />
              <Choice
                label="Heads-up before"
                hint="A quiet note before a timed reminder, to help with switching."
                value={String(s.preWarnMinutes)}
                onChange={(v) => set({ preWarnMinutes: Number(v) })}
                options={[
                  { value: "0", label: "Off" },
                  { value: "5", label: "5 min" },
                  { value: "10", label: "10 min" },
                  { value: "15", label: "15 min" },
                ]}
              />
              <Choice
                label="Dose reminders repeat"
                hint="Until the dose is taken or skipped."
                value={String(s.doseNagMinutes)}
                onChange={(v) => set({ doseNagMinutes: Number(v) })}
                options={[
                  { value: "0", label: "Once" },
                  { value: "15", label: "Every 15 min" },
                  { value: "30", label: "Every 30 min" },
                  { value: "60", label: "Hourly" },
                ]}
              />
              {s.doseNagMinutes > 0 && (
                <Choice
                  label="For up to"
                  value={String(s.doseNagUntilMinutes)}
                  onChange={(v) => set({ doseNagUntilMinutes: Number(v) })}
                  options={[
                    { value: "60", label: "1 hour" },
                    { value: "120", label: "2 hours" },
                    { value: "240", label: "4 hours" },
                  ]}
                />
              )}
            </div>
          )}
        </>
      )}
    </>
  );
}

/** The phone's calendars on Today (read-only), and the stormy-day offer. */
function DaySettings() {
  const { settings: s, updateSettings: set, toast } = useStore();
  const [status, setStatus] = useState<CalendarAccess["status"] | null>(null);
  const [cals, setCals] = useState<DeviceCalendar[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(
    () =>
      void calendar
        .status()
        .then((r) => setStatus(r.status))
        .catch(() => setStatus("unsupported")),
    [],
  );
  useEffect(() => {
    if (s.calendarEnabled && status === "granted")
      void calendar
        .calendars()
        .then(setCals)
        .catch(() => setCals([]));
  }, [s.calendarEnabled, status]);

  async function enable(v: boolean) {
    if (!v) return set({ calendarEnabled: false });
    setBusy(true);
    try {
      const r = await calendar.request();
      setStatus(r.status);
      if (r.status === "granted") set({ calendarEnabled: true });
      else toast("Tend needs calendar access to show events. It only reads them, and nothing leaves your phone.");
    } catch {
      toast("Couldn't reach the calendar just now. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  const all = cals?.map((c) => c.id) ?? [];
  const shown = (id: string) => s.calendarIds.length === 0 || s.calendarIds.includes(id);
  function toggleCal(id: string) {
    const cur = s.calendarIds.length ? s.calendarIds : all;
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    if (next.length === 0) return toast("Keep at least one, or turn the calendar off.");
    set({ calendarIds: next.length === all.length ? [] : next });
  }

  return (
    <>
      {status === "unsupported" || !isAndroid ? (
        <div className="row">
          <span className="row-text">
            <span className="row-label">Calendar</span>
            <span className="row-hint">Calendar needs the phone app for now. On your phone, Tend can show today's events from Google Calendar and others.</span>
          </span>
        </div>
      ) : (
        <>
          <Toggle
            label="Show my calendar on Today"
            hint="Today's events from your phone's calendars, including Google Calendar. Tend only reads them, and nothing leaves your phone."
            checked={s.calendarEnabled && status === "granted"}
            onChange={(v) => !busy && void enable(v)}
          />
          {s.calendarEnabled && status === "denied" && (
            <div className="row">
              <span className="row-hint warn">Calendar access was turned off. Allow it again to see events.</span>
              <button className="btn btn-soft" disabled={busy} onClick={() => void enable(true)}>
                Allow
              </button>
            </div>
          )}
          {s.calendarEnabled && status === "granted" && cals && cals.length > 1 && (
            <div className="row stack">
              <span className="row-text">
                <span className="row-label">Which calendars</span>
              </span>
              <div className="chips">
                {cals.map((c) => (
                  <button
                    key={c.id}
                    className={`chip cal-chip ${shown(c.id) ? "is-on" : ""}`}
                    aria-pressed={shown(c.id)}
                    title={c.account}
                    onClick={() => toggleCal(c.id)}
                  >
                    <span className="cal-dot" style={{ background: c.color }} />
                    {c.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
      <Toggle
        label="Offer a lighter day when it's stormy"
        hint="When you check in with thunder, Tend can offer to keep just one thing and let the rest wait until tomorrow. Doses never move."
        checked={s.stormyLightDay}
        onChange={(v) => set({ stormyLightDay: v })}
      />
      <Toggle
        label="Daily weather check-in"
        hint={
          s.moodCheckIn
            ? isAndroid
              ? `At ${s.moodCheckIn}, a notification asks how the weather is in you. Tap a face right there. Skipped if you've already checked in.`
              : `At ${s.moodCheckIn}, a small window asks how the weather is in you. Click a face. Skipped if you've already checked in.`
            : "A gentle daily ask about your mood, answered with one tap."
        }
        checked={!!s.moodCheckIn}
        onChange={(v) => set({ moodCheckIn: v ? "20:00" : null })}
      />
      {s.moodCheckIn && (
        <div className="row">
          <span className="row-label">Ask at</span>
          <input
            type="time"
            value={s.moodCheckIn}
            onChange={(e) => e.target.value && set({ moodCheckIn: e.target.value })}
            aria-label="Weather check-in time"
          />
        </div>
      )}
    </>
  );
}

/** The wren and its visitors. */
function WildlifeSettings() {
  const { settings: s, updateSettings: set } = useStore();
  const [name, setName] = useState(s.wildlifeName);
  useEffect(() => setName(s.wildlifeName), [s.wildlifeName]);
  const south = s.wildlifeSouth ?? guessSouth();
  return (
    <>
      <Toggle
        label="Wildlife in your garden"
        hint={
          s.wildlife
            ? s.wildlifeSince
              ? `${s.wildlifeName || "Pip"} the wren lives in your tree. Visitors come and go with the seasons; nothing ever leaves because you were away.`
              : "A wren moves in the first time you finish something."
            : "A little wren that lives in your tree, always content, and visitors through the seasons. Never needs looking after."
        }
        checked={s.wildlife}
        onChange={(v) => set({ wildlife: v })}
      />
      {s.wildlife && (
        <>
          <div className="row">
            <span className="row-text">
              <span className="row-label">Your wren's name</span>
            </span>
            <input
              className="row-input"
              value={name}
              maxLength={20}
              aria-label="Your wren's name"
              onChange={(e) => setName(e.target.value)}
              onBlur={() => set({ wildlifeName: name.trim() || "Pip" })}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            />
          </div>
          <Choice
            label="Seasons"
            hint="Which half of the world your garden's in, so swallows come in the right spring."
            value={south ? "south" : "north"}
            onChange={(v) => set({ wildlifeSouth: v === "south" })}
            options={[
              { value: "north", label: "North" },
              { value: "south", label: "South" },
            ]}
          />
          {s.wildlifeKept.length > 0 && (
            <div className="row">
              <span className="row-text">
                <span className="row-label">Staying for good</span>
                <span className="row-hint">Visitors you asked to stay. Tap one to let it come and go with the seasons again.</span>
              </span>
              <div className="chips">
                {s.wildlifeKept.map((k) => (
                  <button key={k} className="chip" onClick={() => set({ wildlifeKept: s.wildlifeKept.filter((x) => x !== k) })}>
                    {SPECIES_INFO[k as Species]?.name ?? k} ×
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}

/** "What's behind it" after a check-in, and the reasons it offers. */
function MoodReasonSettings() {
  const { settings: s, updateSettings: set, reduceMotion } = useStore();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Toggle
        label="Ask what's behind the weather"
        hint="After a check-in, tap what's behind it or type your own. Tend picks an emoji for new ones, and you can choose another."
        checked={s.moodReasons}
        onChange={(v) => set({ moodReasons: v })}
      />
      {s.moodReasons && (
        <>
          <button className="row disclosure" aria-expanded={open} onClick={() => setOpen(!open)}>
            <span className="row-text">
              <span className="row-label">Your reasons</span>
              <span className="row-hint">{s.moodReasonOptions.map((r) => r.emoji).join(" ") || "None yet"}</span>
            </span>
            <Chevron size={16} className={open ? "is-open" : ""} />
          </button>
          {open && (
            <div className="disclosure-body">
              <ReasonOptionsEditor options={s.moodReasonOptions} useModel={s.useModel} reduceMotion={reduceMotion} onChange={(next) => set({ moodReasonOptions: next })} />
              <button className="btn btn-quiet btn-small" onClick={() => set({ moodReasonOptions: DEFAULT_MOOD_REASONS })}>
                Back to the starting set
              </button>
            </div>
          )}
        </>
      )}
      <div className="row">
        <span className="row-text">
          <span className="row-label">Your weather map</span>
          <span className="row-hint">Charts, a calendar and a short note on each month.</span>
        </span>
        <button className="btn btn-soft" onClick={openInsights}>
          Open
        </button>
      </div>
    </>
  );
}

/** Reward sounds, each one previewable and switchable on its own. */
function SoundSettings() {
  const { settings: s, updateSettings: set } = useStore();
  const [open, setOpen] = useState(false);
  const mute = (name: SoundName, on: boolean) => {
    const next = on ? s.mutedSounds.filter((n) => n !== name) : [...s.mutedSounds, name];
    configureSound({ muted: next });
    set({ mutedSounds: next });
  };
  return (
    <>
      <Toggle label="Sounds" hint="Soft woodblock and marimba, made on the spot." checked={s.sound} onChange={(v) => set({ sound: v })} />
      {s.sound && (
        <>
          <div className="row">
            <span className="row-label">Volume</span>
            <input
              type="range"
              min={0.1}
              max={1}
              step={0.05}
              value={s.volume}
              onChange={(e) => set({ volume: Number(e.target.value) })}
              onPointerUp={() => preview("step")}
              aria-label="Volume"
            />
          </div>
          <button className="row disclosure" aria-expanded={open} onClick={() => setOpen(!open)}>
            <span className="row-text">
              <span className="row-label">Choose sounds</span>
              <span className="row-hint">
                {s.mutedSounds.length === 0
                  ? "All on."
                  : `${SOUND_NAMES.filter((n) => s.mutedSounds.includes(n.name))
                      .map((n) => n.label)
                      .join(", ")} off.`}
              </span>
            </span>
            <Chevron size={16} className={open ? "is-open" : ""} />
          </button>
          {open && (
            <div className="disclosure-body">
              {SOUND_NAMES.map((n) => {
                const on = !s.mutedSounds.includes(n.name);
                return (
                  <div className="row sound-row" key={n.name}>
                    <span className="row-text">
                      <span className="row-label">{n.label}</span>
                      <span className="row-hint">{n.hint}</span>
                    </span>
                    <button className="btn btn-quiet" aria-label={`Play ${n.label}`} onClick={() => preview(n.name)}>
                      Play
                    </button>
                    <button role="switch" aria-checked={on} aria-label={n.label} className={`switch ${on ? "is-on" : ""}`} onClick={() => mute(n.name, !on)}>
                      <motion.span className="switch-knob" layout transition={{ type: "spring", stiffness: 500, damping: 32 }} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </>
  );
}

/** The on-device suggestion model: one row, Download or Remove. Using it and having it are the same thing. */
function ModelRow() {
  const { settings: s, updateSettings: set, toast } = useStore();
  const [model, setModel] = useState<{ present: boolean; size: number } | null>(null);
  const [dl, setDl] = useState<[number, number] | null>(null);

  useEffect(() => {
    void api
      .modelStatus()
      .then(setModel)
      .catch(() => null);
    const un = listen<[number, number]>("model-progress", (e) => setDl(e.payload));
    return () => void un.then((f) => f());
  }, []);

  async function download() {
    set({ useModel: true, modelConsent: true });
    setDl([0, model?.size ?? 1]);
    try {
      await api.downloadModel();
      setModel(await api.modelStatus());
      toast("The suggestion helper is ready. It only wakes up to suggest seeds and steps.");
    } catch {
      toast("The download stopped. Try again when the connection is steady.");
    }
    setDl(null);
  }

  async function remove() {
    set({ useModel: false, modelConsent: false });
    await api.deleteModel().catch(() => null);
    setModel(await api.modelStatus().catch(() => null));
  }

  const mb = Math.round((model?.size ?? 35e6) / 1e6);
  const on = !!model?.present && s.useModel;
  return (
    <div className="row">
      <span className="row-text">
        <span className="row-label">Suggestion helper</span>
        <span className="row-hint">
          {on
            ? "Runs on your device. It wakes for a split second to suggest seeds and steps, then unloads."
            : model?.present
              ? "Downloaded but not in use, so Tend makes a simple guess."
              : `About ${mb} MB, downloaded once${isAndroid ? ", best on Wi-Fi" : ""}. It runs on your device and nothing is sent anywhere. Until then Tend makes a simple guess.`}
        </span>
        {dl && (
          <span className="progress-line">
            <motion.span animate={{ width: `${(dl[0] / Math.max(1, dl[1])) * 100}%` }} />
          </span>
        )}
      </span>
      {model?.present ? (
        <span className="row-actions">
          {!s.useModel && (
            <button className="btn btn-soft" onClick={() => set({ useModel: true, modelConsent: true })}>
              Use it
            </button>
          )}
          <button className="btn btn-quiet" onClick={() => void remove()}>
            Remove
          </button>
        </span>
      ) : (
        <button className="btn btn-soft" disabled={!!dl} onClick={() => void download()}>
          {dl ? `${Math.round((dl[0] / Math.max(1, dl[1])) * 100)}%` : "Download"}
        </button>
      )}
    </div>
  );
}

/** What the desktop's QR code carries: every address, the port, the code and who it is. */
function pairPayload(info: SyncInfo) {
  const q = new URLSearchParams({ h: info.addresses.join(","), p: String(info.port), c: info.code, d: info.deviceId, n: info.name });
  return `tend:pair?${q}`;
}

function parsePayload(text: string) {
  if (!text.startsWith("tend:pair?")) return null;
  const q = new URLSearchParams(text.slice("tend:pair?".length));
  const hosts = (q.get("h") ?? "").split(",").filter(Boolean);
  const code = q.get("c") ?? "";
  if (!hosts.length || code.length !== 6) return null;
  return { hosts, port: Number(q.get("p") ?? 47821), code, device: q.get("d"), name: q.get("n") ?? "your computer" };
}

function PairQr({ info }: { info: SyncInfo }) {
  const [svg, setSvg] = useState("");
  const payload = pairPayload(info);
  useEffect(() => {
    void QRCode.toString(payload, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#26352e", light: "#f5f8f3" } }).then(setSvg);
  }, [payload]);
  // This device only accepts pairing while its code is actually on screen.
  useEffect(() => {
    const open = () => document.visibilityState === "visible" && void api.openPairing().catch(() => null);
    open();
    const t = window.setInterval(open, 60_000);
    document.addEventListener("visibilitychange", open);
    return () => {
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", open);
    };
  }, []);
  return (
    <motion.div
      className="pair-qr"
      key={info.code}
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      role="img"
      aria-label="QR code for pairing your phone"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

function UpdatesGroup() {
  const { settings: s, updateSettings: set } = useStore();
  const [state, setState] = useState(appUpdater.getState());
  const [version, setVersion] = useState("");
  useEffect(() => appUpdater.subscribe(setState), []);
  useEffect(() => void appVersion().then(setVersion), []);
  if (!appUpdater.supported) return null;

  const working = state.status === "checking" || state.status === "downloading" || state.status === "installing";
  const canInstall = state.status === "available" || state.status === "ready" || state.status === "failed";
  const hint: Record<typeof state.status, string> = {
    idle: s.autoUpdate ? "New versions download by themselves. Tend asks before installing." : "Tend looks for new versions when it starts.",
    checking: "Looking for a new version…",
    none: "You have the newest version.",
    available: `Version ${state.version} is available.`,
    downloading: `Downloading version ${state.version}…`,
    ready: `Version ${state.version} is ready to install.`,
    installing: `Installing version ${state.version}…`,
    failed: `Version ${state.version} could not be fetched. Try again.`,
  };
  return (
    <Group title="Updates" id="updates" tab="data" keywords="version stable unstable channel download install">
      <div className="row">
        <span className="row-text">
          <span className="row-label">Tend {version}</span>
          <span className="row-hint">{hint[state.status]}</span>
        </span>
        {canInstall ? (
          <button className="btn btn-primary" onClick={() => void appUpdater.install()}>
            {isAndroid ? "Install update" : "Install and restart"}
          </button>
        ) : (
          <button className="btn btn-soft" disabled={working} onClick={() => void appUpdater.check(false)}>
            Check now
          </button>
        )}
      </div>
      <Toggle label="Download updates automatically" checked={s.autoUpdate} onChange={(v) => set({ autoUpdate: v })} />
      <Choice
        label="Update channel"
        hint={
          s.updateChannel === "unstable"
            ? "Unstable: new things first, while they're still being tried. Expect the odd rough edge. Your data stays put either way."
            : "Stable: tried-and-tested releases only."
        }
        value={s.updateChannel}
        onChange={(v) => set({ updateChannel: v })}
        options={[
          { value: "stable", label: "Stable" },
          { value: "unstable", label: "Unstable" },
        ]}
      />
    </Group>
  );
}

export function SettingsView() {
  const nav = useSettingsNav();
  const { settings: s, updateSettings: set, toast, refresh } = useStore();
  const [sync, setSync] = useState<SyncInfo | null>(null);
  const [hosts, setHosts] = useState<Hello[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [pairHost, setPairHost] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [autostart, setAutostart] = useState<boolean | null>(null);

  useEffect(() => {
    void api
      .syncInfo()
      .then(setSync)
      .catch(() => null);
    if (!isAndroid)
      void autostartEnabled()
        .then(setAutostart)
        .catch(() => null);
    const t = window.setInterval(
      () =>
        void api
          .syncInfo()
          .then(setSync)
          .catch(() => null),
      15000,
    );
    return () => window.clearInterval(t);
  }, []);

  // Keeps per-sound muting live even before the store passes it along on start.
  useEffect(() => configureSound({ muted: s.mutedSounds }), [s.mutedSounds]);

  async function find() {
    setSearching(true);
    setHosts(await api.discover().catch(() => []));
    setSearching(false);
  }

  async function pair() {
    setBusy(true);
    try {
      const [host, port] = pairHost.trim().split(":");
      const peer = await api.pair(host, port ? Number(port) : null, code);
      toast(`Paired with ${peer.name}. Your reminders now sync.`);
      setCode("");
      setPairHost("");
      setHosts(null);
      setSync(await api.syncInfo());
      await refresh();
    } catch (e) {
      toast(String(e));
    }
    setBusy(false);
  }

  async function scanQr() {
    try {
      let perm = await scanPermissions();
      if (perm !== "granted") perm = await requestScan();
      if (perm !== "granted") {
        toast("Tend needs the camera to read the code. You can type the code instead.");
        return;
      }
      document.documentElement.classList.add("is-scanning");
      const res = await scan({ windowed: false, formats: [Format.QRCode] });
      const p = parsePayload(res.content);
      if (!p) {
        toast("That isn't a Tend pairing code. Open Settings on your computer and scan the code there.");
        return;
      }
      setBusy(true);
      const peer = await api.pairAny(p.hosts, p.port, p.code, p.device);
      sounds.finish();
      toast(`Paired with ${peer.name}. Your reminders now sync.`);
      setSync(await api.syncInfo());
      await refresh();
    } catch (e) {
      if (!String(e).toLowerCase().includes("cancel")) toast(String(e));
    } finally {
      document.documentElement.classList.remove("is-scanning");
      setBusy(false);
    }
  }

  async function syncNow() {
    setBusy(true);
    const out = await api.syncNow().catch((e) => ({ peers: 0, ok: 0, changed: 0, errors: [String(e)] }));
    setBusy(false);
    if (out.errors.length) toast(out.errors[0]);
    else toast(out.changed ? `Synced ${out.changed} changes.` : "Everything is already in sync.");
    setSync(await api.syncInfo());
    await refresh();
  }

  const servers = sync?.peers.filter((p) => !p.isClient) ?? [];
  const clients = sync?.peers.filter((p) => p.isClient) ?? [];

  const isSearching = !!nav.query.trim();
  return (
    <div className="view settings">
      <header className="view-head">
        <h1>Settings</h1>
      </header>

      <PermissionBanner />

      <SettingsNav tab={nav.tab} setTab={nav.setTab} query={nav.query} setQuery={nav.setQuery} />
      {isSearching && nav.found === 0 && (
        <p className="settings-empty">
          Nothing called “{nav.query.trim()}” here. Try another word, like <em>sound</em>, <em>quiet</em> or <em>backup</em>.
        </p>
      )}

      <SettingsFilter.Provider value={{ tab: nav.tab, query: nav.query, report: nav.report }}>
      <Group
        title="Nudges"
        id="nudges"
        tab="nudges"
        keywords="notifications reminders chime unlock quiet hours preset gentle persistent fine-tune sound vibrate silent heads-up dose repeat remind again autostart start with windows"
      >
        <NudgeSettings autostart={autostart} setAutostart={setAutostart} />
      </Group>

      <Group title="Your day" id="your-day" tab="day" keywords="calendar mood weather check-in stormy reasons emoji">
        <DaySettings />
        <MoodReasonSettings />
      </Group>

      <Group title="Look and feel" id="look" tab="look" keywords="sounds volume theme dark light night day motion animation">
        <SoundSettings />
        <Choice
          label="Reduce motion"
          value={s.reduceMotion}
          onChange={(v) => set({ reduceMotion: v })}
          options={[
            { value: "system", label: "Match my phone" },
            { value: "on", label: "On" },
            { value: "off", label: "Off" },
          ]}
        />
        <Choice
          label="Theme"
          value={s.theme}
          onChange={(v) => set({ theme: v })}
          options={[
            { value: "system", label: "Match my phone" },
            { value: "light", label: "Day" },
            { value: "dark", label: "Night" },
          ]}
        />
      </Group>

      <Group title="Garden wildlife" id="wildlife" tab="look" keywords="wren pet bird animals visitors nest field notes hemisphere seasons">
        <WildlifeSettings />
      </Group>

      <Group title="Rewards" id="rewards" tab="look" keywords="seeds golden bonus helper model ai suggestions">
        <Toggle
          label="Surprise golden seeds"
          hint="Sometimes finishing something gives a few extra seeds. Never needed, never taken away."
          checked={s.surpriseBonuses}
          onChange={(v) => set({ surpriseBonuses: v })}
        />
        <ModelRow />
      </Group>

      <Group title="Movement" id="movement" tab="movement" keywords="steps workouts exercise fitness health connect google fit goal">
        <MovementSettings />
      </Group>

      <Group title="Your data" id="data" tab="data" keywords="backup restore export import passphrase medicine diary">
        <BackupSettings />
        <HealthData />
      </Group>

      <Group title="Sync between devices" id="sync" tab="data" keywords="pair qr code computer phone wi-fi">
        {sync?.hosting && (
          <div className="pair-host">
            <p className="row-hint">
              On your phone, open Tend → Settings → Sync between devices and scan this code, or type the 6 digits. Both devices need to be on the same Wi-Fi.
            </p>
            <div className="pair-both">
              <PairQr info={sync} />
              <div className="pair-code" aria-label={`Pairing code ${sync.code}`}>
                {sync.code.split("").map((c, i) => (
                  <span key={i}>{c}</span>
                ))}
              </div>
            </div>
            <p className="row-hint">This computer: {sync.addresses.join(", ") || "no network"}</p>
            {clients.length > 0 && (
              <ul className="peer-list">
                {clients.map((p) => (
                  <li key={p.id}>
                    <span>
                      {p.name}
                      <span className="row-hint"> · {p.lastSync ? `synced ${formatDistanceToNow(p.lastSync)} ago` : "paired"}</span>
                    </span>
                    <button className="btn btn-quiet" onClick={() => void api.forgetPeer(p.id).then(() => api.syncInfo().then(setSync))}>
                      Unpair
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {servers.length > 0 && (
          <ul className="peer-list">
            {servers.map((p) => (
              <li key={p.id}>
                <span>
                  {p.name}
                  <span className="row-hint"> · {p.lastSync ? `synced ${formatDistanceToNow(p.lastSync)} ago` : "not synced yet"}</span>
                </span>
                <span>
                  <button className="btn btn-soft" disabled={busy} onClick={() => void syncNow()}>
                    <Sync size={15} /> Sync now
                  </button>
                  <button className="btn btn-quiet" onClick={() => void api.forgetPeer(p.id).then(() => api.syncInfo().then(setSync))}>
                    Unpair
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}

        <div className="pair-join">
          <p className="row-label">{sync?.hosting ? "Or join another device" : "Pair with your computer"}</p>
          <p className="row-hint">Open Tend on your computer and go to Settings to see its code.</p>
          <div className="chips">
            {isAndroid && (
              <button className="btn btn-primary" onClick={() => void scanQr()} disabled={busy}>
                Scan QR code
              </button>
            )}
            <button className="btn btn-soft" onClick={() => void find()} disabled={searching}>
              {searching ? "Looking on this Wi-Fi…" : "Find my computer"}
            </button>
          </div>
          {hosts && hosts.length === 0 && <p className="row-hint">Nothing found. Type the computer's address shown in its Settings instead.</p>}
          {hosts && hosts.length > 0 && (
            <div className="chips">
              {hosts.map((h) => (
                <button key={h.deviceId} className={`chip ${pairHost.startsWith(h.host) ? "is-on" : ""}`} onClick={() => setPairHost(`${h.host}:${h.port}`)}>
                  {h.name}
                </button>
              ))}
            </div>
          )}
          <div className="pair-form">
            <input placeholder="Address, e.g. 192.168.1.20" value={pairHost} onChange={(e) => setPairHost(e.target.value)} aria-label="Computer address" />
            <input
              placeholder="6-digit code"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              aria-label="Pairing code"
            />
            <button className="btn btn-primary" disabled={busy || !pairHost || code.length !== 6} onClick={() => void pair()}>
              Pair
            </button>
          </div>
        </div>
      </Group>

      <UpdatesGroup />
      </SettingsFilter.Provider>

      <p className="about">Tend keeps everything on your devices. Nothing is sent anywhere except between your own paired devices.</p>
    </div>
  );
}
