package com.tend.native

import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import androidx.core.app.RemoteInput
import androidx.core.content.ContextCompat
import com.tend.nativeplugin.R

object TendNotifications {
  const val CHANNEL_STILL_TO_DO = "tend_still_to_do"
  const val CHANNEL_NUDGE = "tend_nudge"

  /** Doses and the moment a timed reminder comes due: high importance, separate so muting the gentle cues never silences meds. */
  const val CHANNEL_ALERTS = "tend_alerts"

  /**
   * Gentle cues (the chime, the second nudge, heads-ups). Sound and vibration are fixed per
   * channel on Android 8+, so each cue style gets its own channel.
   */
  const val CHANNEL_GENTLE_SOUND = "tend_gentle_sound"
  const val CHANNEL_GENTLE_VIBRATE = "tend_gentle_vibrate"
  const val CHANNEL_GENTLE_SILENT = "tend_gentle_silent"

  /** Channels earlier versions created. Their importance can't be changed, so they're replaced. */
  private val OLD_CHANNELS = listOf("tend_chime", "tend_chime_alert", "tend_reminders")

  private const val MAX_INBOX_LINES = 6

  private fun nm(ctx: Context): NotificationManager =
    ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

  fun ensureChannels(ctx: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val nm = nm(ctx)
    for (old in OLD_CHANNELS) if (nm.getNotificationChannel(old) != null) nm.deleteNotificationChannel(old)
    if (nm.getNotificationChannel(CHANNEL_STILL_TO_DO) == null) {
      nm.createNotificationChannel(
        NotificationChannel(CHANNEL_STILL_TO_DO, "Still to do", NotificationManager.IMPORTANCE_LOW).apply {
          description = "A quiet, always-there list of what's still waiting today."
          setShowBadge(false)
          setSound(null, null)
          enableVibration(false)
          enableLights(false)
        }
      )
    }
    if (nm.getNotificationChannel(CHANNEL_ALERTS) == null) {
      nm.createNotificationChannel(
        NotificationChannel(CHANNEL_ALERTS, "Doses & timed reminders", NotificationManager.IMPORTANCE_HIGH).apply {
          description = "Medication, and the moment a reminder you gave a time comes due."
          enableVibration(true)
          vibrationPattern = longArrayOf(0, 250, 150, 250)
          lockscreenVisibility = Notification.VISIBILITY_PRIVATE
        }
      )
    }
    if (nm.getNotificationChannel(CHANNEL_GENTLE_SOUND) == null) {
      nm.createNotificationChannel(
        NotificationChannel(CHANNEL_GENTLE_SOUND, "Gentle nudges (sound)", NotificationManager.IMPORTANCE_DEFAULT).apply {
          description = "The occasional chime, a second nudge and heads-ups, with a sound."
          setShowBadge(false)
          enableVibration(false)
        }
      )
    }
    if (nm.getNotificationChannel(CHANNEL_GENTLE_VIBRATE) == null) {
      nm.createNotificationChannel(
        NotificationChannel(CHANNEL_GENTLE_VIBRATE, "Gentle nudges (vibrate)", NotificationManager.IMPORTANCE_DEFAULT).apply {
          description = "The occasional chime, a second nudge and heads-ups, as a short buzz."
          setShowBadge(false)
          setSound(null, null)
          enableVibration(true)
          vibrationPattern = longArrayOf(0, 200)
        }
      )
    }
    if (nm.getNotificationChannel(CHANNEL_GENTLE_SILENT) == null) {
      nm.createNotificationChannel(
        NotificationChannel(CHANNEL_GENTLE_SILENT, "Gentle nudges (silent)", NotificationManager.IMPORTANCE_LOW).apply {
          description = "The occasional chime, a second nudge and heads-ups, silently in the shade."
          setShowBadge(false)
          setSound(null, null)
          enableVibration(false)
        }
      )
    }
    if (nm.getNotificationChannel(CHANNEL_NUDGE) == null) {
      nm.createNotificationChannel(
        NotificationChannel(CHANNEL_NUDGE, "Unlock nudge", NotificationManager.IMPORTANCE_HIGH).apply {
          description = "Shown after unlocking when the full-screen reminder can't open."
          setSound(null, null)
          enableVibration(false)
        }
      )
    }
  }

  internal fun gentleChannel(cueStyle: String): String = when (cueStyle) {
    "vibrate" -> CHANNEL_GENTLE_VIBRATE
    "silent" -> CHANNEL_GENTLE_SILENT
    else -> CHANNEL_GENTLE_SOUND
  }

  /** Before Android 8 there are no channels: the same choice is made per notification. */
  internal fun NotificationCompat.Builder.gentleCue(cueStyle: String): NotificationCompat.Builder = when (cueStyle) {
    "vibrate" -> setDefaults(NotificationCompat.DEFAULT_VIBRATE).setPriority(NotificationCompat.PRIORITY_DEFAULT)
    "silent" -> setSilent(true).setPriority(NotificationCompat.PRIORITY_LOW)
    else -> setDefaults(NotificationCompat.DEFAULT_SOUND).setPriority(NotificationCompat.PRIORITY_DEFAULT)
  }

  // ---- intents -------------------------------------------------------------------------------

  /** The app's launcher activity (MainActivity), tagged with a Tend action. */
  fun launchIntent(ctx: Context, action: String?, reminderId: String?): Intent? {
    val intent = ctx.packageManager.getLaunchIntentForPackage(ctx.packageName) ?: return null
    intent.addFlags(
      Intent.FLAG_ACTIVITY_NEW_TASK or
        Intent.FLAG_ACTIVITY_SINGLE_TOP or
        Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
    )
    if (action != null) intent.putExtra(TendIds.EXTRA_ACTION, action)
    if (reminderId != null) intent.putExtra(TendIds.EXTRA_REMINDER_ID, reminderId)
    return intent
  }

  fun activityPendingIntent(ctx: Context, requestCode: Int, action: String?, reminderId: String?): PendingIntent? {
    val intent = launchIntent(ctx, action, reminderId) ?: return null
    return PendingIntent.getActivity(
      ctx,
      requestCode,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
  }

  fun quickAddPendingIntent(ctx: Context): PendingIntent =
    PendingIntent.getActivity(
      ctx,
      TendIds.RC_QUICK_ADD,
      QuickAddActivity.intent(ctx),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )

  private fun reminderActionPendingIntent(
    ctx: Context,
    action: String,
    id: String,
    title: String,
    body: String
  ): PendingIntent {
    val intent = Intent(ctx, ReminderActionReceiver::class.java)
      .setAction(action)
      .setData(TendIds.reminderUri("action", id))
      .putExtra(TendIds.EXTRA_REMINDER_ID, id)
      .putExtra(TendIds.EXTRA_TITLE, title)
      .putExtra(TendIds.EXTRA_BODY, body)
    return PendingIntent.getBroadcast(
      ctx,
      TendIds.stableHash(action, id),
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
  }

  private fun quietTodayPendingIntent(ctx: Context): PendingIntent =
    PendingIntent.getBroadcast(
      ctx,
      TendIds.RC_QUIET_TODAY,
      Intent(ctx, ReminderActionReceiver::class.java).setAction(TendIds.ACTION_QUIET_TODAY),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )

  private fun quietTodayAction(ctx: Context) =
    NotificationCompat.Action.Builder(0, "Quiet today", quietTodayPendingIntent(ctx)).build()

  private fun persistentDeletePendingIntent(ctx: Context): PendingIntent {
    val intent = Intent(ctx, PersistentDismissReceiver::class.java)
      .setAction(TendIds.ACTION_PERSISTENT_DISMISSED)
    return PendingIntent.getBroadcast(
      ctx,
      TendIds.RC_PERSISTENT_DISMISSED,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
  }

  /** "Add…" typed straight into the shade. RemoteInput needs a mutable PendingIntent to fill in. */
  private fun addAction(ctx: Context): NotificationCompat.Action {
    val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
    } else {
      PendingIntent.FLAG_UPDATE_CURRENT
    }
    val pi = PendingIntent.getBroadcast(
      ctx,
      TendIds.RC_ADD,
      Intent(ctx, ReminderActionReceiver::class.java).setAction(TendIds.ACTION_ADD).setPackage(ctx.packageName),
      flags
    )
    val input = RemoteInput.Builder(TendIds.KEY_ADD_TEXT).setLabel("e.g. call mum at 6").build()
    return NotificationCompat.Action.Builder(0, "Add…", pi)
      .addRemoteInput(input)
      .setAllowGeneratedReplies(false)
      .build()
  }

  // ---- "still to do" ---------------------------------------------------------------------------

  fun countPhrase(n: Int, verb: String): String =
    if (n == 1) "1 thing $verb" else "$n things $verb"

  fun lineFor(item: PendingItem): String {
    val sb = StringBuilder()
    if (!item.time.isNullOrBlank()) sb.append(item.time).append("  ")
    if (item.dose) sb.append("Take ")
    sb.append(item.title)
    if (item.stepsTotal > 0) sb.append(" · ").append(item.stepsDone).append('/').append(item.stepsTotal).append(" steps")
    return sb.toString()
  }

  private fun short(title: String, max: Int = 18): String =
    if (title.length <= max) title else title.take(max - 1).trimEnd() + "…"

  internal fun baseBuilder(ctx: Context, channel: String): NotificationCompat.Builder =
    NotificationCompat.Builder(ctx, channel)
      .setSmallIcon(R.drawable.ic_tend_leaf)
      .setColor(ContextCompat.getColor(ctx, R.color.tend_accent))

  /**
   * Used both as a plain notification and as the unlock service's foreground notification.
   * [added] is shown under the reply field right after an "Add…" (it also stops the spinner).
   */
  fun buildPersistent(ctx: Context, state: NativeState, added: CharSequence? = null): Notification {
    val n = state.pending.size
    val title = if (n == 0) "All clear for now" else countPhrase(n, "still waiting")
    val text = if (n == 0) "Nothing waiting. Nice." else state.pending.joinToString(" · ") { it.title }

    val style = NotificationCompat.InboxStyle().setBigContentTitle(title)
    state.pending.take(MAX_INBOX_LINES).forEach { style.addLine(lineFor(it)) }
    if (n > MAX_INBOX_LINES) style.setSummaryText("and ${n - MAX_INBOX_LINES} more")

    // What shows on a secure lock screen: just the count, never the titles.
    val publicVersion = baseBuilder(ctx, CHANNEL_STILL_TO_DO)
      .setContentTitle(title)
      .setContentText("Open Tend to see them")
      .build()

    val builder = baseBuilder(ctx, CHANNEL_STILL_TO_DO)
      .setContentTitle(title)
      .setContentText(text)
      .setStyle(style)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setSilent(true)
      .setShowWhen(false)
      .setLocalOnly(true)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
      .setPublicVersion(publicVersion)
      .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
      .setDeleteIntent(persistentDeletePendingIntent(ctx))
      .addAction(addAction(ctx))
    // The first thing with steps left gets a one-tap "next step done".
    state.pending.firstOrNull { it.hasStepsLeft }?.let { item ->
      builder.addAction(0, "✓ step · ${short(item.title)}", reminderActionPendingIntent(ctx, TendIds.ACTION_STEP, item.id, item.title, ""))
    }
    if (n > 0 && !state.isPaused()) builder.addAction(quietTodayAction(ctx))
    if (added != null) builder.setRemoteInputHistory(arrayOf(added))
    activityPendingIntent(ctx, TendIds.RC_OPEN, TendIds.LAUNCH_OPEN, null)?.let { builder.setContentIntent(it) }
    return builder.build()
  }

  @SuppressLint("MissingPermission")
  fun postPersistent(ctx: Context, state: NativeState, added: CharSequence? = null) {
    ensureChannels(ctx)
    nm(ctx).notify(TendIds.PERSISTENT_NOTIFICATION_ID, buildPersistent(ctx, state, added))
  }

  fun cancelPersistent(ctx: Context) {
    nm(ctx).cancel(TendIds.PERSISTENT_NOTIFICATION_ID)
  }

  // ---- timed reminders and doses ---------------------------------------------------------------

  /**
   * A reminder's or dose's own notification. [gentle]: the follow-up nudge, on the gentle channel
   * in the user's cue style. [fullScreen]: doses only, and only while the screen is off.
   */
  @SuppressLint("MissingPermission")
  fun postReminder(
    ctx: Context,
    id: String,
    title: String,
    body: String,
    silent: Boolean,
    dose: Boolean = false,
    gentle: Boolean = false,
    cueStyle: String = "sound",
    fullScreen: Boolean = false
  ) {
    ensureChannels(ctx)
    val builder = baseBuilder(ctx, if (gentle) gentleChannel(cueStyle) else CHANNEL_ALERTS)
      .setContentTitle(title)
      .setAutoCancel(true)
      .setCategory(NotificationCompat.CATEGORY_REMINDER)
      .setShowWhen(true)
      .setWhen(System.currentTimeMillis())
    if (gentle) {
      builder.gentleCue(cueStyle)
    } else {
      builder.setPriority(NotificationCompat.PRIORITY_HIGH)
        .setDefaults(NotificationCompat.DEFAULT_SOUND or NotificationCompat.DEFAULT_VIBRATE)
    }
    if (silent) builder.setSilent(true)
    if (dose) {
      builder
        .addAction(0, "Taken", reminderActionPendingIntent(ctx, TendIds.ACTION_DONE, id, title, body))
        .addAction(0, "Snooze 15 min", reminderActionPendingIntent(ctx, TendIds.ACTION_SNOOZE, id, title, body))
    } else {
      builder
        .addAction(0, "Done", reminderActionPendingIntent(ctx, TendIds.ACTION_DONE, id, title, body))
        .addAction(0, "1 h", reminderActionPendingIntent(ctx, TendIds.ACTION_SNOOZE_HOUR, id, title, body))
        .addAction(0, "Tomorrow", reminderActionPendingIntent(ctx, TendIds.ACTION_TOMORROW, id, title, body))
    }
    if (body.isNotBlank()) {
      builder.setContentText(body).setStyle(NotificationCompat.BigTextStyle().bigText(body))
    }
    activityPendingIntent(ctx, TendIds.stableHash("open-reminder", id), TendIds.LAUNCH_REMINDER, id)
      ?.let { builder.setContentIntent(it) }
    if (fullScreen && dose && !silent) {
      // A full-screen intent is what makes Android wake a sleeping screen. Doses only, and only
      // while the screen is off: when the phone is in use, a pop-up is enough.
      val pm = ctx.getSystemService(Context.POWER_SERVICE) as PowerManager
      if (!pm.isInteractive && canUseFullScreenIntent(ctx)) {
        activityPendingIntent(ctx, TendIds.RC_NAG, TendIds.LAUNCH_NAG, null)?.let { builder.setFullScreenIntent(it, true) }
      }
    }
    nm(ctx).notify(TendIds.reminderNotificationId(id), builder.build())
  }

  fun cancelReminder(ctx: Context, id: String) {
    nm(ctx).cancel(TendIds.reminderNotificationId(id))
    nm(ctx).cancel(TendIds.preWarnNotificationId(id))
  }

  /** "In 10 min: leave for the dentist." Gentle, and gone by the time the reminder itself arrives. */
  @SuppressLint("MissingPermission")
  fun postPreWarn(ctx: Context, state: NativeState, id: String, title: String, dueAt: Long) {
    ensureChannels(ctx)
    val minutes = ((dueAt - System.currentTimeMillis() + 30_000L) / 60_000L).coerceAtLeast(1L)
    val builder = baseBuilder(ctx, gentleChannel(state.cueStyle))
      .setContentTitle("In $minutes min: $title")
      .setContentText("A heads-up so it doesn't arrive out of nowhere.")
      .setAutoCancel(true)
      .setCategory(NotificationCompat.CATEGORY_REMINDER)
      .setShowWhen(false)
      .setLocalOnly(true)
      .setTimeoutAfter((dueAt - System.currentTimeMillis()).coerceAtLeast(60_000L))
      .gentleCue(state.cueStyle)
    activityPendingIntent(ctx, TendIds.stableHash("open-reminder", id), TendIds.LAUNCH_REMINDER, id)
      ?.let { builder.setContentIntent(it) }
    nm(ctx).notify(TendIds.preWarnNotificationId(id), builder.build())
  }

  fun cancelPreWarn(ctx: Context, id: String) {
    nm(ctx).cancel(TendIds.preWarnNotificationId(id))
  }

  private fun canUseFullScreenIntent(ctx: Context): Boolean =
    Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE || nm(ctx).canUseFullScreenIntent()

  // ---- periodic chime -------------------------------------------------------------------------

  /** The gentle "still waiting" cue about [items] (doses and timed reminders already due). Never wakes the screen. */
  @SuppressLint("MissingPermission")
  fun postChime(ctx: Context, state: NativeState, items: List<PendingItem>) {
    ensureChannels(ctx)
    val channel = gentleChannel(state.cueStyle)
    val n = items.size
    val title = countPhrase(n, "still waiting")
    val text = items.take(3).joinToString(" · ") { it.title }
    // What shows on a secure lock screen: just the count, never the titles.
    val publicVersion = baseBuilder(ctx, channel)
      .setContentTitle(title)
      .setContentText("Open Tend to see them")
      .build()
    val builder = baseBuilder(ctx, channel)
      .setContentTitle(title)
      .setContentText(text)
      .setAutoCancel(true)
      .setOnlyAlertOnce(false)
      .setCategory(NotificationCompat.CATEGORY_REMINDER)
      .gentleCue(state.cueStyle)
      .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
      .setPublicVersion(publicVersion)
      .setLocalOnly(true)
      .addAction(quietTodayAction(ctx))
      // The next chime replaces it anyway; don't leave a stale one behind.
      .setTimeoutAfter(state.chimeIntervalMs.coerceAtLeast(60_000L))
    activityPendingIntent(ctx, TendIds.RC_NAG, TendIds.LAUNCH_NAG, null)?.let { builder.setContentIntent(it) }
    nm(ctx).notify(TendIds.CHIME_NOTIFICATION_ID, builder.build())
  }

  fun cancelChime(ctx: Context) {
    nm(ctx).cancel(TendIds.CHIME_NOTIFICATION_ID)
  }

  // ---- unlock nudge fallback -------------------------------------------------------------------

  @SuppressLint("MissingPermission")
  fun postNudge(ctx: Context, state: NativeState, fullScreen: Boolean) {
    ensureChannels(ctx)
    val n = state.pending.size
    val title = "Before you dive in — ${countPhrase(n, if (n == 1) "is waiting" else "are waiting")}"
    val text = state.pending.take(3).joinToString(" · ") { it.title }
    val pi = activityPendingIntent(ctx, TendIds.RC_NAG, TendIds.LAUNCH_NAG, null)
    val builder = baseBuilder(ctx, CHANNEL_NUDGE)
      .setContentTitle(title)
      .setContentText(text)
      .setAutoCancel(true)
      .setCategory(NotificationCompat.CATEGORY_REMINDER)
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
      .setTimeoutAfter(10L * 60L * 1000L)
    if (pi != null) {
      builder.setContentIntent(pi)
      if (fullScreen) builder.setFullScreenIntent(pi, true)
    }
    nm(ctx).notify(TendIds.NUDGE_NOTIFICATION_ID, builder.build())
  }

  fun cancelNudge(ctx: Context) {
    nm(ctx).cancel(TendIds.NUDGE_NOTIFICATION_ID)
  }
}
