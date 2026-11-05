package com.tend.native

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.AlarmManagerCompat

object TendAlarms {
  /** Missed alarms older than this are dropped on restore instead of firing late. */
  private const val MISSED_GRACE_MS = 12L * 60L * 60L * 1000L

  private fun am(ctx: Context): AlarmManager =
    ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager

  fun canScheduleExact(ctx: Context): Boolean =
    Build.VERSION.SDK_INT < Build.VERSION_CODES.S || am(ctx).canScheduleExactAlarms()

  /** [key] is [AlarmItem.key]: the bare id for main alarms, so pre-0.3 alarms still match. */
  private fun intent(ctx: Context, key: String): Intent =
    Intent(ctx, ReminderAlarmReceiver::class.java)
      .setAction(TendIds.ACTION_ALARM)
      .setData(TendIds.reminderUri("alarm", key))

  fun schedule(ctx: Context, alarm: AlarmItem) {
    val intent = intent(ctx, alarm.key)
      .putExtra(TendIds.EXTRA_REMINDER_ID, alarm.id)
      .putExtra(TendIds.EXTRA_TITLE, alarm.title)
      .putExtra(TendIds.EXTRA_BODY, alarm.body)
      .putExtra(TendIds.EXTRA_KIND, alarm.kind)
      .putExtra(TendIds.EXTRA_DUE_AT, alarm.dueAt)
      .putExtra(TendIds.EXTRA_DOSE, alarm.dose)
      .putExtra(TendIds.EXTRA_CRITICAL, alarm.critical)
    val pi = PendingIntent.getBroadcast(
      ctx,
      TendIds.stableHash("alarm", alarm.key),
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
    setAlarm(ctx, alarm.at, pi)
  }

  private fun setAlarm(ctx: Context, at: Long, pi: PendingIntent) {
    val am = am(ctx)
    if (canScheduleExact(ctx)) {
      try {
        AlarmManagerCompat.setExactAndAllowWhileIdle(am, AlarmManager.RTC_WAKEUP, at, pi)
        return
      } catch (e: SecurityException) {
        // Permission revoked between the check and the call: fall through to inexact.
      }
    }
    AlarmManagerCompat.setAndAllowWhileIdle(am, AlarmManager.RTC_WAKEUP, at, pi)
  }

  private fun chimeIntent(ctx: Context): Intent =
    Intent(ctx, ChimeReceiver::class.java).setAction(TendIds.ACTION_CHIME)

  /** One chime at [at]; the receiver schedules the next one. */
  fun scheduleChime(ctx: Context, at: Long) {
    val pi = PendingIntent.getBroadcast(
      ctx,
      TendIds.RC_CHIME,
      chimeIntent(ctx),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
    setAlarm(ctx, at, pi)
  }

  fun cancelChime(ctx: Context) {
    val pi = PendingIntent.getBroadcast(
      ctx,
      TendIds.RC_CHIME,
      chimeIntent(ctx),
      PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE
    ) ?: return
    am(ctx).cancel(pi)
    pi.cancel()
  }

  /**
   * Keep the chime schedule in line with [state] without restarting the countdown on every
   * state push: an upcoming chime is kept (unless the interval got shorter or a pause moved it),
   * otherwise the next one is a full interval from now.
   */
  fun syncChime(ctx: Context, state: NativeState) {
    if (!state.wantsChime) {
      cancelChime(ctx)
      TendStore.setNextChimeAt(ctx, 0L)
      TendNotifications.cancelChime(ctx)
      return
    }
    val now = System.currentTimeMillis()
    val next = TendStore.nextChimeAt(ctx)
    val keep = next > now && next - now <= state.chimeIntervalMs && !state.isPaused(next)
    val at = if (keep) next else state.nextChimeAfter(now)
    // Alarms don't survive a reboot, so always (re)register. Same request code: this replaces.
    scheduleChime(ctx, at)
    TendStore.setNextChimeAt(ctx, at)
  }

  /** How often the unlock listener is checked on, while it should be running. */
  private const val WATCHDOG_MS = 30L * 60_000L

  private fun watchdogIntent(ctx: Context, flags: Int): PendingIntent? =
    PendingIntent.getBroadcast(
      ctx,
      TendIds.RC_WATCHDOG,
      Intent(ctx, ChimeReceiver::class.java).setAction(TendIds.ACTION_WATCHDOG),
      flags or PendingIntent.FLAG_IMMUTABLE
    )

  /**
   * Android (or a vendor battery saver) may kill the unlock listener, and isn't obliged to let it
   * restart itself. While it should be running, an alarm checks on it every half hour and brings
   * it back: an exact alarm is one of the few moments Android allows starting it from the
   * background. Does nothing else, and stops once the listener isn't wanted.
   */
  fun syncWatchdog(ctx: Context, state: NativeState) {
    if (!state.wantsUnlockService) {
      watchdogIntent(ctx, PendingIntent.FLAG_NO_CREATE)?.let {
        am(ctx).cancel(it)
        it.cancel()
      }
      return
    }
    val pi = watchdogIntent(ctx, PendingIntent.FLAG_UPDATE_CURRENT) ?: return
    setAlarm(ctx, System.currentTimeMillis() + WATCHDOG_MS, pi)
  }

  /** Cancels one scheduled alarm by its key. */
  fun cancelKey(ctx: Context, key: String) {
    val pi = PendingIntent.getBroadcast(
      ctx,
      TendIds.stableHash("alarm", key),
      intent(ctx, key),
      PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE
    ) ?: return
    am(ctx).cancel(pi)
    pi.cancel()
  }

  /** Cancels every alarm about reminder/dose [id]: its time, heads-up, follow-ups and snoozes. */
  fun cancel(ctx: Context, id: String) {
    for (kind in AlarmItem.ALL_KINDS) {
      val key = AlarmItem.keyOf(kind, id)
      cancelKey(ctx, key)
      TendStore.removeScheduledAlarmId(ctx, key)
    }
    TendStore.removeExtraAlarms(ctx) { it.id == id }
  }

  /** Lines up a native follow-up (snooze, second nudge, dose re-reminder) and remembers it. */
  fun scheduleExtra(ctx: Context, alarm: AlarmItem) {
    TendStore.putExtraAlarm(ctx, alarm)
    schedule(ctx, alarm)
    TendStore.addScheduledAlarmId(ctx, alarm.key)
  }

  /** Heads-ups before timed reminders, worked out from the main alarms (never for doses). */
  private fun preWarnings(state: NativeState, now: Long): List<AlarmItem> {
    if (state.preWarnMinutes <= 0) return emptyList()
    val lead = state.preWarnMinutes.toLong() * 60_000L
    return state.alarms
      .filter { it.kind == AlarmItem.KIND_MAIN && !it.dose && it.at - lead > now }
      .map { it.copy(at = it.at - lead, kind = AlarmItem.KIND_PRE, dueAt = it.at) }
  }

  /**
   * Make the scheduled set match [state] (its alarms, the heads-ups they imply, and the stored
   * follow-ups): (re)schedule every upcoming alarm and cancel the ones that disappeared. With
   * [fireMissed] (boot/update restore), alarms that came due while the phone was off fire right
   * away instead of being dropped.
   */
  fun sync(ctx: Context, state: NativeState, fireMissed: Boolean) {
    val now = System.currentTimeMillis()
    val previous = TendStore.scheduledAlarmIds(ctx)
    val kept = HashSet<String>()
    val all = state.alarms.map { it.copy(kind = AlarmItem.KIND_MAIN) } + preWarnings(state, now) + TendStore.extraAlarms(ctx)
    for (alarm in all.associateBy { it.key }.values) {
      val at = when {
        alarm.at > now -> alarm.at
        // A late heads-up is worse than none.
        alarm.kind == AlarmItem.KIND_PRE -> continue
        fireMissed && now - alarm.at < MISSED_GRACE_MS -> now + 5_000L
        else -> continue
      }
      schedule(ctx, alarm.copy(at = at))
      kept.add(alarm.key)
    }
    for (key in previous) if (key !in kept) cancelKey(ctx, key)
    TendStore.saveScheduledAlarmIds(ctx, kept)
  }
}
