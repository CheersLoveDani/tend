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
    val state = TendStore.loadState(ctx)
    if (state.alarms.any { it.id == id }) {
      TendStore.saveState(ctx, state.copy(alarms = state.alarms.filter { it.id != id }))
    }
    TendStore.removeScheduledAlarmId(ctx, id)
    TendNotifications.postReminder(ctx, id, title, body, silent = state.isQuietNow())
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
    refreshSurface(ctx, next)
    TendNativePlugin.notifyPendingActions(ctx)
  }

  @Synchronized
  fun snooze(context: Context, id: String, title: String, body: String) {
    val ctx = context.applicationContext
    val now = System.currentTimeMillis()
    TendStore.addPendingAction(ctx, "snooze", id, now)
    val alarm = AlarmItem(id, title, body, now + TendIds.SNOOZE_MS)
    val state = TendStore.loadState(ctx)
    TendStore.saveState(ctx, state.copy(alarms = state.alarms.filter { it.id != id } + alarm))
    TendAlarms.schedule(ctx, alarm)
    TendStore.addScheduledAlarmId(ctx, id)
    TendNotifications.cancelReminder(ctx, id)
    TendNativePlugin.notifyPendingActions(ctx)
  }
}
