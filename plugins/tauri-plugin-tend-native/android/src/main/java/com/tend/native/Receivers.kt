package com.tend.native

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.app.RemoteInput

/** A timed reminder came due (or one of its heads-ups / follow-ups). */
class ReminderAlarmReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != TendIds.ACTION_ALARM) return
    val id = intent.getStringExtra(TendIds.EXTRA_REMINDER_ID) ?: return
    TendEngine.onAlarmFired(
      context,
      id,
      intent.getStringExtra(TendIds.EXTRA_KIND) ?: AlarmItem.KIND_MAIN,
      intent.getStringExtra(TendIds.EXTRA_TITLE) ?: "",
      intent.getStringExtra(TendIds.EXTRA_BODY) ?: "",
      intent.getLongExtra(TendIds.EXTRA_DUE_AT, 0L),
      intent.getBooleanExtra(TendIds.EXTRA_DOSE, false),
      intent.getBooleanExtra(TendIds.EXTRA_CRITICAL, false)
    )
  }
}

/** Time for the gentle "still waiting" chime, the unlock listener's check-up, or a step reading. */
class ChimeReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    when (intent.action) {
      TendIds.ACTION_CHIME -> TendEngine.onChime(context)
      TendIds.ACTION_WATCHDOG -> TendEngine.onWatchdog(context)
      TendIds.ACTION_STEP_SAMPLE -> {
        // The sensor answers asynchronously: keep the receiver alive while it does.
        val done = goAsync()
        val ctx = context.applicationContext
        Thread {
          try {
            TendSteps.sample(ctx)
          } finally {
            done.finish()
          }
        }.start()
      }
    }
  }
}

/** Time for the daily weather check-in. */
class MoodReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != TendIds.ACTION_MOOD_TIME) return
    TendMood.onTime(context)
  }
}

/** Buttons on Tend's notifications: Done / 1 h / Tomorrow / Snooze, ✓ step, Add…, Quiet today. */
class ReminderActionReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    when (intent.action) {
      TendIds.ACTION_QUIET_TODAY -> {
        TendEngine.quietToday(context)
        return
      }
      TendIds.ACTION_ITEM_DISMISSED -> {
        intent.getStringExtra(TendIds.EXTRA_REMINDER_ID)?.let { TendNotifications.onItemDismissed(context.applicationContext, it) }
        return
      }
      TendIds.ACTION_MOOD -> {
        val v = intent.getIntExtra(TendIds.EXTRA_MOOD, 0)
        if (v in 1..5) TendMood.log(context, v)
        return
      }
      TendIds.ACTION_ADD -> {
        val text = RemoteInput.getResultsFromIntent(intent)?.getCharSequence(TendIds.KEY_ADD_TEXT)?.toString()
        if (!text.isNullOrBlank()) {
          TendEngine.add(context, text, fromShade = true)
        } else {
          // Nothing typed: re-post anyway so the reply field stops spinning.
          TendEngine.refreshSurface(context, TendStore.loadState(context))
        }
        return
      }
    }
    val id = intent.getStringExtra(TendIds.EXTRA_REMINDER_ID) ?: return
    val title = intent.getStringExtra(TendIds.EXTRA_TITLE) ?: ""
    val body = intent.getStringExtra(TendIds.EXTRA_BODY) ?: ""
    when (intent.action) {
      TendIds.ACTION_DONE -> TendEngine.complete(context, id)
      TendIds.ACTION_SNOOZE -> TendEngine.snooze(context, id, title, body)
      TendIds.ACTION_SNOOZE_HOUR -> TendEngine.snooze(context, id, title, body, TendIds.HOUR_MS)
      TendIds.ACTION_TOMORROW -> TendEngine.tomorrow(context, id)
      TendIds.ACTION_STEP -> TendEngine.step(context, id)
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
        TendAlarms.sync(context.applicationContext, TendStore.loadState(context), fireMissed = false)
    }
  }
}
