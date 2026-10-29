package com.tend.native

import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.tend.nativeplugin.R

object TendNotifications {
  const val CHANNEL_STILL_TO_DO = "tend_still_to_do"
  const val CHANNEL_REMINDERS = "tend_reminders"
  const val CHANNEL_NUDGE = "tend_nudge"

  private const val MAX_INBOX_LINES = 6

  private fun nm(ctx: Context): NotificationManager =
    ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

  fun ensureChannels(ctx: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val nm = nm(ctx)
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
    if (nm.getNotificationChannel(CHANNEL_REMINDERS) == null) {
      nm.createNotificationChannel(
        NotificationChannel(CHANNEL_REMINDERS, "Reminders", NotificationManager.IMPORTANCE_DEFAULT).apply {
          description = "A nudge at the time you set for a reminder."
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

  // ---- "still to do" ---------------------------------------------------------------------------

  private fun countPhrase(n: Int, verb: String): String =
    if (n == 1) "1 thing $verb" else "$n things $verb"

  private fun lineFor(item: PendingItem): String {
    val sb = StringBuilder()
    if (!item.time.isNullOrBlank()) sb.append(item.time).append("  ")
    sb.append(item.title)
    if (item.stepsTotal > 0) sb.append(" · ").append(item.stepsDone).append('/').append(item.stepsTotal).append(" steps")
    return sb.toString()
  }

  private fun baseBuilder(ctx: Context, channel: String): NotificationCompat.Builder =
    NotificationCompat.Builder(ctx, channel)
      .setSmallIcon(R.drawable.ic_tend_leaf)
      .setColor(ContextCompat.getColor(ctx, R.color.tend_accent))

  /** Used both as a plain notification and as the unlock service's foreground notification. */
  fun buildPersistent(ctx: Context, state: NativeState): Notification {
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
    activityPendingIntent(ctx, TendIds.RC_OPEN, TendIds.LAUNCH_OPEN, null)?.let { builder.setContentIntent(it) }
    return builder.build()
  }

  @SuppressLint("MissingPermission")
  fun postPersistent(ctx: Context, state: NativeState) {
    ensureChannels(ctx)
    nm(ctx).notify(TendIds.PERSISTENT_NOTIFICATION_ID, buildPersistent(ctx, state))
  }

  fun cancelPersistent(ctx: Context) {
    nm(ctx).cancel(TendIds.PERSISTENT_NOTIFICATION_ID)
  }

  // ---- timed reminders -------------------------------------------------------------------------

  @SuppressLint("MissingPermission")
  fun postReminder(ctx: Context, id: String, title: String, body: String, silent: Boolean) {
    ensureChannels(ctx)
    val builder = baseBuilder(ctx, CHANNEL_REMINDERS)
      .setContentTitle(title)
      .setAutoCancel(true)
      .setCategory(NotificationCompat.CATEGORY_REMINDER)
      .setPriority(NotificationCompat.PRIORITY_DEFAULT)
      .setShowWhen(true)
      .setWhen(System.currentTimeMillis())
      .setSilent(silent)
      .addAction(0, "Done", reminderActionPendingIntent(ctx, TendIds.ACTION_DONE, id, title, body))
      .addAction(0, "Snooze 15 min", reminderActionPendingIntent(ctx, TendIds.ACTION_SNOOZE, id, title, body))
    if (body.isNotBlank()) {
      builder.setContentText(body).setStyle(NotificationCompat.BigTextStyle().bigText(body))
    }
    activityPendingIntent(ctx, TendIds.stableHash("open-reminder", id), TendIds.LAUNCH_REMINDER, id)
      ?.let { builder.setContentIntent(it) }
    nm(ctx).notify(TendIds.reminderNotificationId(id), builder.build())
  }

  fun cancelReminder(ctx: Context, id: String) {
    nm(ctx).cancel(TendIds.reminderNotificationId(id))
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
