package com.tend.native

import android.Manifest
import android.content.ContentUris
import android.content.Context
import android.content.pm.PackageManager
import android.provider.CalendarContract
import androidx.core.content.ContextCompat
import org.json.JSONArray
import org.json.JSONObject
import java.util.Calendar
import java.util.TimeZone

/**
 * Read-only access to the phone's calendars (Google Calendar syncs into CalendarContract).
 * Shapes match src/lib/calendar.ts. Nothing is written and nothing leaves the device.
 */
object TendCalendar {

  fun granted(ctx: Context): Boolean =
    ContextCompat.checkSelfPermission(ctx, Manifest.permission.READ_CALENDAR) == PackageManager.PERMISSION_GRANTED

  private fun colorOf(argb: Int): String = String.format("#%06x", argb and 0xFFFFFF)

  /** Visible calendars: `{ calendars: [{ id, name, account, color }] }`. */
  fun list(ctx: Context): JSONObject {
    val out = JSONArray()
    val projection = arrayOf(
      CalendarContract.Calendars._ID,
      CalendarContract.Calendars.CALENDAR_DISPLAY_NAME,
      CalendarContract.Calendars.ACCOUNT_NAME,
      CalendarContract.Calendars.CALENDAR_COLOR
    )
    ctx.contentResolver.query(
      CalendarContract.Calendars.CONTENT_URI,
      projection,
      "${CalendarContract.Calendars.VISIBLE} = 1",
      null,
      "${CalendarContract.Calendars.ACCOUNT_NAME} ASC, ${CalendarContract.Calendars.CALENDAR_DISPLAY_NAME} ASC"
    )?.use { c ->
      while (c.moveToNext()) {
        out.put(
          JSONObject()
            .put("id", c.getLong(0).toString())
            .put("name", c.getString(1) ?: "")
            .put("account", c.getString(2) ?: "")
            .put("color", colorOf(c.getInt(3)))
        )
      }
    }
    return JSONObject().put("calendars", out)
  }

  /**
   * Event instances overlapping [from, to) (epoch ms) from calendars [ids] (empty = all visible).
   * Instances expands recurring events. All-day events are stored at UTC midnight; they come
   * back at local midnight so they land on the right day.
   */
  fun events(ctx: Context, from: Long, to: Long, ids: List<String>): JSONObject {
    val out = JSONArray()
    val uri = CalendarContract.Instances.CONTENT_URI.buildUpon().also {
      ContentUris.appendId(it, from)
      ContentUris.appendId(it, to)
    }.build()
    val projection = arrayOf(
      CalendarContract.Instances._ID,
      CalendarContract.Instances.EVENT_ID,
      CalendarContract.Instances.CALENDAR_ID,
      CalendarContract.Instances.TITLE,
      CalendarContract.Instances.BEGIN,
      CalendarContract.Instances.END,
      CalendarContract.Instances.ALL_DAY,
      CalendarContract.Instances.DISPLAY_COLOR,
      CalendarContract.Instances.EVENT_LOCATION
    )
    val numericIds = ids.mapNotNull { it.toLongOrNull() }
    val selection = StringBuilder("${CalendarContract.Instances.VISIBLE} = 1")
    selection.append(" AND (${CalendarContract.Instances.STATUS} IS NULL OR ${CalendarContract.Instances.STATUS} != ${CalendarContract.Instances.STATUS_CANCELED})")
    if (numericIds.isNotEmpty()) {
      selection.append(" AND ${CalendarContract.Instances.CALENDAR_ID} IN (${numericIds.joinToString(",")})")
    }
    ctx.contentResolver.query(uri, projection, selection.toString(), null, "${CalendarContract.Instances.BEGIN} ASC")?.use { c ->
      while (c.moveToNext()) {
        val allDay = c.getInt(6) != 0
        var start = c.getLong(4)
        var end = c.getLong(5)
        if (allDay) {
          start = utcMidnightToLocal(start)
          end = utcMidnightToLocal(end)
        }
        // The instance table can include all-day events that only touch the range in UTC.
        if (end <= from || start >= to) continue
        out.put(
          JSONObject()
            .put("id", "${c.getLong(1)}:${c.getLong(4)}")
            .put("calendarId", c.getLong(2).toString())
            .put("title", c.getString(3)?.ifBlank { null } ?: "(No title)")
            .put("start", start)
            .put("end", end)
            .put("allDay", allDay)
            .put("color", colorOf(c.getInt(7)))
            .put("location", c.getString(8) ?: "")
        )
      }
    }
    return JSONObject().put("events", out)
  }

  private fun utcMidnightToLocal(ms: Long): Long {
    val utc = Calendar.getInstance(TimeZone.getTimeZone("UTC")).apply { timeInMillis = ms }
    return Calendar.getInstance().apply {
      clear()
      set(utc.get(Calendar.YEAR), utc.get(Calendar.MONTH), utc.get(Calendar.DAY_OF_MONTH), 0, 0, 0)
    }.timeInMillis
  }
}
