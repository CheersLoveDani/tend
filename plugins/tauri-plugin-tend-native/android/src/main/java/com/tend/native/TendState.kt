package com.tend.native

import org.json.JSONArray
import org.json.JSONObject
import java.util.Calendar

/** One of today's (or overdue) incomplete reminders, already sorted by the JS side. */
data class PendingItem(
  val id: String,
  val title: String,
  val time: String?,
  val stepsDone: Int,
  val stepsTotal: Int,
  val reward: Double,
  /** A medication dose: listed first, and chimed about until it's taken. */
  val dose: Boolean = false,
  /** Reminds even during quiet hours. */
  val critical: Boolean = false,
  /** Epoch ms of its time today, or null when it has no time today (untimed, or from an earlier day). */
  val dueAt: Long? = null,
  /** JS's view at push time: a dose, or a timed reminder already due today. */
  val chime: Boolean = false
) {
  /** Worth a chime: doses, and timed reminders whose time has come today. Never untimed or old items. */
  fun chimesAt(now: Long): Boolean = dose || chime || (dueAt != null && dueAt <= now)

  val hasStepsLeft: Boolean get() = stepsTotal > 0 && stepsDone < stepsTotal

  fun toJson(): JSONObject = JSONObject()
    .put("id", id)
    .put("title", title)
    .put("time", time ?: JSONObject.NULL)
    .put("stepsDone", stepsDone)
    .put("stepsTotal", stepsTotal)
    .put("reward", reward)
    .put("dose", dose)
    .put("critical", critical)
    .put("dueAt", dueAt ?: JSONObject.NULL)
    .put("chime", chime)

  companion object {
    fun fromJson(o: JSONObject) = PendingItem(
      id = o.optString("id"),
      title = o.optString("title"),
      time = o.optStringOrNull("time"),
      stepsDone = o.optInt("stepsDone", 0),
      stepsTotal = o.optInt("stepsTotal", 0),
      reward = o.optDouble("reward", 0.0).let { if (it.isNaN()) 0.0 else it },
      dose = o.optBoolean("dose", false),
      critical = o.optBoolean("critical", false),
      dueAt = if (o.has("dueAt") && !o.isNull("dueAt")) o.optLong("dueAt") else null,
      chime = o.optBoolean("chime", false)
    )
  }
}

/**
 * A timed reminder to fire at [at] (epoch ms).
 * [kind]: `main` (pushed from JS, at the reminder's time) or one Tend lines up natively:
 * `pre` (heads-up before), `again` (the one follow-up nudge), `nag` (dose re-reminder),
 * `snooze` (from a notification button). [dueAt] is when the thing was originally due.
 */
data class AlarmItem(
  val id: String,
  val title: String,
  val body: String,
  val at: Long,
  val dose: Boolean = false,
  val critical: Boolean = false,
  val kind: String = KIND_MAIN,
  val dueAt: Long = at
) {
  /** Identifies the scheduled alarm. Main alarms keep the bare id, as before 0.3. */
  val key: String get() = keyOf(kind, id)

  fun toJson(): JSONObject = JSONObject()
    .put("id", id)
    .put("title", title)
    .put("body", body)
    .put("at", at)
    .put("dose", dose)
    .put("critical", critical)
    .put("kind", kind)
    .put("dueAt", dueAt)

  companion object {
    const val KIND_MAIN = "main"
    const val KIND_PRE = "pre"
    const val KIND_AGAIN = "again"
    const val KIND_NAG = "nag"
    const val KIND_SNOOZE = "snooze"
    val ALL_KINDS = listOf(KIND_MAIN, KIND_PRE, KIND_AGAIN, KIND_NAG, KIND_SNOOZE)

    fun keyOf(kind: String, id: String): String = if (kind == KIND_MAIN) id else "$kind|$id"

    fun fromJson(o: JSONObject): AlarmItem {
      val at = o.optLong("at", 0L)
      return AlarmItem(
        id = o.optString("id"),
        title = o.optString("title"),
        body = o.optString("body", ""),
        at = at,
        dose = o.optBoolean("dose", false),
        critical = o.optBoolean("critical", false),
        kind = o.optString("kind", KIND_MAIN).ifEmpty { KIND_MAIN },
        dueAt = o.optLong("dueAt", at).let { if (it <= 0L) at else it }
      )
    }
  }
}

/** "22:00".."08:00" style window; may wrap past midnight. */
data class QuietHours(val start: String, val end: String) {
  fun contains(cal: Calendar = Calendar.getInstance()): Boolean {
    val s = minutesOf(start) ?: return false
    val e = minutesOf(end) ?: return false
    if (s == e) return false
    val now = cal.get(Calendar.HOUR_OF_DAY) * 60 + cal.get(Calendar.MINUTE)
    return if (s < e) now in s until e else (now >= s || now < e)
  }

  /** Epoch ms of the next time this window ends, after [fromMs]. */
  fun nextEnd(fromMs: Long): Long? {
    val e = minutesOf(end) ?: return null
    val cal = Calendar.getInstance().apply {
      timeInMillis = fromMs
      set(Calendar.HOUR_OF_DAY, e / 60)
      set(Calendar.MINUTE, e % 60)
      set(Calendar.SECOND, 0)
      set(Calendar.MILLISECOND, 0)
    }
    if (cal.timeInMillis <= fromMs) cal.add(Calendar.DAY_OF_YEAR, 1)
    return cal.timeInMillis
  }

  fun toJson(): JSONObject = JSONObject().put("start", start).put("end", end)

  companion object {
    fun minutesOf(value: String): Int? {
      val parts = value.trim().split(":")
      if (parts.size < 2) return null
      val h = parts[0].toIntOrNull() ?: return null
      val m = parts[1].toIntOrNull() ?: return null
      if (h !in 0..23 || m !in 0..59) return null
      return h * 60 + m
    }
  }
}

data class NativeState(
  val pending: List<PendingItem>,
  val alarms: List<AlarmItem>,
  val persistentNotification: Boolean,
  val nagOnUnlock: Boolean,
  /** Show the unlock screen once after each chime / reminder, instead of on a cooldown. */
  val nagAfterChime: Boolean,
  val nagCooldownMinutes: Int,
  /** Sound a gentle notification every N minutes while things are waiting (0 = off). */
  val chimeMinutes: Int,
  val quietHours: QuietHours?,
  /** "Quiet for today": until this epoch ms, no chimes, no unlock screen, no non-dose nudges (0 = off). */
  val pausedUntil: Long = 0L,
  /** Most unlock screens a day (0 = no limit). */
  val nagDailyCap: Int = 0,
  /** A timed reminder nudges at its time, once more after this many minutes (0 = never), then stays quiet. */
  val nudgeAgainMinutes: Int = 0,
  /** Doses re-remind every N minutes until [doseNagUntilMinutes] after they were due (0 = once). */
  val doseNagMinutes: Int = 0,
  val doseNagUntilMinutes: Int = 0,
  /** Heads-up this many minutes before a timed reminder (0 = off). Not for doses. */
  val preWarnMinutes: Int = 0,
  /** How gentle cues arrive: `sound`, `vibrate` or `silent`. */
  val cueStyle: String = "sound",
  /** The daily weather check-in, "HH:mm", or null when off. */
  val moodTime: String? = null,
  /** "yyyy-MM-dd" of the last check-in: that day isn't asked again. */
  val moodLoggedDay: String? = null,
  /** After a check-in, offer to add what's behind it (opens the app). */
  val moodReasons: Boolean = false
) {
  /** The unlock listener only makes sense when there is something to nudge about. */
  val wantsUnlockService: Boolean get() = nagOnUnlock && pending.isNotEmpty()

  /** The grouped notification is Tend's only one, so it's always up while something is waiting. */
  val wantsPersistentNotification: Boolean get() = pending.isNotEmpty()

  fun isPaused(ms: Long = System.currentTimeMillis()): Boolean = pausedUntil > ms

  /** Things the chime may mention right now (doses and timed reminders whose time has come). */
  fun chimeItems(now: Long = System.currentTimeMillis()): List<PendingItem> = pending.filter { it.chimesAt(now) }

  /**
   * The gentle periodic chime runs while something timed is (or will be) due today. Untimed and
   * older items stay in the silent list. Doses have their own re-reminders on top.
   */
  val wantsChime: Boolean get() = chimeMinutes > 0 && pending.any { it.dose || it.chime || it.dueAt != null }

  val chimeIntervalMs: Long get() = (if (chimeMinutes > 0) chimeMinutes else 60).toLong() * 60_000L

  /** A critical dose is waiting: quiet hours don't apply. */
  val hasCriticalDose: Boolean get() = pending.any { it.dose && it.critical }

  fun isQuietFor(ms: Long = System.currentTimeMillis()): Boolean = !hasCriticalDose && isQuietAt(ms)

  fun isQuietNow(): Boolean = quietHours?.contains() ?: false

  fun isQuietAt(ms: Long): Boolean =
    quietHours?.contains(Calendar.getInstance().apply { timeInMillis = ms }) ?: false

  /** The next chime slot after [fromMs], pushed past "Quiet for today" and quiet hours. */
  fun nextChimeAfter(fromMs: Long): Long {
    var at = fromMs + chimeIntervalMs
    if (isPaused(at)) at = pausedUntil + 60_000L
    if (!isQuietFor(at)) return at
    return quietHours?.nextEnd(at) ?: at
  }

  fun toJson(): JSONObject {
    val p = JSONArray()
    pending.forEach { p.put(it.toJson()) }
    val a = JSONArray()
    alarms.forEach { a.put(it.toJson()) }
    return JSONObject()
      .put("pending", p)
      .put("alarms", a)
      .put("persistentNotification", persistentNotification)
      .put("nagOnUnlock", nagOnUnlock)
      .put("nagAfterChime", nagAfterChime)
      .put("nagCooldownMinutes", nagCooldownMinutes)
      .put("chimeMinutes", chimeMinutes)
      .put("quietHours", quietHours?.toJson() ?: JSONObject.NULL)
      .put("pausedUntil", pausedUntil)
      .put("nagDailyCap", nagDailyCap)
      .put("nudgeAgainMinutes", nudgeAgainMinutes)
      .put("doseNagMinutes", doseNagMinutes)
      .put("doseNagUntilMinutes", doseNagUntilMinutes)
      .put("preWarnMinutes", preWarnMinutes)
      .put("cueStyle", cueStyle)
      .put("moodTime", moodTime ?: JSONObject.NULL)
      .put("moodLoggedDay", moodLoggedDay ?: JSONObject.NULL)
      .put("moodReasons", moodReasons)
  }

  companion object {
    val EMPTY = NativeState(emptyList(), emptyList(), false, false, false, 0, 0, null)
    val CUE_STYLES = setOf("sound", "vibrate", "silent")

    /** Local 23:59:59.999 today, the same as `endOfToday()` in settings.ts. */
    fun endOfToday(now: Long = System.currentTimeMillis()): Long = Calendar.getInstance().apply {
      timeInMillis = now
      set(Calendar.HOUR_OF_DAY, 23)
      set(Calendar.MINUTE, 59)
      set(Calendar.SECOND, 59)
      set(Calendar.MILLISECOND, 999)
    }.timeInMillis

    fun fromJson(o: JSONObject): NativeState {
      val pending = mutableListOf<PendingItem>()
      o.optJSONArray("pending")?.let { arr ->
        for (i in 0 until arr.length()) arr.optJSONObject(i)?.let { pending.add(PendingItem.fromJson(it)) }
      }
      val alarms = mutableListOf<AlarmItem>()
      o.optJSONArray("alarms")?.let { arr ->
        for (i in 0 until arr.length()) arr.optJSONObject(i)?.let { alarms.add(AlarmItem.fromJson(it)) }
      }
      val quiet = o.optJSONObject("quietHours")?.let { q ->
        val s = q.optStringOrNull("start")
        val e = q.optStringOrNull("end")
        if (s != null && e != null) QuietHours(s, e) else null
      }
      return NativeState(
        pending = pending.filter { it.id.isNotEmpty() },
        alarms = alarms.filter { it.id.isNotEmpty() },
        persistentNotification = o.optBoolean("persistentNotification", false),
        nagOnUnlock = o.optBoolean("nagOnUnlock", false),
        nagAfterChime = o.optBoolean("nagAfterChime", false),
        nagCooldownMinutes = o.optInt("nagCooldownMinutes", 0).coerceAtLeast(0),
        chimeMinutes = o.optInt("chimeMinutes", 0).coerceAtLeast(0),
        quietHours = quiet,
        pausedUntil = o.optLong("pausedUntil", 0L).coerceAtLeast(0L),
        nagDailyCap = o.optInt("nagDailyCap", 0).coerceAtLeast(0),
        nudgeAgainMinutes = o.optInt("nudgeAgainMinutes", 0).coerceAtLeast(0),
        doseNagMinutes = o.optInt("doseNagMinutes", 0).coerceAtLeast(0),
        doseNagUntilMinutes = o.optInt("doseNagUntilMinutes", 0).coerceAtLeast(0),
        preWarnMinutes = o.optInt("preWarnMinutes", 0).coerceAtLeast(0),
        cueStyle = o.optString("cueStyle", "sound").let { if (it in CUE_STYLES) it else "sound" },
        moodTime = o.optStringOrNull("moodTime")?.takeIf { QuietHours.minutesOf(it) != null },
        moodLoggedDay = o.optStringOrNull("moodLoggedDay"),
        moodReasons = o.optBoolean("moodReasons", false)
      )
    }
  }
}

/** org.json's optString turns JSON null into the string "null"; this doesn't. */
internal fun JSONObject.optStringOrNull(key: String): String? =
  if (!has(key) || isNull(key)) null else optString(key)
