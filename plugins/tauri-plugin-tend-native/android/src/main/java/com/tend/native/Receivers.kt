package com.tend.native

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** A timed reminder came due. */
class ReminderAlarmReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != TendIds.ACTION_ALARM) return
    val id = intent.getStringExtra(TendIds.EXTRA_REMINDER_ID) ?: return
    val title = intent.getStringExtra(TendIds.EXTRA_TITLE) ?: ""
    val body = intent.getStringExtra(TendIds.EXTRA_BODY) ?: ""
    TendEngine.onAlarmFired(context, id, title, body)
  }
}

/** "Done" / "Snooze 15 min" buttons on a reminder notification. */
class ReminderActionReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val id = intent.getStringExtra(TendIds.EXTRA_REMINDER_ID) ?: return
    when (intent.action) {
      TendIds.ACTION_DONE -> TendEngine.complete(context, id)
      TendIds.ACTION_SNOOZE -> TendEngine.snooze(
        context,
        id,
        intent.getStringExtra(TendIds.EXTRA_TITLE) ?: "",
        intent.getStringExtra(TendIds.EXTRA_BODY) ?: ""
      )
    }
  }
}

/** The user swiped the "still to do" notification away (allowed on Android 14+): put it back. */
class PersistentDismissReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val state = TendStore.loadState(context)
    if (state.wantsPersistentNotification || (state.wantsUnlockService && UnlockNudgeService.isRunning)) {
      TendNotifications.postPersistent(context.applicationContext, state)
    }
  }
}

/** Restore alarms, the persistent notification and the unlock service. */
class BootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    when (intent.action) {
      Intent.ACTION_BOOT_COMPLETED,
      Intent.ACTION_MY_PACKAGE_REPLACED -> TendEngine.restore(context)
      // Exact-alarm access granted/revoked: re-schedule so alarms use the right mode.
      "android.app.action.SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED" ->
        TendAlarms.sync(context.applicationContext, TendStore.loadState(context).alarms, fireMissed = false)
    }
  }
}
