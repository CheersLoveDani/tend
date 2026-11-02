package com.tend.native

import android.content.Context

/**
 * Applies a [NativeState] to the system (alarms, notifications, unlock service) and handles
 * the notification-button actions. Everything here is event-driven: no polling, no wakelocks.
 */
object TendEngine {

  @Synchronized
  fun apply(context: Context, state: NativeState, fireMissedAlarms: Boolean = false) {
    val ctx = context.applicationContext
    TendNotifications.ensureChannels(ctx)
    TendAlarms.sync(ctx, state.alarms, fireMissedAlarms)
    TendAlarms.syncChime(ctx, state)
    refreshSurface(ctx, state)
  }

  /** Restore everything from the saved state (boot, app update). */
  fun restore(context: Context) {
    apply(context, TendStore.loadState(context), fireMissedAlarms = true)
  }

  /** Re-post/cancel the persistent notification and start/stop the unlock service. */
  @Synchronized
  fun refreshSurface(context: Context, state: NativeState) {
    val ctx = context.applicationContext
    if (state.wantsUnlockService) {
      if (UnlockNudgeService.isRunning) {
        // Same id as the service's foreground notification: this just updates it.
        TendNotifications.postPersistent(ctx, state)
      } else if (!UnlockNudgeService.start(ctx)) {
        // Not allowed to start a foreground service from here: keep the plain notification.
        if (state.pending.isNotEmpty()) TendNotifications.postPersistent(ctx, state)
      }
    } else {
      if (UnlockNudgeService.isRunning) {
        // The service re-evaluates the notification in onDestroy (it detaches, then posts/cancels).
        UnlockNudgeService.stop(ctx)
      }
      if (state.wantsPersistentNotification) {
        TendNotifications.postPersistent(ctx, state)
      } else {
        TendNotifications.cancelPersistent(ctx)
      }
    }
    if (state.pending.isEmpty()) TendNotifications.cancelNudge(ctx)
  }

  /** Persistent notification only (no service start): used when the service goes away. */
  @Synchronized
  fun refreshPersistentOnly(context: Context) {
    val ctx = context.applicationContext
    val state = TendStore.loadState(ctx)
    if (state.wantsPersistentNotification) {
      TendNotifications.postPersistent(ctx, state)
    } else {
      TendNotifications.cancelPersistent(ctx)
    }
  }

  @Synchronized
  fun onAlarmFired(context: Context, id: String, title: String, body: String) {
    val ctx = context.applicationContext
    var state = TendStore.loadState(ctx)
    val alarm = state.alarms.find { it.id == id }
    if (alarm != null) state = state.copy(alarms = state.alarms.filter { it.id != id })
    // A dose that comes due joins the "still to do" list at the top, so the chime, the
    // persistent notification and the unlock screen all keep at it until it's taken.
    val dose = alarm?.dose == true || id.startsWith("dose:")
    val critical = alarm?.critical == true
    if (dose && state.pending.none { it.id == id }) {
      val time = java.text.SimpleDateFormat("HH:mm", java.util.Locale.ROOT).format(java.util.Date())
      val item = PendingItem(id, title.removePrefix("Time for "), time, 0, 0, 0.0, dose = true, critical = critical)
      state = state.copy(pending = listOf(item) + state.pending)
    }
    TendStore.saveState(ctx, state)
    TendStore.removeScheduledAlarmId(ctx, id)
    val quiet = state.isQuietNow() && !critical
    TendNotifications.postReminder(ctx, id, title, body, silent = quiet, dose = dose)
    if (!quiet) TendStore.setLastChimeAt(ctx, System.currentTimeMillis())
    if (dose) {
      TendAlarms.syncChime(ctx, state)
      refreshSurface(ctx, state)
    }
  }

  /** The periodic chime: sound once if things are waiting, then line up the next one. */
  @Synchronized
  fun onChime(context: Context) {
    val ctx = context.applicationContext
    val state = TendStore.loadState(ctx)
    TendStore.setNextChimeAt(ctx, 0L)
    if (!state.wantsChime) {
      TendNotifications.cancelChime(ctx)
      return
    }
    val now = System.currentTimeMillis()
    if (!state.isQuietFor(now)) {
      TendNotifications.postChime(ctx, state)
      TendStore.setLastChimeAt(ctx, now)
    }
    val next = state.nextChimeAfter(now)
    TendAlarms.scheduleChime(ctx, next)
    TendStore.setNextChimeAt(ctx, next)
    // An exact alarm may start a foreground service: bring the unlock listener back if the
    // system killed it, so the unlock screen keeps working without opening the app.
    refreshSurface(ctx, state)
  }

  @Synchronized
  fun complete(context: Context, id: String) {
    val ctx = context.applicationContext
    TendStore.addPendingAction(ctx, "complete", id, System.currentTimeMillis())
    val state = TendStore.loadState(ctx)
    val next = state.copy(
      pending = state.pending.filter { it.id != id },
      alarms = state.alarms.filter { it.id != id }
    )
    TendStore.saveState(ctx, next)
    TendAlarms.cancel(ctx, id)
    TendStore.removeScheduledAlarmId(ctx, id)
    TendNotifications.cancelReminder(ctx, id)
    TendAlarms.syncChime(ctx, next)
    refreshSurface(ctx, next)
    TendNativePlugin.notifyPendingActions(ctx)
  }

  @Synchronized
  fun snooze(context: Context, id: String, title: String, body: String) {
    val ctx = context.applicationContext
    val now = System.currentTimeMillis()
    TendStore.addPendingAction(ctx, "snooze", id, now)
    val state = TendStore.loadState(ctx)
    val prev = state.alarms.find { it.id == id }
    val alarm = AlarmItem(
      id, title, body, now + TendIds.SNOOZE_MS,
      dose = prev?.dose ?: id.startsWith("dose:"),
      critical = prev?.critical ?: state.pending.any { it.id == id && it.critical }
    )
    TendStore.saveState(ctx, state.copy(alarms = state.alarms.filter { it.id != id } + alarm))
    TendAlarms.schedule(ctx, alarm)
    TendStore.addScheduledAlarmId(ctx, id)
    TendNotifications.cancelReminder(ctx, id)
    TendNativePlugin.notifyPendingActions(ctx)
  }
}
