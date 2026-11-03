package com.tend.native

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONArray
import org.json.JSONObject

/** All persisted native state lives in one small SharedPreferences file. */
object TendStore {
  private const val PREFS = "tend_native"
  private const val KEY_STATE = "state"
  private const val KEY_SCHEDULED_IDS = "scheduled_alarm_ids"
  private const val KEY_PENDING_ACTIONS = "pending_actions"
  private const val KEY_LAST_NAG_AT = "last_nag_at"
  private const val KEY_LAST_CHIME_AT = "last_chime_at"
  private const val KEY_NEXT_CHIME_AT = "next_chime_at"
  private const val KEY_BACKUP_URI = "backup_uri"
  private const val KEY_EXTRA_ALARMS = "extra_alarms"
  private const val KEY_NAG_DAY = "nag_day"
  private const val KEY_NAG_COUNT = "nag_count"

  private fun prefs(ctx: Context): SharedPreferences =
    ctx.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  @Synchronized
  fun loadState(ctx: Context): NativeState {
    val raw = prefs(ctx).getString(KEY_STATE, null) ?: return NativeState.EMPTY
    return try {
      NativeState.fromJson(JSONObject(raw))
    } catch (e: Exception) {
      NativeState.EMPTY
    }
  }

  @Synchronized
  fun saveState(ctx: Context, state: NativeState) {
    prefs(ctx).edit().putString(KEY_STATE, state.toJson().toString()).apply()
  }

  @Synchronized
  fun scheduledAlarmIds(ctx: Context): Set<String> =
    HashSet(prefs(ctx).getStringSet(KEY_SCHEDULED_IDS, emptySet()) ?: emptySet())

  @Synchronized
  fun saveScheduledAlarmIds(ctx: Context, ids: Set<String>) {
    // Always store a fresh copy: SharedPreferences must not be handed a set it returned.
    prefs(ctx).edit().putStringSet(KEY_SCHEDULED_IDS, HashSet(ids)).apply()
  }

  @Synchronized
  fun addScheduledAlarmId(ctx: Context, id: String) {
    saveScheduledAlarmIds(ctx, scheduledAlarmIds(ctx) + id)
  }

  @Synchronized
  fun removeScheduledAlarmId(ctx: Context, id: String) {
    saveScheduledAlarmIds(ctx, scheduledAlarmIds(ctx) - id)
  }

  /** type: complete | snooze | step | tomorrow | add (with [text]) | quietToday. See native.ts. */
  @Synchronized
  fun addPendingAction(ctx: Context, type: String, id: String, at: Long, text: String? = null) {
    val arr = peekPendingActions(ctx)
    val action = JSONObject().put("type", type).put("id", id).put("at", at)
    if (text != null) action.put("text", text)
    arr.put(action)
    // commit, not apply: a share / quick-add activity may finish and its process die right after.
    prefs(ctx).edit().putString(KEY_PENDING_ACTIONS, arr.toString()).commit()
  }

  /** Follow-up alarms Tend lines up itself (snooze, the second nudge, dose re-reminders). */
  @Synchronized
  fun extraAlarms(ctx: Context): List<AlarmItem> {
    val raw = prefs(ctx).getString(KEY_EXTRA_ALARMS, null) ?: return emptyList()
    return try {
      val arr = JSONArray(raw)
      (0 until arr.length()).mapNotNull { i -> arr.optJSONObject(i)?.let { AlarmItem.fromJson(it) } }
    } catch (e: Exception) {
      emptyList()
    }
  }

  @Synchronized
  fun saveExtraAlarms(ctx: Context, alarms: List<AlarmItem>) {
    val arr = JSONArray()
    alarms.forEach { arr.put(it.toJson()) }
    prefs(ctx).edit().putString(KEY_EXTRA_ALARMS, arr.toString()).apply()
  }

  @Synchronized
  fun putExtraAlarm(ctx: Context, alarm: AlarmItem) {
    saveExtraAlarms(ctx, extraAlarms(ctx).filter { it.key != alarm.key } + alarm)
  }

  @Synchronized
  fun removeExtraAlarms(ctx: Context, predicate: (AlarmItem) -> Boolean) {
    val all = extraAlarms(ctx)
    val kept = all.filterNot(predicate)
    if (kept.size != all.size) saveExtraAlarms(ctx, kept)
  }

  /** How many times the unlock screen has shown on [day] (yyyymmdd). */
  @Synchronized
  fun nagCount(ctx: Context, day: Int): Int {
    val p = prefs(ctx)
    return if (p.getInt(KEY_NAG_DAY, 0) == day) p.getInt(KEY_NAG_COUNT, 0) else 0
  }

  @Synchronized
  fun bumpNagCount(ctx: Context, day: Int) {
    val n = nagCount(ctx, day) + 1
    prefs(ctx).edit().putInt(KEY_NAG_DAY, day).putInt(KEY_NAG_COUNT, n).apply()
  }

  @Synchronized
  fun peekPendingActions(ctx: Context): JSONArray {
    val raw = prefs(ctx).getString(KEY_PENDING_ACTIONS, null) ?: return JSONArray()
    return try {
      JSONArray(raw)
    } catch (e: Exception) {
      JSONArray()
    }
  }

  @Synchronized
  fun takePendingActions(ctx: Context): JSONArray {
    val arr = peekPendingActions(ctx)
    prefs(ctx).edit().remove(KEY_PENDING_ACTIONS).apply()
    return arr
  }

  @Synchronized
  fun lastNagAt(ctx: Context): Long = prefs(ctx).getLong(KEY_LAST_NAG_AT, 0L)

  @Synchronized
  fun setLastNagAt(ctx: Context, at: Long) {
    prefs(ctx).edit().putLong(KEY_LAST_NAG_AT, at).apply()
  }

  /** When a chime or timed reminder last alerted the user. */
  @Synchronized
  fun lastChimeAt(ctx: Context): Long = prefs(ctx).getLong(KEY_LAST_CHIME_AT, 0L)

  @Synchronized
  fun setLastChimeAt(ctx: Context, at: Long) {
    prefs(ctx).edit().putLong(KEY_LAST_CHIME_AT, at).apply()
  }

  @Synchronized
  fun backupUri(ctx: Context): String? = prefs(ctx).getString(KEY_BACKUP_URI, null)

  @Synchronized
  fun setBackupUri(ctx: Context, uri: String?) {
    prefs(ctx).edit().putString(KEY_BACKUP_URI, uri).apply()
  }

  /** When the next chime is scheduled (0 = none). */
  @Synchronized
  fun nextChimeAt(ctx: Context): Long = prefs(ctx).getLong(KEY_NEXT_CHIME_AT, 0L)

  @Synchronized
  fun setNextChimeAt(ctx: Context, at: Long) {
    prefs(ctx).edit().putLong(KEY_NEXT_CHIME_AT, at).apply()
  }
}
