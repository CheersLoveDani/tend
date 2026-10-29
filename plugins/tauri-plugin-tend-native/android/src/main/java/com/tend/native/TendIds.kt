package com.tend.native

import android.net.Uri

object TendIds {
  const val PERSISTENT_NOTIFICATION_ID = 0x7E4D01
  const val NUDGE_NOTIFICATION_ID = 0x7E4D02

  const val EXTRA_ACTION = "tend_action"
  const val EXTRA_REMINDER_ID = "tend_reminder_id"
  const val EXTRA_TITLE = "tend_title"
  const val EXTRA_BODY = "tend_body"

  const val LAUNCH_NAG = "nag"
  const val LAUNCH_OPEN = "open"
  const val LAUNCH_REMINDER = "reminder"

  const val ACTION_ALARM = "com.tend.native.action.ALARM"
  const val ACTION_DONE = "com.tend.native.action.DONE"
  const val ACTION_SNOOZE = "com.tend.native.action.SNOOZE"
  const val ACTION_PERSISTENT_DISMISSED = "com.tend.native.action.PERSISTENT_DISMISSED"

  const val RC_OPEN = 0x7E4D10
  const val RC_NAG = 0x7E4D11
  const val RC_PERSISTENT_DISMISSED = 0x7E4D12

  const val SNOOZE_MS = 15L * 60L * 1000L

  /** Stable across processes/reboots: String.hashCode is specified by the JLS. */
  fun stableHash(kind: String, id: String): Int = "$kind:$id".hashCode()

  fun reminderNotificationId(id: String): Int = stableHash("notification", id)

  /** Distinct data URI per reminder so PendingIntents never collide (filterEquals compares data). */
  fun reminderUri(kind: String, id: String): Uri =
    Uri.Builder().scheme("tend").authority(kind).appendPath(id).build()
}
