import { invoke } from "@tauri-apps/api/core";
import { isAndroid } from "./api";

// Keeps Tend itself up to date from this project's GitHub releases.
// Desktop: signed installers listed in the release's latest.json, installed in place.
// Android: the APK attached to the release, handed to the system installer (which asks first).

const LATEST_RELEASE = "https://api.github.com/repos/CheersLoveDani/tend/releases/latest";
/** Installers are only ever taken from this project's own releases. */
const RELEASE_DOWNLOADS = "https://github.com/CheersLoveDani/tend/releases/download/";

const inTauri = "__TAURI_INTERNALS__" in window;

/** -1, 0 or 1 comparing dotted versions; a leading "v" and pre-release tags are ignored. */
export function compareVersions(a: string, b: string): number {
  const parts = (v: string) =>
    v
      .replace(/^v/i, "")
      .split(/[-+]/)[0]
      .split(".")
      .map((n) => Number.parseInt(n, 10) || 0);
  const pa = parts(a);
  const pb = parts(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
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
  let pending: import("@tauri-apps/plugin-updater").Update | null = null;
  return {
    async find() {
      const { check } = await import("@tauri-apps/plugin-updater");
      pending = await check();
      return pending ? { version: pending.version } : null;
    },
    async download() {
      await pending!.download();
    },
    async apply() {
      await pending!.install();
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    },
  };
}

function androidDriver(): UpdateDriver {
  let apkUrl: string | null = null;
  return {
    async find() {
      const res = await fetch(LATEST_RELEASE, { headers: { Accept: "application/vnd.github+json" } });
      if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
      const release = (await res.json()) as { tag_name?: string; assets?: { name?: string; browser_download_url?: string }[] };
      if (!release.tag_name || compareVersions(release.tag_name, await appVersion()) <= 0) return null;
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
