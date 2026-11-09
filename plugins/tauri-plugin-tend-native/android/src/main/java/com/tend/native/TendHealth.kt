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
 * fitness apps keep their data, plus the phone's own step counter (TendSteps). Read-only, on-device.
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

  /**
   * The phone's own step counter (TendSteps) counts as a steps source too, so steps work without
   * Health Connect, and without waiting for a fitness app to sync into it.
   */
  suspend fun statusJson(context: Context): JSObject {
    val hc = status(context)
    val granted = if (hc == "available" && Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) granted(context) else emptySet()
    val phone = TendSteps.ready(context)
    return JSObject()
      .put("status", if (hc != "available" && phone) "available" else hc)
      .put("healthConnect", hc)
      .put("steps", STEPS in granted || phone)
      .put("workouts", WORKOUTS in granted)
      .put("phoneSteps", phone)
      .put("phoneSensor", TendSteps.hasSensor(context))
  }

  /** Days from the phone's own counter, when Health Connect can't be read. */
  fun readPhoneOnly(context: Context, days: Int): JSObject {
    TendSteps.sample(context)
    val own = TendSteps.days(context)
    val today = LocalDate.now()
    val list = JSArray()
    for (i in (days - 1) downTo 0) {
      val d = today.minusDays(i.toLong()).toString()
      list.put(JSObject().put("date", d).put("steps", own[d] ?: 0L))
    }
    return JSObject().put("days", list).put("workouts", JSArray())
  }

  /** Step totals per local day and workouts over the last `days` days, today included. */
  @RequiresApi(Build.VERSION_CODES.P)
  suspend fun read(context: Context, days: Int): JSObject {
    val client = HealthConnectClient.getOrCreate(context)
    val granted = client.permissionController.getGrantedPermissions()
    val zone = ZoneId.systemDefault()
    val today = LocalDate.now(zone)
    val first = today.minusDays((days - 1).toLong())

    // A fresh reading of the phone's own counter, merged in below (the higher count wins each day).
    TendSteps.sample(context)
    val own = TendSteps.days(context)

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
        val date = b.startTime.toLocalDate().toString()
        val steps = maxOf(b.result[StepsRecord.COUNT_TOTAL] ?: 0L, own[date] ?: 0L)
        dayList.put(JSObject().put("date", date).put("steps", steps))
      }
    } else if (own.isNotEmpty()) {
      for (i in (days - 1) downTo 0) {
        val d = today.minusDays(i.toLong()).toString()
        dayList.put(JSObject().put("date", d).put("steps", own[d] ?: 0L))
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
