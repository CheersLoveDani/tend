export interface Settings {
  sound: boolean;
  volume: number;
  reduceMotion: "system" | "on" | "off";
  theme: "system" | "light" | "dark";
  surpriseBonuses: boolean;
  persistentNotification: boolean;
  nagOnUnlock: boolean;
  /** When the unlock screen may show again: -1 = after each chime, 0 = every unlock, else minutes. */
  nagEvery: number;
  quietHours: { start: string; end: string } | null;
  /** Gentle notification sound while things are waiting, every N minutes (0 = off). */
  chimeMinutes: number;
  useModel: boolean;
  autoUpdate: boolean;
  onboarded: boolean;
}

export const defaultSettings: Settings = {
  sound: true,
  volume: 0.7,
  reduceMotion: "system",
  theme: "system",
  surpriseBonuses: true,
  persistentNotification: true,
  nagOnUnlock: true,
  nagEvery: -1,
  quietHours: { start: "22:30", end: "07:30" },
  chimeMinutes: 15,
  useModel: true,
  autoUpdate: true,
  onboarded: false,
};

export function inQuietHours(q: Settings["quietHours"], now = new Date()): boolean {
  if (!q) return false;
  const hm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  return q.start <= q.end ? hm >= q.start && hm < q.end : hm >= q.start || hm < q.end;
}
