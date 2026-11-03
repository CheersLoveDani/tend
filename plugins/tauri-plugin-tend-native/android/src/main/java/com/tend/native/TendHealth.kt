package com.tend.native

import android.content.Context
import android.os.Build
import androidx.annotation.RequiresApi
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.request.AggregateGroupByPeriodRequest
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import app.tauri.plugin.JSArray
import app.tauri.plugin.JSObject
import java.time.Instant
import java.time.LocalDate
import java.time.Period
import java.time.ZoneId

/**
 * Steps and workouts from Health Connect, where Google Fit, Samsung Health, Fitbit and most
 * fitness apps keep their data. Read-only, on-device, and only while Tend is open.
 */
object TendHealth {
  /** The Health Connect app on Android 13 and older (it's part of the system from 14). */
  const val PROVIDER = "com.google.android.apps.healthdata"

  val STEPS = HealthPermission.getReadPermission(StepsRecord::class)
  val WORKOUTS = HealthPermission.getReadPermission(ExerciseSessionRecord::class)
  val PERMISSIONS = setOf(STEPS, WORKOUTS)

  /** `available` | `update` (install or update Health Connect) | `unavailable` | `unsupported` (Android 8 or older). */
  fun status(context: Context): String {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) return "unsupported"
    return when (HealthConnectClient.getSdkStatus(context, PROVIDER)) {
      HealthConnectClient.SDK_AVAILABLE -> "available"
      HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> "update"
      else -> "unavailable"
    }
  }

  @RequiresApi(Build.VERSION_CODES.P)
  suspend fun granted(context: Context): Set<String> =
    HealthConnectClient.getOrCreate(context).permissionController.getGrantedPermissions()

  suspend fun statusJson(context: Context): JSObject {
    val status = status(context)
    val granted = if (status == "available" && Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) granted(context) else emptySet()
    return JSObject()
      .put("status", status)
      .put("steps", STEPS in granted)
      .put("workouts", WORKOUTS in granted)
  }

  /** Step totals per local day and workouts over the last `days` days, today included. */
  @RequiresApi(Build.VERSION_CODES.P)
  suspend fun read(context: Context, days: Int): JSObject {
    val client = HealthConnectClient.getOrCreate(context)
    val granted = client.permissionController.getGrantedPermissions()
    val zone = ZoneId.systemDefault()
    val today = LocalDate.now(zone)
    val first = today.minusDays((days - 1).toLong())

    val dayList = JSArray()
    if (STEPS in granted) {
      // Aggregating lets Health Connect drop the overlap when several apps count the same steps.
      val buckets = client.aggregateGroupByPeriod(
        AggregateGroupByPeriodRequest(
          metrics = setOf(StepsRecord.COUNT_TOTAL),
          timeRangeFilter = TimeRangeFilter.between(first.atStartOfDay(), today.plusDays(1).atStartOfDay()),
          timeRangeSlicer = Period.ofDays(1),
        )
      )
      for (b in buckets) {
        dayList.put(
          JSObject()
            .put("date", b.startTime.toLocalDate().toString())
            .put("steps", b.result[StepsRecord.COUNT_TOTAL] ?: 0L)
        )
      }
    }

    val workouts = JSArray()
    if (WORKOUTS in granted) {
      val records = client.readRecords(
        ReadRecordsRequest(
          ExerciseSessionRecord::class,
          TimeRangeFilter.between(first.atStartOfDay(zone).toInstant(), Instant.now()),
        )
      ).records
      for (r in records) {
        workouts.put(
          JSObject()
            .put("id", r.metadata.id)
            .put("start", r.startTime.toEpochMilli())
            .put("end", r.endTime.toEpochMilli())
            .put("type", r.exerciseType)
            .put("title", r.title ?: "")
            .put("app", r.metadata.dataOrigin.packageName)
        )
      }
    }

    return JSObject().put("days", dayList).put("workouts", workouts)
  }
}
