package com.tend.native

import android.Manifest
import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import androidx.core.content.ContextCompat
import org.json.JSONObject
import java.time.LocalDate
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/**
 * Steps counted by the phone itself, so Tend doesn't depend on a fitness app having synced to
 * Health Connect (Google Fit, for one, mostly syncs when it's opened).
 *
 * The step counter sensor counts in hardware, even while the phone sleeps and Tend isn't running,
 * as a running total since boot. Tend reads it now and then (every half hour, inexactly, and
 * whenever steps are read) and adds the difference since the last reading to that day.
 */
object TendSteps {
  private const val PREFS = "tend_steps"
  private const val KEY_LAST = "last_counter"
  private const val KEY_DAYS = "days"
  private const val KEEP_DAYS = 35L

  /** Wait this long for the sensor's first reading. */
  private const val SAMPLE_TIMEOUT_MS = 4_000L

  private fun prefs(ctx: Context) = ctx.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  private fun sensor(ctx: Context): Sensor? =
    (ctx.getSystemService(Context.SENSOR_SERVICE) as? SensorManager)?.getDefaultSensor(Sensor.TYPE_STEP_COUNTER)

  fun hasSensor(ctx: Context): Boolean = sensor(ctx) != null

  /** Android 10+ asks for "physical activity" before the step counter will report. */
  fun permitted(ctx: Context): Boolean =
    Build.VERSION.SDK_INT < Build.VERSION_CODES.Q ||
      ContextCompat.checkSelfPermission(ctx, Manifest.permission.ACTIVITY_RECOGNITION) == PackageManager.PERMISSION_GRANTED

  fun ready(ctx: Context): Boolean = hasSensor(ctx) && permitted(ctx)

  /** Reads the counter once (blocking, off the main thread) and books the new steps to today. */
  @Synchronized
  fun sample(ctx: Context): Boolean {
    if (!ready(ctx)) return false
    val sm = ctx.getSystemService(Context.SENSOR_SERVICE) as SensorManager
    val s = sensor(ctx) ?: return false
    val latch = CountDownLatch(1)
    var value = -1f
    val thread = HandlerThread("tend-steps").apply { start() }
    val listener = object : SensorEventListener {
      override fun onSensorChanged(event: SensorEvent) {
        if (value < 0f) value = event.values.firstOrNull() ?: -1f
        latch.countDown()
      }

      override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}
    }
    try {
      sm.registerListener(listener, s, SensorManager.SENSOR_DELAY_NORMAL, Handler(thread.looper))
      latch.await(SAMPLE_TIMEOUT_MS, TimeUnit.MILLISECONDS)
    } catch (_: Exception) {
    } finally {
      sm.unregisterListener(listener)
      thread.quitSafely()
    }
    if (value < 0f) return false
    record(ctx, value.toLong())
    return true
  }

  /** Adds what the counter moved since last time to today. A smaller value means the phone restarted. */
  private fun record(ctx: Context, counter: Long) {
    val p = prefs(ctx)
    val last = p.getLong(KEY_LAST, -1L)
    val delta = when {
      last < 0L -> 0L // first reading: only steps from now on are ours to count
      counter < last -> counter // rebooted: the counter started again from zero
      else -> counter - last
    }
    val days = days(ctx).toMutableMap()
    val today = LocalDate.now()
    if (delta > 0L) days[today.toString()] = (days[today.toString()] ?: 0L) + delta
    val cutoff = today.minusDays(KEEP_DAYS).toString()
    val json = JSONObject()
    for ((d, n) in days) if (d >= cutoff) json.put(d, n)
    p.edit().putLong(KEY_LAST, counter).putString(KEY_DAYS, json.toString()).apply()
  }

  /** "yyyy-MM-dd" → steps the phone counted that day. */
  fun days(ctx: Context): Map<String, Long> {
    val raw = prefs(ctx).getString(KEY_DAYS, null) ?: return emptyMap()
    return try {
      val o = JSONObject(raw)
      o.keys().asSequence().associateWith { o.getLong(it) }
    } catch (_: Exception) {
      emptyMap()
    }
  }

  // ---- background readings -----------------------------------------------------------------------

  private fun sampleIntent(ctx: Context, flags: Int): PendingIntent? =
    PendingIntent.getBroadcast(
      ctx,
      TendIds.RC_STEP_SAMPLE,
      Intent(ctx, ChimeReceiver::class.java).setAction(TendIds.ACTION_STEP_SAMPLE),
      flags or PendingIntent.FLAG_IMMUTABLE
    )

  /**
   * A reading every half hour or so, batched with other wake-ups by Android, so steps land on the
   * right day. Cheap: a few milliseconds of sensor time.
   */
  fun schedule(ctx: Context) {
    val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    if (!ready(ctx)) {
      sampleIntent(ctx, PendingIntent.FLAG_NO_CREATE)?.let {
        am.cancel(it)
        it.cancel()
      }
      return
    }
    if (sampleIntent(ctx, PendingIntent.FLAG_NO_CREATE) != null) return
    val pi = sampleIntent(ctx, PendingIntent.FLAG_UPDATE_CURRENT) ?: return
    am.setInexactRepeating(
      AlarmManager.RTC_WAKEUP,
      System.currentTimeMillis() + AlarmManager.INTERVAL_HALF_HOUR,
      AlarmManager.INTERVAL_HALF_HOUR,
      pi
    )
  }
}
