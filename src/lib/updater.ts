import { invoke } from "@tauri-apps/api/core";
import { isAndroid } from "./api";

// Keeps Tend itself up to date from this project's GitHub releases.
// Desktop: signed installers listed in the release's latest.json, installed in place.
// Android: the APK attached to the release, handed to the system installer (which asks first).
//
// Two channels. Stable follows GitHub's "latest" release, which never includes pre-releases.
// Unstable follows the newest release of any kind: unstable builds are GitHub pre-releases tagged
// vX.Y.Z-N (built from the `unstable` branch), and a newer stable release wins there too.

export type UpdateChannel = "stable" | "unstable";

const LATEST_RELEASE = "https://api.github.com/repos/CheersLoveDani/tend/releases/latest";
const ALL_RELEASES = "https://api.github.com/repos/CheersLoveDani/tend/releases?per_page=20";
const STABLE_MANIFEST = "https://github.com/CheersLoveDani/tend/releases/latest/download/latest.json";
/** Installers are only ever taken from this project's own releases. */
const RELEASE_DOWNLOADS = "https://github.com/CheersLoveDani/tend/releases/download/";

const inTauri = "__TAURI_INTERNALS__" in window;

/**
 * -1, 0 or 1 comparing versions like semver: a leading "v" is ignored, and a pre-release
 * ("0.6.0-2") comes before its release ("0.6.0") and after the one before it ("0.6.0-1").
 */
export function compareVersions(a: string, b: string): number {
  const split = (v: string) => {
    const s = v.replace(/^v/i, "").split("+")[0];
    const dash = s.indexOf("-");
    const core = dash < 0 ? s : s.slice(0, dash);
    const pre = dash < 0 ? "" : s.slice(dash + 1);
    return { core: core.split(".").map((n) => Number.parseInt(n, 10) || 0), pre: pre ? pre.split(".") : [] };
  };
  const pa = split(a);
  const pb = split(b);
  for (let i = 0; i < Math.max(pa.core.length, pb.core.length); i++) {
    const diff = (pa.core[i] ?? 0) - (pb.core[i] ?? 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  // Same release number: having no pre-release tag is newer than having one.
  if (!pa.pre.length || !pb.pre.length) return pa.pre.length === pb.pre.length ? 0 : pa.pre.length ? -1 : 1;
  for (let i = 0; i < Math.max(pa.pre.length, pb.pre.length); i++) {
    const x = pa.pre[i];
    const y = pb.pre[i];
    if (x === undefined || y === undefined) return x === undefined ? -1 : 1;
    const numeric = /^\d+$/.test(x) && /^\d+$/.test(y);
    const diff = numeric ? Number(x) - Number(y) : x.localeCompare(y);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
}

let channel: UpdateChannel = "stable";

interface GhRelease {
  tag_name?: string;
  draft?: boolean;
  assets?: { name?: string; browser_download_url?: string }[];
}

/** The release this channel follows: GitHub's latest for stable, the newest of all for unstable. */
async function channelRelease(): Promise<GhRelease | null> {
  const res = await fetch(channel === "unstable" ? ALL_RELEASES : LATEST_RELEASE, { headers: { Accept: "application/vnd.github+json" } });
  if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
  if (channel === "stable") return (await res.json()) as GhRelease;
  const all = ((await res.json()) as GhRelease[]).filter((r) => !r.draft && r.tag_name);
  return all.sort((x, y) => compareVersions(y.tag_name!, x.tag_name!))[0] ?? null;
}

export async function appVersion(): Promise<string> {
  if (!inTauri) return "dev";
  const { getVersion } = await import("@tauri-apps/api/app");
  return getVersion();
}

/** How one platform finds, fetches and installs a new version. */
interface UpdateDriver {
  find(): Promise<{ version: string } | null>;
  /** Fetch the update so that installing it is quick. */
  download(): Promise<void>;
  /** Install what was downloaded. On desktop this restarts the app. */
  apply(): Promise<void>;
}

export type UpdateStatus = "idle" | "checking" | "none" | "available" | "downloading" | "ready" | "installing" | "failed";

export interface UpdateState {
  status: UpdateStatus;
  version: string | null;
}

function desktopDriver(): UpdateDriver {
  return {
    async find() {
      let url = STABLE_MANIFEST;
      if (channel === "unstable") {
        const release = await channelRelease();
        const manifest = release?.assets?.find((a) => a.name === "latest.json" && a.browser_download_url?.startsWith(RELEASE_DOWNLOADS));
        // A release whose installers are still being built is picked up on a later check.
        if (!manifest?.browser_download_url) return null;
        url = manifest.browser_download_url;
      }
      // Checked, downloaded and installed by src-tauri/src/update.rs (signature verified there).
      const version = await invoke<string | null>("update_check", { url });
      return version ? { version } : null;
    },
    async download() {
      await invoke("update_download");
    },
    async apply() {
      await invoke("update_install");
    },
  };
}

function androidDriver(): UpdateDriver {
  let apkUrl: string | null = null;
  return {
    async find() {
      const release = await channelRelease();
      if (!release?.tag_name || compareVersions(release.tag_name, await appVersion()) <= 0) return null;
      apkUrl =
        release.assets?.find((a) => a.name?.endsWith(".apk") && a.browser_download_url?.startsWith(RELEASE_DOWNLOADS))?.browser_download_url ?? null;
      // A release whose APK is still being built is picked up on a later check.
      return apkUrl ? { version: release.tag_name.replace(/^v/i, "") } : null;
    },
    async download() {
      await invoke("plugin:tend-native|download_update", { url: apkUrl });
    },
    async apply() {
      await invoke("plugin:tend-native|install_update");
    },
  };
}

function createUpdater(driver: UpdateDriver | null) {
  let state: UpdateState = { status: "idle", version: null };
  const listeners = new Set<(s: UpdateState) => void>();
  const set = (status: UpdateStatus, version = state.version) => {
    state = { status, version };
    listeners.forEach((l) => l(state));
  };
  const busy = () => state.status === "checking" || state.status === "downloading" || state.status === "installing";

  const download = async () => {
    set("downloading");
    await driver!.download();
    set("ready");
  };
  const apply = async () => {
    set("installing");
    await driver!.apply();
    // Still here: Android's installer took over, so the update stays on offer.
    set("ready");
  };

  return {
    supported: driver !== null,
    /** Which releases to follow. A switch forgets anything found on the other channel. */
    setChannel(next: UpdateChannel) {
      if (next === channel) return;
      channel = next;
      if (!busy()) set("idle", null);
    },
    getState: () => state,
    subscribe(listener: (s: UpdateState) => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    /** Look for a new version; with `auto`, download it straight away (installing always waits to be asked). */
    async check(auto: boolean) {
      // An update already fetched stays ready; looking again would only download it twice.
      if (!driver || busy() || state.status === "ready") return;
      try {
        set("checking");
        const found = await driver.find();
        if (!found) return set("none", null);
        set("available", found.version);
        if (auto) await download();
      } catch {
        set(state.version ? "failed" : "none");
      }
    },
    /** Install the update that is available or ready. */
    async install() {
      if (!driver || busy()) return;
      const { status } = state;
      if (status !== "available" && status !== "ready" && status !== "failed") return;
      try {
        if (status !== "ready") await download();
        await apply();
      } catch {
        set("failed");
      }
    },
  };
}

export const appUpdater = createUpdater(!inTauri ? null : isAndroid ? androidDriver() : desktopDriver());
