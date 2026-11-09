package com.tend.native

import android.annotation.SuppressLint
import android.app.AlarmManager
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import androidx.core.app.AlarmManagerCompat
import androidx.core.app.NotificationCompat
import com.tend.nativeplugin.R
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

/**
 * The daily weather check-in: at `moodTime` a notification shows five faces, and tapping one logs
 * the mood without opening the app (the app saves it from a `mood` pending action). Mirrors
 * WEATHERS in weather.ts.
 */
object TendMood {
  private class Option(val value: Int, val face: String, val feel: String, val icon: String, val label: String, val line: String, val faceId: Int, val cellId: Int, val feelId: Int)

  private val OPTIONS = listOf(
    Option(5, "😄", "Great", "☀️", "Bright & sunny", "Full sun. The rain from other days is what lets it bloom.", R.id.tend_mood_face_5, R.id.tend_mood_5, R.id.tend_mood_feel_5),
    Option(4, "🙂", "Good", "🌤️", "Sunny", "Sunny. The leaves are turning to the light.", R.id.tend_mood_face_4, R.id.tend_mood_4, R.id.tend_mood_feel_4),
    Option(3, "😐", "Okay", "⛅", "Partly cloudy", "Partly cloudy. Leaves like a rest from the glare.", R.id.tend_mood_face_3, R.id.tend_mood_3, R.id.tend_mood_feel_3),
    Option(2, "😔", "Low", "🌧️", "Rain", "Rain. Roots drink deepest on days like this.", R.id.tend_mood_face_2, R.id.tend_mood_2, R.id.tend_mood_feel_2),
    Option(1, "😣", "Rough", "⛈️", "Thunder", "A storm. Trees that weather them grow the deepest roots.", R.id.tend_mood_face_1, R.id.tend_mood_1, R.id.tend_mood_feel_1),
  )

  private const val TITLE = "How's the weather in you?"

  fun day(ms: Long): String = SimpleDateFormat("yyyy-MM-dd", Locale.ROOT).format(Date(ms))

  private fun nm(ctx: Context) = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

  // ---- scheduling ------------------------------------------------------------------------------

  /** The next check-in after [fromMs]: today's if it's still ahead and today isn't logged, else tomorrow's. */
  fun nextAt(state: NativeState, fromMs: Long): Long? {
    val minutes = state.moodTime?.let { QuietHours.minutesOf(it) } ?: return null
    val cal = Calendar.getInstance().apply {
      timeInMillis = fromMs
      set(Calendar.HOUR_OF_DAY, minutes / 60)
      set(Calendar.MINUTE, minutes % 60)
      set(Calendar.SECOND, 0)
      set(Calendar.MILLISECOND, 0)
    }
    while (cal.timeInMillis <= fromMs || day(cal.timeInMillis) == state.moodLoggedDay) cal.add(Calendar.DAY_OF_YEAR, 1)
    return cal.timeInMillis
  }

  private fun alarmIntent(ctx: Context, flags: Int): PendingIntent? =
    PendingIntent.getBroadcast(
      ctx,
      TendIds.RC_MOOD_TIME,
      Intent(ctx, MoodReceiver::class.java).setAction(TendIds.ACTION_MOOD_TIME),
      flags or PendingIntent.FLAG_IMMUTABLE
    )

  /** Keep the one daily alarm in line with [state]; once today is logged, the ask goes away. */
  fun sync(ctx: Context, state: NativeState, now: Long = System.currentTimeMillis()) {
    if (state.moodLoggedDay == day(now) || state.moodTime == null) nm(ctx).cancel(TendIds.MOOD_NOTIFICATION_ID)
    val at = nextAt(state, now)
    if (at == null) {
      alarmIntent(ctx, PendingIntent.FLAG_NO_CREATE)?.let {
        (ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager).cancel(it)
        it.cancel()
      }
      return
    }
    val pi = alarmIntent(ctx, PendingIntent.FLAG_UPDATE_CURRENT) ?: return
    val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    // A few minutes either way doesn't matter here: no need for an exact alarm.
    AlarmManagerCompat.setAndAllowWhileIdle(am, AlarmManager.RTC_WAKEUP, at, pi)
  }

  /** The alarm fired: ask, unless today's already answered. Then line up tomorrow. */
  @Synchronized
  fun onTime(context: Context) {
    val ctx = context.applicationContext
    val state = TendStore.loadState(ctx)
    val now = System.currentTimeMillis()
    if (state.moodTime != null && state.moodLoggedDay != day(now)) {
      post(ctx, state, silent = state.isPaused(now) || state.isQuietAt(now))
    }
    // From a minute on, so a slightly early wake can't schedule the same moment again.
    sync(ctx, state, now + 60_000L)
  }

  // ---- the notification ------------------------------------------------------------------------

  private fun pickIntent(ctx: Context, value: Int): PendingIntent =
    PendingIntent.getBroadcast(
      ctx,
      TendIds.stableHash("mood", value.toString()),
      Intent(ctx, ReminderActionReceiver::class.java)
        .setAction(TendIds.ACTION_MOOD)
        .setData(TendIds.reminderUri("mood", value.toString()))
        .putExtra(TendIds.EXTRA_MOOD, value),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )

  private fun faces(ctx: Context, layout: Int): RemoteViews {
    val views = RemoteViews(ctx.packageName, layout)
    for (o in OPTIONS) {
      views.setTextViewText(o.faceId, o.face)
      views.setTextViewText(o.feelId, o.feel)
      views.setOnClickPendingIntent(o.cellId, pickIntent(ctx, o.value))
      views.setContentDescription(o.cellId, o.feel)
    }
    return views
  }

  private fun endOfDay(now: Long) = NativeState.endOfToday(now)

  @SuppressLint("MissingPermission")
  fun post(ctx: Context, state: NativeState, silent: Boolean) {
    TendNotifications.ensureChannels(ctx)
    val now = System.currentTimeMillis()
    val small = faces(ctx, R.layout.tend_mood)
    val big = faces(ctx, R.layout.tend_mood_big)
    big.setTextViewText(R.id.tend_mood_title, TITLE)
    val builder = with(TendNotifications) {
      baseBuilder(ctx, gentleChannel(state.cueStyle))
        .gentleCue(state.cueStyle)
    }
      .setContentTitle(TITLE)
      .setContentText("Tap a face. Rain and sun both help the tree grow.")
      .setStyle(NotificationCompat.DecoratedCustomViewStyle())
      .setCustomContentView(small)
      .setCustomBigContentView(big)
      .setCategory(NotificationCompat.CATEGORY_REMINDER)
      .setAutoCancel(true)
      .setOnlyAlertOnce(true)
      .setShowWhen(false)
      .setLocalOnly(true)
      // Yesterday's weather has passed.
      .setTimeoutAfter((endOfDay(now) - now).coerceAtLeast(60_000L))
    if (silent) builder.setSilent(true)
    TendNotifications.activityPendingIntent(ctx, TendIds.RC_MOOD_OPEN, TendIds.LAUNCH_OPEN, null)?.let { builder.setContentIntent(it) }
    nm(ctx).notify(TendIds.MOOD_NOTIFICATION_ID, builder.build())
  }

  /** A face was tapped: queue it for the app, stop asking today, and answer with its weather. */
  @SuppressLint("MissingPermission")
  @Synchronized
  fun log(context: Context, value: Int) {
    val ctx = context.applicationContext
    val now = System.currentTimeMillis()
    TendStore.addPendingAction(ctx, "mood", "", now, value.toString())
    val state = TendStore.loadState(ctx).copy(moodLoggedDay = day(now))
    TendStore.saveState(ctx, state)
    nm(ctx).cancel(TendIds.MOOD_NOTIFICATION_ID)
    sync(ctx, state, now)

    val o = OPTIONS.first { it.value == value }
    val builder = TendNotifications.baseBuilder(ctx, TendNotifications.CHANNEL_GENTLE_SILENT)
      .setContentTitle("${o.icon}  ${o.label}")
      .setContentText(o.line)
      .setStyle(NotificationCompat.BigTextStyle().bigText(o.line))
      .setSilent(true)
      .setAutoCancel(true)
      .setShowWhen(false)
      .setLocalOnly(true)
      .setPriority(NotificationCompat.PRIORITY_LOW)
    if (state.moodReasons) {
      // Room to tap "what's behind it", which opens Tend on the reasons.
      val why = TendNotifications.activityPendingIntent(ctx, TendIds.RC_MOOD_WHY, TendIds.LAUNCH_MOOD_WHY, null)
      builder.setTimeoutAfter(10L * 60L * 1000L)
      why?.let {
        builder.setContentIntent(it)
        builder.addAction(0, "Add what's behind it", it)
      }
    } else {
      builder.setTimeoutAfter(8_000L)
      TendNotifications.activityPendingIntent(ctx, TendIds.RC_MOOD_OPEN, TendIds.LAUNCH_OPEN, null)?.let { builder.setContentIntent(it) }
    }
    nm(ctx).notify(TendIds.MOOD_DONE_NOTIFICATION_ID, builder.build())
    TendNativePlugin.notifyPendingActions(ctx)
  }
}
