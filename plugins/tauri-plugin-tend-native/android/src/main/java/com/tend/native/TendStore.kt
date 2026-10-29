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

  /** type: "complete" | "snooze" */
  @Synchronized
  fun addPendingAction(ctx: Context, type: String, id: String, at: Long) {
    val arr = peekPendingActions(ctx)
    arr.put(JSONObject().put("type", type).put("id", id).put("at", at))
    prefs(ctx).edit().putString(KEY_PENDING_ACTIONS, arr.toString()).apply()
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
}
