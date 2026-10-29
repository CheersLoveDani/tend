export interface Settings {
  sound: boolean;
  volume: number;
  reduceMotion: "system" | "on" | "off";
  theme: "system" | "light" | "dark";
  surpriseBonuses: boolean;
  persistentNotification: boolean;
  nagOnUnlock: boolean;
  nagCooldownMinutes: number;
  quietHours: { start: string; end: string } | null;
  desktopNudgeHours: number;
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
  nagCooldownMinutes: 30,
  quietHours: { start: "22:30", end: "07:30" },
  desktopNudgeHours: 3,
  useModel: true,
  autoUpdate: true,
  onboarded: false,
};

export function inQuietHours(q: Settings["quietHours"], now = new Date()): boolean {
  if (!q) return false;
  const hm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  return q.start <= q.end ? hm >= q.start && hm < q.end : hm >= q.start || hm < q.end;
}
