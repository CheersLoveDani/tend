// Encrypted backups. Desktop writes dated files into a folder; Android overwrites one file
// the user picked (Google Drive works, and keeps its own version history).
import { invoke } from "@tauri-apps/api/core";
import { isAndroid } from "./api";

export interface BackupStatus {
  hasKey: boolean;
  dir: string | null;
  last: number | null;
  error: string | null;
}

export interface Restored {
  reminders: number;
  items: number;
  changed: number;
  createdAt: number;
}

export type BackupSource = { name: string; data?: string; path?: string };

const P = "plugin:tend-native|";
/** A backup older than this is refreshed the next time Tend is opened. */
const DAILY_MS = 20 * 60 * 60 * 1000;

export const backup = {
  status: () => invoke<BackupStatus>("backup_status"),
  setPassphrase: (passphrase: string) => invoke<void>("set_backup_passphrase", { passphrase }),

  /** Where backups go, as something to show: a file name (Android) or a folder (desktop). */
  async target(): Promise<string | null> {
    if (isAndroid) return (await invoke<{ name: string | null }>(`${P}backup_target`)).name;
    return (await backup.status()).dir;
  },

  async chooseTarget(): Promise<string | null> {
    if (isAndroid) return (await invoke<{ name: string | null }>(`${P}choose_backup_file`)).name;
    const { open } = await import("@tauri-apps/plugin-dialog");
    const dir = await open({ directory: true, title: "Where should Tend keep backups?" });
    if (typeof dir !== "string") return backup.target();
    await invoke("set_backup_dir", { dir });
    return dir;
  },

  async run(): Promise<void> {
    const out = await invoke<{ path?: string; data?: string }>("backup_now");
    if (!out.data) return;
    try {
      await invoke(`${P}write_backup`, { data: out.data });
      await invoke("backup_written", { error: null });
    } catch (e) {
      await invoke("backup_written", { error: String(e) }).catch(() => null);
      throw e;
    }
  },

  async pick(): Promise<BackupSource | null> {
    if (isAndroid) {
      const f = await invoke<{ name: string | null; data: string | null }>(`${P}open_backup_file`);
      return f.data ? { name: f.name ?? "backup", data: f.data } : null;
    }
    const { open } = await import("@tauri-apps/plugin-dialog");
    const path = await open({ title: "Choose a Tend backup", filters: [{ name: "Tend backup", extensions: ["tendbak"] }] });
    return typeof path === "string" ? { name: path.split(/[\\/]/).pop() ?? path, path } : null;
  },

  restore: (src: BackupSource, passphrase: string) =>
    invoke<Restored>("restore_backup", { data: src.data ?? null, path: src.path ?? null, passphrase }),
};

let running = false;

/** Once a day, quietly. Problems are kept for Settings to show rather than interrupting. */
export async function autoBackup() {
  if (running) return;
  running = true;
  try {
    const s = await backup.status();
    if (!s.hasKey || (s.last && Date.now() - s.last < DAILY_MS)) return;
    if (!(await backup.target())) return;
    await backup.run();
  } catch {
    /* recorded by the backend */
  } finally {
    running = false;
  }
}
