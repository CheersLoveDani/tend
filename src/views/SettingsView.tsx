import { useEffect, useRef, useState, type ReactNode } from "react";
import { listen } from "@tauri-apps/api/event";
import { motion } from "motion/react";
import { api, isAndroid, type Hello, type SyncInfo } from "../lib/api";
import { useStore } from "../lib/store";
import { native, type PermissionKind, type Permissions } from "../lib/native";
import { sounds } from "../lib/sound";
import { Minus, Plus, Sync } from "../components/Icons";
import { appUpdater, appVersion } from "../lib/updater";
import { backup, type BackupSource, type BackupStatus } from "../lib/backup";
import { fitness, fitSupported, minuteMilestones, stepMilestones, type FitStatus } from "../lib/fitness";
import { today } from "../lib/dates";
import { format, formatDistanceToNow, parseISO } from "date-fns";
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

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="settings-group">
      <h2 className="section-title">{title}</h2>
      <div className="settings-card">{children}</div>
    </section>
  );
}

function Choice<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="row">
      <span className="row-label">{label}</span>
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
          <button className="btn btn-quiet" disabled={busy} onClick={() => void navigator.clipboard?.readText().then(importText).catch(() => toast("Couldn't read the clipboard"))}>
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
            <input className="field-input" type="password" autoComplete="new-password" placeholder="Passphrase" value={pass} onChange={(e) => setPass(e.target.value)} />
            <input className="field-input" type="password" autoComplete="new-password" placeholder="Same again" value={pass2} onChange={(e) => setPass2(e.target.value)} />
            <button
              className="btn btn-primary"
              disabled={busy || !passOk}
              onClick={() =>
                void step(async () => {
                  await backup.setPassphrase(pass);
                  setPass("");
                  setPass2("");
                  setChanging(false);
                }, changing ? "New passphrase set. Older backups still open with the old one." : "Passphrase set")
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
            <input className="field-input" type="password" autoComplete="current-password" placeholder="Its passphrase" value={restorePass} onChange={(e) => setRestorePass(e.target.value)} />
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

function Stepper({ label, hint, value, step, min, max, unit, onChange }: { label: string; hint?: string; value: number; step: number; min: number; max: number; unit: string; onChange: (v: number) => void }) {
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
  useEffect(() => void fitness.status().then(setSt).catch(() => null), []);

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
        hint={`${lead(stepPlan).map((m) => `${m.pct}%`).join(", ")} pay ${lead(stepPlan)[0].seeds} each, the goal pays ${stepPlan.find((m) => m.pct === 100)!.seeds}, and every extra quarter pays ${stepPlan.at(-1)!.seeds}.`}
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
            ? `Counting since ${format(parseISO(s.fitSince!), "d MMM")}. ${rules}`
            : `From Google Fit, Samsung Health, Fitbit or any app that saves to Health Connect. Tend only reads, and nothing leaves your phone. ${rules}`;

  return (
    <>
      <div className="row">
        <span className="row-text">
          <span className="row-label">Steps & workouts</span>
          <span className="row-hint">{hint}</span>
          {on && (!st!.steps || !st!.workouts) && (
            <span className="row-hint warn">{st!.steps ? "Workouts aren't allowed, so only steps count." : "Steps aren't allowed, so only workouts count."}</span>
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
      {on && goals}
    </>
  );
}

const PERMS: { kind: PermissionKind; label: string; hint: string }[] = [
  { kind: "notifications", label: "Notifications", hint: "Needed for reminders and the 'still to do' notification." },
  { kind: "exactAlarm", label: "On-time alarms", hint: "Lets reminders arrive at the exact minute." },
  { kind: "overlay", label: "Show over other apps", hint: "Lets the 'before you dive in' screen appear when you unlock." },
  { kind: "fullScreenIntent", label: "Full-screen reminders", hint: "Backup way to show the unlock screen." },
  { kind: "batteryUnrestricted", label: "Keep running in the background", hint: "Stops Android from silencing Tend. It only wakes for your reminders." },
];

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
    <Group title="Updates">
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
    </Group>
  );
}

export function SettingsView() {
  const { settings: s, updateSettings: set, toast, refresh } = useStore();
  const [perms, setPerms] = useState<Permissions | null>(null);
  const [sync, setSync] = useState<SyncInfo | null>(null);
  const [hosts, setHosts] = useState<Hello[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [pairHost, setPairHost] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [model, setModel] = useState<{ present: boolean; size: number } | null>(null);
  const [dl, setDl] = useState<[number, number] | null>(null);
  const [autostart, setAutostart] = useState<boolean | null>(null);

  useEffect(() => {
    void native.permissions().then(setPerms).catch(() => null);
    void api.syncInfo().then(setSync).catch(() => null);
    void api.modelStatus().then(setModel).catch(() => null);
    if (!isAndroid) void autostartEnabled().then(setAutostart).catch(() => null);
    const un = listen<[number, number]>("model-progress", (e) => setDl(e.payload));
    const t = window.setInterval(() => void api.syncInfo().then(setSync).catch(() => null), 15000);
    return () => {
      void un.then((f) => f());
      window.clearInterval(t);
    };
  }, []);

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

  async function download() {
    setDl([0, model?.size ?? 1]);
    try {
      await api.downloadModel();
      setModel(await api.modelStatus());
      toast("The tiny model is ready. It only wakes up to suggest rewards.");
    } catch (e) {
      toast(`Download stopped: ${e}`);
    }
    setDl(null);
  }

  const servers = sync?.peers.filter((p) => !p.isClient) ?? [];
  const clients = sync?.peers.filter((p) => p.isClient) ?? [];

  return (
    <div className="view settings">
      <header className="view-head">
        <h1>Settings</h1>
      </header>

      <Group title="Sound and motion">
        <Toggle label="Reward sounds" hint="Soft woodblock and marimba." checked={s.sound} onChange={(v) => set({ sound: v })} />
        {s.sound && (
          <div className="row">
            <span className="row-label">Volume</span>
            <input
              type="range"
              min={0.1}
              max={1}
              step={0.05}
              value={s.volume}
              onChange={(e) => set({ volume: Number(e.target.value) })}
              onPointerUp={() => sounds.step(2)}
              aria-label="Volume"
            />
          </div>
        )}
        <Choice
          label="Reduce motion"
          value={s.reduceMotion}
          onChange={(v) => set({ reduceMotion: v })}
          options={[
            { value: "system", label: "Like my device" },
            { value: "on", label: "On" },
            { value: "off", label: "Off" },
          ]}
        />
        <Choice
          label="Theme"
          value={s.theme}
          onChange={(v) => set({ theme: v })}
          options={[
            { value: "system", label: "Auto" },
            { value: "light", label: "Day" },
            { value: "dark", label: "Night" },
          ]}
        />
      </Group>

      <Group title="Rewards">
        <Toggle
          label="Surprise golden seeds"
          hint="Sometimes finishing something gives a few extra seeds. Never needed, never taken away."
          checked={s.surpriseBonuses}
          onChange={(v) => set({ surpriseBonuses: v })}
        />
        <Toggle label="Use the tiny model" hint="Suggests reward values on this device. Off uses a simple estimate." checked={s.useModel} onChange={(v) => set({ useModel: v })} />
        <div className="row">
          <span className="row-text">
            <span className="row-label">Tiny model</span>
            <span className="row-hint">
              {model?.present
                ? "Downloaded. Wakes for a split second to suggest seeds and steps, then unloads."
                : `About ${Math.round((model?.size ?? 0) / 1e6)} MB, downloaded once. Until then Tend estimates.`}
            </span>
            {dl && (
              <span className="progress-line">
                <motion.span animate={{ width: `${(dl[0] / Math.max(1, dl[1])) * 100}%` }} />
              </span>
            )}
          </span>
          {model?.present ? (
            <button className="btn btn-quiet" onClick={() => void api.deleteModel().then(() => api.modelStatus().then(setModel))}>
              Remove
            </button>
          ) : (
            <button className="btn btn-soft" disabled={!!dl} onClick={() => void download()}>
              {dl ? `${Math.round((dl[0] / Math.max(1, dl[1])) * 100)}%` : "Download"}
            </button>
          )}
        </div>
      </Group>

      <Group title="Backup">
        <BackupSettings />
      </Group>

      <Group title="Medicine">
        <HealthData />
      </Group>

      <Group title="Movement">
        <MovementSettings />
      </Group>

      <Group title="Reminders">
        <Choice
          label="Chime while things wait"
          value={String(s.chimeMinutes)}
          onChange={(v) => set({ chimeMinutes: Number(v) })}
          options={[
            { value: "0", label: "Off" },
            { value: "15", label: "15 min" },
            { value: "30", label: "30 min" },
            { value: "60", label: "Hour" },
          ]}
        />
        {isAndroid && (
          <>
            <Toggle
              label="Keep a 'still to do' notification"
              hint="A quiet notification that stays while things are waiting. It comes back if swiped away."
              checked={s.persistentNotification}
              onChange={(v) => set({ persistentNotification: v })}
            />
            <Toggle
              label="Show what's waiting when I unlock"
              hint="A calm screen before you dive into your phone."
              checked={s.nagOnUnlock}
              onChange={(v) => set({ nagOnUnlock: v })}
            />
            {s.nagOnUnlock && (
              <Choice
                label="Show it"
                value={String(s.nagEvery < 0 && s.chimeMinutes === 0 ? 30 : s.nagEvery)}
                onChange={(v) => set({ nagEvery: Number(v) })}
                options={[
                  ...(s.chimeMinutes > 0 ? [{ value: "-1", label: "Each chime" }] : []),
                  { value: "0", label: "Every unlock" },
                  { value: "30", label: "30 min" },
                  { value: "60", label: "Hour" },
                ]}
              />
            )}
          </>
        )}
        {!isAndroid && autostart !== null && (
          <Toggle
            label="Start with Windows"
            hint="Tend waits quietly in the tray so reminders arrive on time."
            checked={autostart}
            onChange={(v) => void (v ? enableAutostart() : disableAutostart()).then(() => setAutostart(v)).catch((e) => toast(String(e)))}
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
              <input type="time" value={s.quietHours.start} onChange={(e) => set({ quietHours: { ...s.quietHours!, start: e.target.value } })} aria-label="Quiet hours start" />
              <span>to</span>
              <input type="time" value={s.quietHours.end} onChange={(e) => set({ quietHours: { ...s.quietHours!, end: e.target.value } })} aria-label="Quiet hours end" />
            </span>
          </div>
        )}
      </Group>

      {isAndroid && perms && (
        <Group title="Phone permissions">
          {PERMS.map((p) => (
            <div className="row" key={p.kind}>
              <span className="row-text">
                <span className="row-label">{p.label}</span>
                <span className="row-hint">{p.hint}</span>
              </span>
              {perms[p.kind] ? (
                <span className="ok">Allowed</span>
              ) : (
                <button className="btn btn-soft" onClick={() => void native.request(p.kind).then(setPerms).catch(() => null)}>
                  Allow
                </button>
              )}
            </div>
          ))}
        </Group>
      )}

      <Group title="Sync between devices">
        {sync?.hosting && (
          <div className="pair-host">
            <p className="row-hint">On your phone, open Tend → Settings → Sync and scan this code, or type the 6 digits. Both devices need to be on the same Wi-Fi.</p>
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

      <p className="about">Tend keeps everything on your devices. Nothing is sent anywhere except between your own paired devices.</p>
    </div>
  );
}
