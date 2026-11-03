import { useEffect, useMemo, useRef, useState } from "react";
import { emit } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { api, type Suggestion } from "../lib/api";
import { defaultSettings, type Settings } from "../lib/settings";
import { clock, dayName, today } from "../lib/dates";
import { parseWhen } from "../components/Editor";
import { Calendar, Seed } from "../components/Icons";

/** The reward used when the suggestion takes longer than a moment (or isn't available). */
const DEFAULT_REWARD = 10;
const SUGGEST_WAIT_MS = 1200;

const hide = () => {
  try {
    void getCurrentWindow()
      .hide()
      .catch(() => null);
  } catch {
    /* browser preview: there's no window to hide */
  }
};

/**
 * The tiny always-on-top window behind the desktop hotkey (index.html?quick=1): type, Enter, gone.
 * It runs without the main store so it costs nothing while hidden.
 */
export function QuickAdd() {
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const settings = useRef<Settings>(defaultSettings);
  const input = useRef<HTMLInputElement>(null);
  const when = useMemo(() => parseWhen(text), [text]);

  useEffect(() => {
    document.documentElement.setAttribute("data-quick", "");
    void api
      .getSettings()
      .then((s) => {
        settings.current = { ...defaultSettings, ...s } as Settings;
        const theme = settings.current.theme;
        if (theme === "system") document.documentElement.removeAttribute("data-theme");
        else document.documentElement.setAttribute("data-theme", theme);
      })
      .catch(() => null);
    input.current?.focus();
    // The window is shown and hidden, not recreated: start fresh each time it comes back.
    let stop: (() => void) | undefined;
    try {
      void getCurrentWindow()
        .onFocusChanged(({ payload: focused }) => {
          if (!focused) return;
          setNote(null);
          input.current?.focus();
          input.current?.select();
        })
        .then((f) => (stop = f))
        .catch(() => null);
    } catch {
      /* preview */
    }
    return () => stop?.();
  }, []);

  async function save() {
    const title = (when?.cleaned || text).trim();
    if (!title || saving) return;
    setSaving(true);
    // A quick suggestion if the model answers in a moment; otherwise a fair default.
    const suggestion = await Promise.race([
      api.suggest(title, "", [], settings.current.useModel).catch(() => null),
      new Promise<null>((r) => setTimeout(() => r(null), SUGGEST_WAIT_MS)),
    ]).then((s) => s as Suggestion | null);
    try {
      await api.save({
        id: null,
        title,
        notes: "",
        date: when?.date ?? today(),
        time: when?.time ?? null,
        steps: [],
        reward: suggestion?.reward ?? DEFAULT_REWARD,
        suggested: suggestion?.reward ?? null,
        repeat: null,
        exercise: null,
      });
      // Let the main window refresh its lists.
      void emit("data-changed").catch(() => null);
      setText("");
      hide();
    } catch (e) {
      console.error(e);
      setNote("That didn't save. Try again in a moment.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="quick">
      <input
        ref={input}
        className="quick-input"
        placeholder="Call the dentist tomorrow at 10"
        value={text}
        aria-label="New reminder"
        onChange={(e) => {
          setText(e.target.value);
          setNote(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") void save();
          if (e.key === "Escape") {
            setText("");
            hide();
          }
        }}
        disabled={saving}
      />
      <p className="quick-hint" aria-live="polite">
        {note ?? (
          <>
            <span>
              <Calendar size={13} /> {dayName(when?.date ?? today())}
              {when?.time && `, ${clock(when.time)}`}
            </span>
            <span>
              <Seed size={12} /> {saving ? "Planting…" : "Enter to plant · Esc to close"}
            </span>
          </>
        )}
      </p>
    </div>
  );
}
