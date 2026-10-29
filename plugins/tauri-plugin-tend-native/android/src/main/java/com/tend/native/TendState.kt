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
  val reward: Double
) {
  fun toJson(): JSONObject = JSONObject()
    .put("id", id)
    .put("title", title)
    .put("time", time ?: JSONObject.NULL)
    .put("stepsDone", stepsDone)
    .put("stepsTotal", stepsTotal)
    .put("reward", reward)

  companion object {
    fun fromJson(o: JSONObject) = PendingItem(
      id = o.optString("id"),
      title = o.optString("title"),
      time = o.optStringOrNull("time"),
      stepsDone = o.optInt("stepsDone", 0),
      stepsTotal = o.optInt("stepsTotal", 0),
      reward = o.optDouble("reward", 0.0).let { if (it.isNaN()) 0.0 else it }
    )
  }
}

/** A timed reminder to fire at [at] (epoch ms). */
data class AlarmItem(val id: String, val title: String, val body: String, val at: Long) {
  fun toJson(): JSONObject = JSONObject()
    .put("id", id)
    .put("title", title)
    .put("body", body)
    .put("at", at)

  companion object {
    fun fromJson(o: JSONObject) = AlarmItem(
      id = o.optString("id"),
      title = o.optString("title"),
      body = o.optString("body", ""),
      at = o.optLong("at", 0L)
    )
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
  val nagCooldownMinutes: Int,
  val quietHours: QuietHours?
) {
  /** The unlock listener only makes sense when there is something to nudge about. */
  val wantsUnlockService: Boolean get() = nagOnUnlock && pending.isNotEmpty()

  val wantsPersistentNotification: Boolean get() = persistentNotification && pending.isNotEmpty()

  fun isQuietNow(): Boolean = quietHours?.contains() ?: false

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
      .put("nagCooldownMinutes", nagCooldownMinutes)
      .put("quietHours", quietHours?.toJson() ?: JSONObject.NULL)
  }

  companion object {
    val EMPTY = NativeState(emptyList(), emptyList(), false, false, 0, null)

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
        nagCooldownMinutes = o.optInt("nagCooldownMinutes", 0).coerceAtLeast(0),
        quietHours = quiet
      )
    }
  }
}

/** org.json's optString turns JSON null into the string "null"; this doesn't. */
internal fun JSONObject.optStringOrNull(key: String): String? =
  if (!has(key) || isNull(key)) null else optString(key)
