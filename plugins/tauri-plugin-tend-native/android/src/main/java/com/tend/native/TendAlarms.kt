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

  private fun intent(ctx: Context, id: String): Intent =
    Intent(ctx, ReminderAlarmReceiver::class.java)
      .setAction(TendIds.ACTION_ALARM)
      .setData(TendIds.reminderUri("alarm", id))

  fun schedule(ctx: Context, alarm: AlarmItem) {
    val intent = intent(ctx, alarm.id)
      .putExtra(TendIds.EXTRA_REMINDER_ID, alarm.id)
      .putExtra(TendIds.EXTRA_TITLE, alarm.title)
      .putExtra(TendIds.EXTRA_BODY, alarm.body)
    val pi = PendingIntent.getBroadcast(
      ctx,
      TendIds.stableHash("alarm", alarm.id),
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
    val am = am(ctx)
    if (canScheduleExact(ctx)) {
      try {
        AlarmManagerCompat.setExactAndAllowWhileIdle(am, AlarmManager.RTC_WAKEUP, alarm.at, pi)
        return
      } catch (e: SecurityException) {
        // Permission revoked between the check and the call: fall through to inexact.
      }
    }
    AlarmManagerCompat.setAndAllowWhileIdle(am, AlarmManager.RTC_WAKEUP, alarm.at, pi)
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
    val am = am(ctx)
    if (canScheduleExact(ctx)) {
      try {
        AlarmManagerCompat.setExactAndAllowWhileIdle(am, AlarmManager.RTC_WAKEUP, at, pi)
        return
      } catch (e: SecurityException) {
        // Fall through to inexact.
      }
    }
    AlarmManagerCompat.setAndAllowWhileIdle(am, AlarmManager.RTC_WAKEUP, at, pi)
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
   * state push: an upcoming chime is kept (unless the interval got shorter), otherwise the
   * next one is a full interval from now.
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
    val at = if (next > now && next - now <= state.chimeIntervalMs) next else state.nextChimeAfter(now)
    // Alarms don't survive a reboot, so always (re)register. Same request code: this replaces.
    scheduleChime(ctx, at)
    TendStore.setNextChimeAt(ctx, at)
  }

  fun cancel(ctx: Context, id: String) {
    val pi = PendingIntent.getBroadcast(
      ctx,
      TendIds.stableHash("alarm", id),
      intent(ctx, id),
      PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE
    ) ?: return
    am(ctx).cancel(pi)
    pi.cancel()
  }

  /**
   * Make the scheduled set match [alarms]: (re)schedule every upcoming alarm and cancel the ones
   * that disappeared. With [fireMissed] (boot/update restore), alarms that came due while the
   * phone was off fire right away instead of being dropped.
   */
  fun sync(ctx: Context, alarms: List<AlarmItem>, fireMissed: Boolean) {
    val now = System.currentTimeMillis()
    val previous = TendStore.scheduledAlarmIds(ctx)
    val kept = HashSet<String>()
    for (alarm in alarms.associateBy { it.id }.values) {
      val at = when {
        alarm.at > now -> alarm.at
        fireMissed && now - alarm.at < MISSED_GRACE_MS -> now + 5_000L
        else -> continue
      }
      schedule(ctx, alarm.copy(at = at))
      kept.add(alarm.id)
    }
    for (id in previous) if (id !in kept) cancel(ctx, id)
    TendStore.saveScheduledAlarmIds(ctx, kept)
  }
}
