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

  // ---- the one notification ------------------------------------------------------------------
  //
  // Tend shows a single notification: the grouped "still to do" list. It is always there while
  // something is waiting and comes back if swiped away. Reminders, doses, the chime, heads-ups and
  // the unlock fallback don't post cards of their own: they re-post this one on an alerting
  // channel so it sounds, peeks or wakes the screen, then it settles back to quiet.

  /** How the next post of the grouped notification should alert. */
  data class Alert(
    val kind: String,
    val channel: String,
    val cueStyle: String? = null,
    /** Replaces the title, e.g. "In 10 min: dentist". */
    val headline: String? = null,
    /** The item whose buttons (Taken / Done / Snooze) are shown. */
    val focusId: String? = null,
    val fullScreen: Boolean = false,
    /** Re-posts keep this alert's channel, headline and focus (quietly) until then. */
    val until: Long = System.currentTimeMillis() + ALERT_HOLD_MS
  )

  const val ALERT_REMINDER = "reminder"
  const val ALERT_CHIME = "chime"
  const val ALERT_PREWARN = "prewarn"
  const val ALERT_NUDGE = "nudge"

  /** Long enough that a state push right after an alert doesn't knock it off its channel. */
  private const val ALERT_HOLD_MS = 2L * 60L * 1000L

  @Volatile
  private var activeAlert: Alert? = null

  private fun liveAlert(now: Long = System.currentTimeMillis()): Alert? =
    activeAlert?.takeIf { it.until > now }

  /** A heads-up keeps the notification up for a moment even when the list itself is empty. */
  fun hasLiveAlert(): Boolean = liveAlert() != null

  private fun clearAlert(match: (Alert) -> Boolean) {
    val a = activeAlert ?: return
    if (match(a)) activeAlert = null
  }

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

  /** What gets the one-tap buttons: the alert's item, else a due dose, else a reminder whose time has come. */
  private fun focusItem(state: NativeState, focusId: String?, now: Long): PendingItem? =
    state.pending.firstOrNull { it.id == focusId }
      ?: state.pending.firstOrNull { it.dose && it.chimesAt(now) }
      ?: state.pending.firstOrNull { it.dueAt != null && it.dueAt <= now }

  /**
   * The grouped notification. Used as a plain notification and as the unlock service's foreground
   * notification. [alert]: sound/peek this time. Without one, a still-live alert's look is kept
   * but nothing re-alerts. [added] shows under the reply field right after an "Add…".
   */
  fun buildPersistent(
    ctx: Context,
    state: NativeState,
    added: CharSequence? = null,
    alert: Alert? = null
  ): Notification {
    val now = System.currentTimeMillis()
    val look = alert ?: liveAlert(now)
    val channel = look?.channel ?: CHANNEL_STILL_TO_DO

    val n = state.pending.size
    val countTitle = if (n == 0) "All clear for now" else countPhrase(n, "still waiting")
    val headline = look?.headline
    val title = headline ?: countTitle
    val list = state.pending.joinToString(" · ") { it.title }
    val text = when {
      n == 0 -> if (headline != null) "A heads-up so it doesn't arrive out of nowhere." else "Nothing waiting. Nice."
      headline != null -> "$countTitle: $list"
      else -> list
    }

    val style = NotificationCompat.InboxStyle().setBigContentTitle(title)
    state.pending.take(MAX_INBOX_LINES).forEach { style.addLine(lineFor(it)) }
    if (n > MAX_INBOX_LINES) style.setSummaryText("and ${n - MAX_INBOX_LINES} more")

    // What shows on a secure lock screen: just the count, never the titles.
    val publicVersion = baseBuilder(ctx, channel)
      .setContentTitle(countTitle)
      .setContentText("Open Tend to see them")
      .build()

    val builder = baseBuilder(ctx, channel)
      .setContentTitle(title)
      .setContentText(text)
      .setStyle(style)
      .setOngoing(true)
      .setLocalOnly(true)
      .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
      .setPublicVersion(publicVersion)
      .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
      .setDeleteIntent(persistentDeletePendingIntent(ctx))

    // With item cards showing, this becomes their group's summary: it does all the alerting
    // (GROUP_ALERT_SUMMARY), and expanding it shows each item with its own buttons.
    if (itemsToShow(ctx, state).isNotEmpty()) {
      builder.setGroup(GROUP_KEY)
        .setGroupSummary(true)
        .setGroupAlertBehavior(NotificationCompat.GROUP_ALERT_SUMMARY)
        .setSortKey("0")
    }

    if (alert != null) {
      builder.setOnlyAlertOnce(false)
        .setCategory(NotificationCompat.CATEGORY_REMINDER)
        .setShowWhen(true)
        .setWhen(now)
      when (channel) {
        CHANNEL_ALERTS -> builder.setPriority(NotificationCompat.PRIORITY_HIGH)
          .setDefaults(NotificationCompat.DEFAULT_SOUND or NotificationCompat.DEFAULT_VIBRATE)
        CHANNEL_NUDGE -> builder.setPriority(NotificationCompat.PRIORITY_HIGH)
        else -> builder.gentleCue(alert.cueStyle ?: state.cueStyle)
      }
    } else {
      builder.setOnlyAlertOnce(true)
        .setSilent(true)
        .setShowWhen(false)
        .setPriority(if (look != null) NotificationCompat.PRIORITY_DEFAULT else NotificationCompat.PRIORITY_LOW)
    }

    // Buttons (Android shows three): the due item's first, then "Add…".
    val focus = focusItem(state, look?.focusId, now)
    if (focus != null) {
      val name = short(focus.title)
      if (focus.dose) {
        builder.addAction(0, "Taken · $name", reminderActionPendingIntent(ctx, TendIds.ACTION_DONE, focus.id, focus.title, ""))
        builder.addAction(0, "Snooze 15 min", reminderActionPendingIntent(ctx, TendIds.ACTION_SNOOZE, focus.id, focus.title, ""))
      } else {
        builder.addAction(0, "Done · $name", reminderActionPendingIntent(ctx, TendIds.ACTION_DONE, focus.id, focus.title, ""))
        builder.addAction(0, "1 h", reminderActionPendingIntent(ctx, TendIds.ACTION_SNOOZE_HOUR, focus.id, focus.title, ""))
      }
      builder.addAction(addAction(ctx))
    } else {
      builder.addAction(addAction(ctx))
      // The first thing with steps left gets a one-tap "next step done".
      state.pending.firstOrNull { it.hasStepsLeft }?.let { item ->
        builder.addAction(0, "✓ step · ${short(item.title)}", reminderActionPendingIntent(ctx, TendIds.ACTION_STEP, item.id, item.title, ""))
      }
      if (n > 0 && !state.isPaused()) builder.addAction(quietTodayAction(ctx))
    }
    if (added != null) builder.setRemoteInputHistory(arrayOf(added))

    val focusId = look?.focusId
    val tap = when (look?.kind) {
      ALERT_CHIME, ALERT_NUDGE -> activityPendingIntent(ctx, TendIds.RC_NAG, TendIds.LAUNCH_NAG, null)
      ALERT_REMINDER, ALERT_PREWARN -> focusId?.let {
        activityPendingIntent(ctx, TendIds.stableHash("open-reminder", it), TendIds.LAUNCH_REMINDER, it)
      }
      else -> null
    } ?: activityPendingIntent(ctx, TendIds.RC_OPEN, TendIds.LAUNCH_OPEN, null)
    tap?.let { builder.setContentIntent(it) }

    if (alert != null && alert.fullScreen) {
      // A full-screen intent is what makes Android wake a sleeping screen. Doses only while the
      // screen is off (when the phone is in use, a peek is enough), and the unlock fallback.
      val pm = ctx.getSystemService(Context.POWER_SERVICE) as PowerManager
      val wake = alert.kind == ALERT_NUDGE || !pm.isInteractive
      if (wake && canUseFullScreenIntent(ctx)) {
        activityPendingIntent(ctx, TendIds.RC_NAG, TendIds.LAUNCH_NAG, null)?.let { builder.setFullScreenIntent(it, true) }
      }
    }
    return builder.build()
  }

  @SuppressLint("MissingPermission")
  fun postPersistent(ctx: Context, state: NativeState, added: CharSequence? = null) {
    ensureChannels(ctx)
    nm(ctx).notify(TendIds.PERSISTENT_NOTIFICATION_ID, buildPersistent(ctx, state, added))
    syncItems(ctx, state)
  }

  /** Re-post the grouped notification so it alerts. */
  @SuppressLint("MissingPermission")
  private fun postAlert(ctx: Context, state: NativeState, alert: Alert) {
    ensureChannels(ctx)
    activeAlert = alert
    nm(ctx).notify(TendIds.PERSISTENT_NOTIFICATION_ID, buildPersistent(ctx, state, alert = alert))
    syncItems(ctx, state)
  }

  fun cancelPersistent(ctx: Context) {
    activeAlert = null
    nm(ctx).cancel(TendIds.PERSISTENT_NOTIFICATION_ID)
    syncItems(ctx, null)
  }

  // ---- one card per waiting item ---------------------------------------------------------------
  //
  // Like a pill-reminder checklist: expanding the notification lists every waiting item, each with
  // its own Done / Taken button. They're children of one group, so they stay together under the
  // summary above, which does the alerting; the cards themselves are always silent.
  //
  // Ticking one off only cancels that card. Everything is re-posted together only when a new item
  // joins while others are already showing, so the group stays in order and in one piece.

  private const val GROUP_KEY = "com.tend.native.STILL_TO_DO"

  /** Android caps an app at ~50 notifications; past this many the summary's "and N more" covers it. */
  private const val MAX_ITEM_CARDS = 12

  /** Groups need Android 7. Swiped-away cards stay away until their item leaves the list. */
  internal fun itemsToShow(ctx: Context, state: NativeState): List<PendingItem> {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N || state.pending.isEmpty()) return emptyList()
    val dismissed = TendStore.dismissedItems(ctx)
    return state.pending.filter { it.id !in dismissed }.take(MAX_ITEM_CARDS)
  }

  private fun itemTag(id: String) = TendIds.ITEM_TAG + id

  /** What the card shows: when this changes, the card is re-posted (quietly). */
  private fun itemSignature(item: PendingItem) =
    "${item.title}|${item.time}|${item.stepsDone}/${item.stepsTotal}|${item.dose}|${item.reward}"

  /** Doses first, then by time, untimed last: the order the app lists them in. */
  private fun itemSortKey(item: PendingItem) =
    "1${if (item.dose) 0 else 1}${item.time ?: "99:99"}${item.title.lowercase()}"

  private fun itemText(item: PendingItem): String {
    val parts = mutableListOf<String>()
    if (!item.time.isNullOrBlank()) parts += item.time
    if (item.stepsTotal > 0) parts += "${item.stepsDone}/${item.stepsTotal} steps"
    if (!item.dose && item.reward > 0) parts += "${item.reward.toInt()} seeds"
    return parts.joinToString(" · ").ifEmpty { "Whenever you're ready" }
  }

  private fun itemDismissPendingIntent(ctx: Context, id: String): PendingIntent =
    PendingIntent.getBroadcast(
      ctx,
      TendIds.stableHash(TendIds.ACTION_ITEM_DISMISSED, id),
      Intent(ctx, ReminderActionReceiver::class.java)
        .setAction(TendIds.ACTION_ITEM_DISMISSED)
        .setData(TendIds.reminderUri("dismissed", id))
        .putExtra(TendIds.EXTRA_REMINDER_ID, id),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )

  private fun buildItem(ctx: Context, item: PendingItem): Notification {
    val title = if (item.dose) "Take ${item.title}" else item.title
    val publicVersion = baseBuilder(ctx, CHANNEL_STILL_TO_DO)
      .setContentTitle(if (item.dose) "A dose is waiting" else "Something is waiting")
      .setContentText("Open Tend to see it")
      .build()
    val b = baseBuilder(ctx, CHANNEL_STILL_TO_DO)
      .setContentTitle(title)
      .setContentText(itemText(item))
      .setGroup(GROUP_KEY)
      .setGroupAlertBehavior(NotificationCompat.GROUP_ALERT_SUMMARY)
      .setSortKey(itemSortKey(item))
      .setOnlyAlertOnce(true)
      .setSilent(true)
      .setShowWhen(false)
      .setLocalOnly(true)
      .setCategory(NotificationCompat.CATEGORY_REMINDER)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
      .setPublicVersion(publicVersion)
      .setDeleteIntent(itemDismissPendingIntent(ctx, item.id))
    activityPendingIntent(ctx, TendIds.stableHash("open-reminder", item.id), TendIds.LAUNCH_REMINDER, item.id)
      ?.let { b.setContentIntent(it) }
    if (item.dose) {
      b.addAction(0, "✓ Taken", reminderActionPendingIntent(ctx, TendIds.ACTION_DONE, item.id, item.title, ""))
      b.addAction(0, "Snooze 15 min", reminderActionPendingIntent(ctx, TendIds.ACTION_SNOOZE, item.id, item.title, ""))
    } else {
      b.addAction(0, "✓ Done", reminderActionPendingIntent(ctx, TendIds.ACTION_DONE, item.id, item.title, ""))
      if (item.hasStepsLeft) {
        b.addAction(0, "✓ Next step", reminderActionPendingIntent(ctx, TendIds.ACTION_STEP, item.id, item.title, ""))
      }
      b.addAction(0, "1 h", reminderActionPendingIntent(ctx, TendIds.ACTION_SNOOZE_HOUR, item.id, item.title, ""))
    }
    return b.build()
  }

  /**
   * Brings the item cards in line with [state] (null: take them all down). Cards whose item is gone
   * are cancelled on their own and the rest are left alone, so ticking one off never re-alerts or
   * reshuffles the others. When a new item arrives, every card is re-posted with it so the group
   * stays whole.
   */
  @SuppressLint("MissingPermission")
  @Synchronized
  fun syncItems(ctx: Context, state: NativeState?) {
    val nm = nm(ctx)
    val posted = TendStore.postedItems(ctx)
    val want = if (state == null) emptyList() else itemsToShow(ctx, state)
    val wantIds = want.map { it.id }.toSet()

    for (id in posted.keys) if (id !in wantIds) nm.cancel(itemTag(id), TendIds.ITEM_NOTIFICATION_ID)

    val joined = want.any { it.id !in posted }
    val next = LinkedHashMap<String, String>()
    for (item in want) {
      val sig = itemSignature(item)
      if (joined || posted[item.id] != sig) nm.notify(itemTag(item.id), TendIds.ITEM_NOTIFICATION_ID, buildItem(ctx, item))
      next[item.id] = sig
    }
    if (next != posted) TendStore.savePostedItems(ctx, next)

    // Forget swipes for items that have left the list.
    if (state != null) {
      val live = state.pending.map { it.id }.toSet()
      val dismissed = TendStore.dismissedItems(ctx)
      val kept = dismissed.filter { it in live }.toSet()
      if (kept.size != dismissed.size) TendStore.saveDismissedItems(ctx, kept)
    }
  }

  /** The user swiped one card away. It stays in the summary's list; the group carries on without it. */
  fun onItemDismissed(ctx: Context, id: String) {
    TendStore.saveDismissedItems(ctx, TendStore.dismissedItems(ctx) + id)
    val posted = TendStore.postedItems(ctx)
    if (id in posted) TendStore.savePostedItems(ctx, posted - id)
    // The summary drops its group flag if that was the last card.
    TendEngine.refreshSurface(ctx, TendStore.loadState(ctx))
  }

  // ---- timed reminders and doses ---------------------------------------------------------------

  /**
   * A reminder or dose came due: the grouped notification alerts with its buttons. [gentle]: the
   * follow-up nudge, in the user's cue style. [fullScreen]: doses only, and only while the screen
   * is off. [silent] (quiet hours, paused): it just joins the list.
   */
  fun postReminder(
    ctx: Context,
    state: NativeState,
    id: String,
    silent: Boolean,
    dose: Boolean = false,
    gentle: Boolean = false,
    fullScreen: Boolean = false
  ) {
    if (silent) {
      postPersistent(ctx, state)
      return
    }
    postAlert(
      ctx, state,
      Alert(
        ALERT_REMINDER,
        if (gentle) gentleChannel(state.cueStyle) else CHANNEL_ALERTS,
        cueStyle = state.cueStyle,
        focusId = id,
        fullScreen = fullScreen && dose
      )
    )
  }

  /** [id] is done or moved: drop its alert look. Also clears cards older versions posted. */
  fun cancelReminder(ctx: Context, id: String) {
    clearAlert { it.focusId == id }
    nm(ctx).cancel(TendIds.reminderNotificationId(id))
    nm(ctx).cancel(TendIds.preWarnNotificationId(id))
  }

  /** "In 10 min: leave for the dentist." Gentle; the headline goes once the reminder is due. */
  fun postPreWarn(ctx: Context, state: NativeState, id: String, title: String, dueAt: Long) {
    val now = System.currentTimeMillis()
    val minutes = ((dueAt - now + 30_000L) / 60_000L).coerceAtLeast(1L)
    postAlert(
      ctx, state,
      Alert(
        ALERT_PREWARN,
        gentleChannel(state.cueStyle),
        cueStyle = state.cueStyle,
        headline = "In $minutes min: $title",
        focusId = id,
        until = dueAt.coerceAtLeast(now + 60_000L)
      )
    )
  }

  fun cancelPreWarn(ctx: Context, id: String) {
    clearAlert { it.kind == ALERT_PREWARN && it.focusId == id }
    nm(ctx).cancel(TendIds.preWarnNotificationId(id))
  }

  private fun canUseFullScreenIntent(ctx: Context): Boolean =
    Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE || nm(ctx).canUseFullScreenIntent()

  // ---- periodic chime -------------------------------------------------------------------------

  /** The gentle "still waiting" cue: the grouped notification chimes. Never wakes the screen. */
  fun postChime(ctx: Context, state: NativeState) {
    postAlert(ctx, state, Alert(ALERT_CHIME, gentleChannel(state.cueStyle), cueStyle = state.cueStyle))
  }

  fun cancelChime(ctx: Context) {
    clearAlert { it.kind == ALERT_CHIME }
    // Left over from versions that posted the chime as its own card.
    nm(ctx).cancel(TendIds.CHIME_NOTIFICATION_ID)
  }

  // ---- unlock nudge fallback -------------------------------------------------------------------

  /** The unlock screen couldn't open: the grouped notification peeks (or goes full screen) instead. */
  fun postNudge(ctx: Context, state: NativeState, fullScreen: Boolean) {
    val n = state.pending.size
    postAlert(
      ctx, state,
      Alert(
        ALERT_NUDGE,
        CHANNEL_NUDGE,
        headline = "Before you dive in — ${countPhrase(n, if (n == 1) "is waiting" else "are waiting")}",
        fullScreen = fullScreen
      )
    )
  }

  fun cancelNudge(ctx: Context) {
    clearAlert { it.kind == ALERT_NUDGE }
    nm(ctx).cancel(TendIds.NUDGE_NOTIFICATION_ID)
  }
}
