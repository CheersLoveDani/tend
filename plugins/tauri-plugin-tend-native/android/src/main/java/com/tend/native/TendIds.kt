package com.tend.native

import android.net.Uri

object TendIds {
  const val PERSISTENT_NOTIFICATION_ID = 0x7E4D01
  const val NUDGE_NOTIFICATION_ID = 0x7E4D02
  const val CHIME_NOTIFICATION_ID = 0x7E4D03
  const val MOOD_NOTIFICATION_ID = 0x7E4D04
  const val MOOD_DONE_NOTIFICATION_ID = 0x7E4D05

  const val EXTRA_ACTION = "tend_action"
  const val EXTRA_REMINDER_ID = "tend_reminder_id"
  const val EXTRA_TITLE = "tend_title"
  const val EXTRA_BODY = "tend_body"
  const val EXTRA_KIND = "tend_kind"
  const val EXTRA_DUE_AT = "tend_due_at"
  const val EXTRA_DOSE = "tend_dose"
  const val EXTRA_CRITICAL = "tend_critical"
  const val EXTRA_MOOD = "tend_mood"

  /** RemoteInput key for the persistent notification's "Add…" reply. */
  const val KEY_ADD_TEXT = "tend_add_text"

  const val LAUNCH_NAG = "nag"
  const val LAUNCH_OPEN = "open"
  const val LAUNCH_REMINDER = "reminder"

  const val ACTION_ALARM = "com.tend.native.action.ALARM"
  const val ACTION_CHIME = "com.tend.native.action.CHIME"
  const val ACTION_DONE = "com.tend.native.action.DONE"
  const val ACTION_SNOOZE = "com.tend.native.action.SNOOZE"
  const val ACTION_SNOOZE_HOUR = "com.tend.native.action.SNOOZE_HOUR"
  const val ACTION_TOMORROW = "com.tend.native.action.TOMORROW"
  const val ACTION_STEP = "com.tend.native.action.STEP"
  const val ACTION_ADD = "com.tend.native.action.ADD"
  const val ACTION_QUIET_TODAY = "com.tend.native.action.QUIET_TODAY"
  const val ACTION_WIDGET_TAP = "com.tend.native.action.WIDGET_TAP"
  const val ACTION_QUICK_ADD = "com.tend.native.action.QUICK_ADD"
  const val ACTION_WATCHDOG = "com.tend.native.action.WATCHDOG"
  const val ACTION_MOOD_TIME = "com.tend.native.action.MOOD_TIME"
  const val ACTION_MOOD = "com.tend.native.action.MOOD"
  const val ACTION_PERSISTENT_DISMISSED = "com.tend.native.action.PERSISTENT_DISMISSED"

  const val RC_OPEN = 0x7E4D10
  const val RC_NAG = 0x7E4D11
  const val RC_PERSISTENT_DISMISSED = 0x7E4D12
  const val RC_CHIME = 0x7E4D13
  const val RC_ADD = 0x7E4D14
  const val RC_QUIET_TODAY = 0x7E4D15
  const val RC_QUICK_ADD = 0x7E4D16
  const val RC_WIDGET_OPEN = 0x7E4D17
  const val RC_MOOD_TIME = 0x7E4D18
  const val RC_WATCHDOG = 0x7E4D1A
  const val RC_MOOD_OPEN = 0x7E4D19

  const val SNOOZE_MS = 15L * 60L * 1000L
  const val HOUR_MS = 60L * 60L * 1000L

  /** Stable across processes/reboots: String.hashCode is specified by the JLS. */
  fun stableHash(kind: String, id: String): Int = "$kind:$id".hashCode()

  fun reminderNotificationId(id: String): Int = stableHash("notification", id)

  fun preWarnNotificationId(id: String): Int = stableHash("prewarn", id)

  /** Distinct data URI per reminder so PendingIntents never collide (filterEquals compares data). */
  fun reminderUri(kind: String, id: String): Uri =
    Uri.Builder().scheme("tend").authority(kind).appendPath(id).build()
}
