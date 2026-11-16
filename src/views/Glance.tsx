import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { emit, listen } from "@tauri-apps/api/event";
import { api, type DoseSlot, type Reminder, type Snapshot } from "../lib/api";
import { waiting } from "../lib/native";
import { clock } from "../lib/dates";
import { defaultSettings, type Settings } from "../lib/settings";
import { moodEntry, todaysWeather, weatherOf, type Weather } from "../lib/weather";
import { WeatherFaces } from "../components/WeatherCheckIn";
import { Check, Close, Leaf } from "../components/Icons";

/** Rows shown before "and N more". */
const MAX_ROWS = 5;
/** Long enough to see a tick land before the row (or the whole card) goes. */
const LINGER_MS = 1400;

function minutesOf(hm: string) {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
}

/** The weather check-in belongs here once its time has come, until it's answered. */
function moodWanted(s: Settings, snap: Snapshot) {
  if (!s.moodCheckIn || todaysWeather(snap.entries)) return false;
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes() >= minutesOf(s.moodCheckIn);
}

/**
 * The desktop's corner glance (index.html?glance=1): what's waiting, in one calm card, instead of
 * a pile of notifications. The scheduler opens it; it sizes itself, never takes focus, and closes
 * (freeing its memory) when you're done or after a while untouched.
 */
export function Glance() {
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [done, setDone] = useState<string[]>([]);
  const [weather, setWeather] = useState<Weather | null>(null);
  const [showMood, setShowMood] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const hovering = useRef(false);
  const hideTimer = useRef<number | undefined>(undefined);

  const close = () => void api.glanceClose().catch(() => null);

  const armHide = (s: Settings) => {
    window.clearTimeout(hideTimer.current);
    if (s.overlayHideAfter > 0 && !hovering.current) {
      hideTimer.current = window.setTimeout(close, s.overlayHideAfter * 1000);
    }
  };

  const load = async () => {
    const s = { ...defaultSettings, ...(await api.getSettings().catch(() => ({}))) } as Settings;
    if (s.theme === "system") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", s.theme);
    const next = await api.snapshot().catch(() => null);
    setSettings(s);
    setSnap(next);
    setDone([]);
    if (next) {
      setWeather(todaysWeather(next.entries));
      setShowMood(moodWanted(s, next));
    }
    armHide(s);
  };

  useEffect(() => {
    document.documentElement.setAttribute("data-glance", "");
    void load();
    const offShown = listen("glance-shown", () => void load()).catch(() => null);
    // Ticked off on the phone or in the main window: keep the list true.
    const offData = listen("data-changed", () => void load()).catch(() => null);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", esc);
    return () => {
      void offShown.then((f) => f?.());
      void offData.then((f) => f?.());
      window.removeEventListener("keydown", esc);
      window.clearTimeout(hideTimer.current);
    };
  }, []);

  // The window is exactly as tall as the card; Rust places it in the corner and shows it.
  useLayoutEffect(() => {
    const el = root.current;
    if (!el || !snap) return;
    const fit = () => void api.glanceFit(Math.ceil(el.getBoundingClientRect().height)).catch(() => null);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [snap]);

  const doses: DoseSlot[] = (snap?.doses ?? []).filter((d) => d.status === "due" && !d.extra && !done.includes(d.id));
  const tasks: Reminder[] = waiting(snap?.reminders ?? []).filter((r) => !done.includes(r.id));
  const rows = doses.length + tasks.length;
  const shownTasks = tasks.slice(0, Math.max(0, MAX_ROWS - doses.length));
  const more = rows - doses.length - shownTasks.length;

  // Nothing left to show: tuck away.
  useEffect(() => {
    if (snap && rows === 0 && !showMood) {
      // After ticking the last thing off, or "Show it now" with nothing waiting: a moment of "All clear".
      const t = window.setTimeout(close, done.length ? LINGER_MS : 4000);
      return () => window.clearTimeout(t);
    }
  }, [snap, rows, showMood, done.length]);

  async function act(id: string, work: () => Promise<unknown>) {
    setDone((d) => [...d, id]);
    try {
      await work();
      void emit("data-changed").catch(() => null);
    } catch (e) {
      console.error(e);
      setDone((d) => d.filter((x) => x !== id));
    }
  }

  async function pickMood(v: Weather) {
    setWeather(v);
    try {
      const fresh = await api.snapshot();
      await api.saveEntry(moodEntry(fresh.entries, v));
      void emit("data-changed").catch(() => null);
    } catch (e) {
      console.error(e);
    }
    window.setTimeout(() => setShowMood(false), LINGER_MS);
  }

  if (!snap) return null;
  const title =
    doses.length === 1 && tasks.length === 0
      ? "Your medicine is ready"
      : rows === 0
        ? "All clear"
        : rows === 1
          ? "One thing is waiting"
          : `${rows} things are waiting`;

  return (
    <div
      ref={root}
      className="glance-wrap"
      onMouseEnter={() => {
        hovering.current = true;
        window.clearTimeout(hideTimer.current);
      }}
      onMouseLeave={() => {
        hovering.current = false;
        armHide(settings);
      }}
    >
      <div className="glance">
      <header className="glance-head">
        <Leaf size={16} />
        <span>{title}</span>
        <button className="glance-x" onClick={close} aria-label="Not now">
          <Close size={14} />
        </button>
      </header>

      {rows > 0 && (
        <ul className="glance-list">
          {doses.map((d) => (
            <li key={d.id} className="glance-row is-dose">
              <span className="glance-text">
                {d.name}
                <small>
                  {d.amount} {d.form} · {clock(d.time)}
                </small>
              </span>
              <button className="glance-do" onClick={() => void act(d.id, () => api.takeDose(d.id))}>
                Take
              </button>
            </li>
          ))}
          {shownTasks.map((r) => {
            const next = r.steps.find((s) => !s.done);
            return (
              <li key={r.id} className="glance-row">
                <button className="glance-tick" onClick={() => void act(r.id, () => api.complete(r.id))} aria-label={`Done: ${r.title}`}>
                  <Check size={14} />
                </button>
                <span className="glance-text">
                  {r.title}
                  {(next || r.time) && <small>{next ? `Next tiny step: ${next.title}` : clock(r.time!)}</small>}
                </span>
              </li>
            );
          })}
          {more > 0 && <li className="glance-more">and {more} more in Tend</li>}
        </ul>
      )}

      {showMood && (
        <div className="glance-mood">
          <p>
            How's the weather in you?
            <small>{weatherOf(weather)?.line ?? "Rain and sun both help the tree grow."}</small>
          </p>
          <WeatherFaces value={weather} compact onPick={(v) => void pickMood(v)} />
        </div>
      )}

      <footer className="glance-foot">
        <button className="glance-link" onClick={() => void api.glanceOpenMain().catch(() => null)}>
          Open Tend
        </button>
      </footer>
      </div>
    </div>
  );
}
