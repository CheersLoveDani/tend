package com.tend.native

import android.content.Context
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Applies a [NativeState] to the system (alarms, notifications, unlock service, widget, tile) and
 * handles what people do outside the app (notification buttons, widget taps, quick add). Everything
 * here is event-driven: no polling, no wakelocks.
 *
 * Cue shape (0.3): a timed reminder alerts at its time, once more after `nudgeAgainMinutes`, then
 * stays quietly in the list. Doses re-alert every `doseNagMinutes` until `doseNagUntilMinutes`
 * after they were due. "Quiet for today" (`pausedUntil`) silences everything except doses.
 */
object TendEngine {

  @Synchronized
  fun apply(context: Context, state: NativeState, fireMissedAlarms: Boolean = false) {
    val ctx = context.applicationContext
    TendNotifications.ensureChannels(ctx)
    pruneExtras(ctx, state)
    TendAlarms.sync(ctx, state, fireMissedAlarms)
    TendAlarms.syncChime(ctx, state)
    TendMood.sync(ctx, state)
    TendSteps.schedule(ctx)
    refreshSurface(ctx, state)
  }

  /** The half-hourly check-up: brings the unlock listener back if it was killed, and lines up the next. */
  @Synchronized
  fun onWatchdog(context: Context) {
    val ctx = context.applicationContext
    if (!UnlockNudgeService.isRunning) android.util.Log.i("TendNative", "watchdog: unlock listener wasn't running")
    refreshSurface(ctx, TendStore.loadState(ctx))
  }

  /** Follow-ups only matter while their reminder or dose is still waiting. */
  private fun pruneExtras(ctx: Context, state: NativeState) {
    val live = state.pending.map { it.id }.toSet() + state.alarms.map { it.id }
    val graceStart = System.currentTimeMillis() - 12L * 60L * 60L * 1000L
    TendStore.removeExtraAlarms(ctx) { it.id !in live || it.at < graceStart }
  }

  /** Restore everything from the saved state (boot, app update). */
  fun restore(context: Context) {
    apply(context, TendStore.loadState(context), fireMissedAlarms = true)
  }

  /** Re-post/cancel the persistent notification, start/stop the unlock service, update widget and tile. */
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
      if (state.wantsPersistentNotification || TendNotifications.hasLiveAlert()) {
        TendNotifications.postPersistent(ctx, state)
      } else {
        TendNotifications.cancelPersistent(ctx)
      }
    }
    if (state.pending.isEmpty()) TendNotifications.cancelNudge(ctx)
    TendAlarms.syncWatchdog(ctx, state)
    TendWidget.updateAll(ctx, state)
    TendTileService.requestUpdate(ctx)
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

  /** An alarm of any [kind] fired for reminder or dose [id]. */
  @Synchronized
  fun onAlarmFired(
    context: Context,
    id: String,
    kind: String,
    title: String,
    body: String,
    dueAt: Long,
    doseHint: Boolean,
    criticalHint: Boolean
  ) {
    val ctx = context.applicationContext
    val now = System.currentTimeMillis()
    var state = TendStore.loadState(ctx)
    val key = AlarmItem.keyOf(kind, id)
    TendStore.removeScheduledAlarmId(ctx, key)
    if (kind != AlarmItem.KIND_MAIN) TendStore.removeExtraAlarms(ctx) { it.key == key }

    if (kind == AlarmItem.KIND_PRE) {
      // Only if it's still coming up, and nothing has asked for quiet.
      val stillOn = state.alarms.any { it.id == id } && !state.isPaused(now) && !state.isQuietAt(now)
      if (stillOn) TendNotifications.postPreWarn(ctx, state, id, title, dueAt)
      return
    }

    val alarm = if (kind == AlarmItem.KIND_MAIN) state.alarms.find { it.id == id } else null
    if (alarm != null) state = state.copy(alarms = state.alarms.filter { it.id != id })
    val dose = alarm?.dose == true || doseHint || id.startsWith("dose:")
    val critical = alarm?.critical == true || criticalHint || state.pending.any { it.id == id && it.critical }

    // Follow-ups are only for things still waiting.
    if (kind != AlarmItem.KIND_MAIN && state.pending.none { it.id == id }) {
      TendStore.saveState(ctx, state)
      return
    }

    // Something that comes due joins the "still to do" list, so the list, widget and unlock
    // screen know about it even if the app hasn't run today. Doses go to the top.
    if (state.pending.none { it.id == id }) {
      val time = SimpleDateFormat("HH:mm", Locale.ROOT).format(Date(if (dueAt > 0) dueAt else now))
      val item = PendingItem(
        id, if (dose) title.removePrefix("Time for ") else title, time, 0, 0, 0.0,
        dose = dose, critical = critical, dueAt = if (dueAt > 0) dueAt else now, chime = true
      )
      state = if (dose) state.copy(pending = listOf(item) + state.pending) else state.copy(pending = state.pending + item)
    }
    TendStore.saveState(ctx, state)
    TendNotifications.cancelPreWarn(ctx, id)

    val quiet = state.isQuietAt(now) && !critical
    val paused = state.isPaused(now) && !dose

    // What comes next.
    if (dose) {
      scheduleDoseNag(ctx, state, id, title, body, if (dueAt > 0) dueAt else now, critical, now)
    } else if (kind == AlarmItem.KIND_MAIN && state.nudgeAgainMinutes > 0) {
      TendAlarms.scheduleExtra(
        ctx,
        AlarmItem(id, title, body, now + state.nudgeAgainMinutes * 60_000L, kind = AlarmItem.KIND_AGAIN, dueAt = if (dueAt > 0) dueAt else now)
      )
    }
    TendAlarms.syncChime(ctx, state)
    refreshSurface(ctx, state)

    // Last, so nothing above re-posts it quietly: the grouped notification alerts.
    if (kind == AlarmItem.KIND_AGAIN) {
      // The one gentle follow-up: skipped entirely while quiet.
      if (!quiet && !paused) {
        TendNotifications.postReminder(ctx, state, id, silent = false, gentle = true)
        TendStore.setLastChimeAt(ctx, now)
      }
    } else {
      TendNotifications.postReminder(ctx, state, id, silent = quiet || paused, dose = dose, fullScreen = dose)
      if (!quiet && !paused) TendStore.setLastChimeAt(ctx, now)
    }
  }

  private fun scheduleDoseNag(
    ctx: Context,
    state: NativeState,
    id: String,
    title: String,
    body: String,
    dueAt: Long,
    critical: Boolean,
    now: Long
  ) {
    if (state.doseNagMinutes <= 0 || state.doseNagUntilMinutes <= 0) return
    val next = now + state.doseNagMinutes * 60_000L
    if (next > dueAt + state.doseNagUntilMinutes * 60_000L) return
    TendAlarms.scheduleExtra(
      ctx,
      AlarmItem(id, title, body, next, dose = true, critical = critical, kind = AlarmItem.KIND_NAG, dueAt = dueAt)
    )
  }

  /** The periodic gentle chime: once, about what's actually due, then line up the next one. */
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
    val items = state.chimeItems(now)
    val next = state.nextChimeAfter(now)
    TendAlarms.scheduleChime(ctx, next)
    TendStore.setNextChimeAt(ctx, next)
    // An exact alarm may start a foreground service: bring the unlock listener back if the
    // system killed it, so the unlock screen keeps working without opening the app.
    refreshSurface(ctx, state)
    if (items.isNotEmpty() && !state.isPaused(now) && !state.isQuietFor(now)) {
      TendNotifications.postChime(ctx, state)
      TendStore.setLastChimeAt(ctx, now)
    }
  }

  /** Takes [id] off every native surface (it's done, or moved away). */
  private fun drop(ctx: Context, id: String): NativeState {
    val state = TendStore.loadState(ctx)
    val next = state.copy(
      pending = state.pending.filter { it.id != id },
      alarms = state.alarms.filter { it.id != id }
    )
    TendStore.saveState(ctx, next)
    TendAlarms.cancel(ctx, id)
    TendNotifications.cancelReminder(ctx, id)
    TendAlarms.syncChime(ctx, next)
    refreshSurface(ctx, next)
    return next
  }

  @Synchronized
  fun complete(context: Context, id: String) {
    val ctx = context.applicationContext
    TendStore.addPendingAction(ctx, "complete", id, System.currentTimeMillis())
    drop(ctx, id)
    TendNativePlugin.notifyPendingActions(ctx)
  }

  /** "Tomorrow" on a reminder notification. */
  @Synchronized
  fun tomorrow(context: Context, id: String) {
    val ctx = context.applicationContext
    TendStore.addPendingAction(ctx, "tomorrow", id, System.currentTimeMillis())
    drop(ctx, id)
    TendNativePlugin.notifyPendingActions(ctx)
  }

  /** Ticks the next step; the list shows the new count straight away. */
  @Synchronized
  fun step(context: Context, id: String) {
    val ctx = context.applicationContext
    TendStore.addPendingAction(ctx, "step", id, System.currentTimeMillis())
    val state = TendStore.loadState(ctx)
    val item = state.pending.find { it.id == id }
    if (item != null && item.stepsDone + 1 >= item.stepsTotal) {
      // Last step: the app finishes it, so it leaves the list.
      drop(ctx, id)
    } else {
      val next = state.copy(pending = state.pending.map { if (it.id == id) it.copy(stepsDone = it.stepsDone + 1) else it })
      TendStore.saveState(ctx, next)
      refreshSurface(ctx, next)
    }
    TendNativePlugin.notifyPendingActions(ctx)
  }

  /** "Quiet for today": takes effect here and now, before the app has even run. Doses still remind. */
  @Synchronized
  fun quietToday(context: Context) {
    val ctx = context.applicationContext
    val now = System.currentTimeMillis()
    TendStore.addPendingAction(ctx, "quietToday", "", now)
    val state = TendStore.loadState(ctx).copy(pausedUntil = NativeState.endOfToday(now))
    TendStore.saveState(ctx, state)
    TendNotifications.cancelChime(ctx)
    TendNotifications.cancelNudge(ctx)
    TendAlarms.syncChime(ctx, state)
    refreshSurface(ctx, state)
    TendNativePlugin.notifyPendingActions(ctx)
  }

  /** Quick add from the shade, share sheet, tile, shortcut or widget: the app parses [text] when it next runs. */
  @Synchronized
  fun add(context: Context, text: String, fromShade: Boolean = false) {
    val ctx = context.applicationContext
    val clean = text.trim()
    if (clean.isEmpty()) return
    TendStore.addPendingAction(ctx, "add", "", System.currentTimeMillis(), clean)
    if (fromShade) {
      // An inline reply keeps spinning until the notification is posted again.
      val state = TendStore.loadState(ctx)
      if (state.wantsPersistentNotification || UnlockNudgeService.isRunning) {
        TendNotifications.postPersistent(ctx, state, added = "Added: $clean")
      }
    }
    TendNativePlugin.notifyPendingActions(ctx)
  }

  /** Snooze for [delayMs]: re-alerts natively, so it works without the app. */
  @Synchronized
  fun snooze(context: Context, id: String, title: String, body: String, delayMs: Long = TendIds.SNOOZE_MS) {
    val ctx = context.applicationContext
    val now = System.currentTimeMillis()
    TendStore.addPendingAction(ctx, "snooze", id, now)
    val state = TendStore.loadState(ctx)
    val prev = state.alarms.find { it.id == id }
    val item = state.pending.find { it.id == id }
    // A snooze replaces whatever follow-ups were lined up.
    TendAlarms.cancel(ctx, id)
    val alarm = AlarmItem(
      id, title, body, now + delayMs,
      dose = prev?.dose ?: (item?.dose ?: id.startsWith("dose:")),
      critical = prev?.critical ?: (item?.critical ?: false),
      kind = AlarmItem.KIND_SNOOZE,
      dueAt = item?.dueAt ?: prev?.at ?: now
    )
    TendAlarms.scheduleExtra(ctx, alarm)
    TendNotifications.cancelReminder(ctx, id)
    refreshSurface(ctx, state)
    TendNativePlugin.notifyPendingActions(ctx)
  }
}
