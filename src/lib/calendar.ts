// The phone's calendars (Android, read-only via CalendarContract): Google Calendar and any other
// account synced to the phone. Nothing is written and nothing leaves the device.
import { invoke } from "@tauri-apps/api/core";
import { isAndroid } from "./api";

const P = "plugin:tend-native|";

export interface DeviceCalendar {
  id: string;
  name: string;
  account: string;
  /** CSS colour, e.g. "#3f51b5". */
  color: string;
}

export interface CalendarEvent {
  id: string;
  calendarId: string;
  title: string;
  /** Epoch ms. All-day events start at local midnight. */
  start: number;
  end: number;
  allDay: boolean;
  color: string;
  location: string;
}

export interface CalendarAccess {
  /** `granted` | `denied` | `unsupported` (desktop). */
  status: "granted" | "denied" | "unsupported";
}

export const calendar = {
  status: () => (isAndroid ? invoke<CalendarAccess>(`${P}calendar_status`) : Promise.resolve<CalendarAccess>({ status: "unsupported" })),
  request: () => invoke<CalendarAccess>(`${P}calendar_request`),
  calendars: () => invoke<{ calendars: DeviceCalendar[] }>(`${P}calendar_list`).then((r) => r.calendars),
  /** Events overlapping [from, to) (epoch ms), from the given calendars (empty = all visible). */
  events: (from: number, to: number, ids: string[]) =>
    invoke<{ events: CalendarEvent[] }>(`${P}calendar_events`, { from, to, ids }).then((r) => r.events),
};
