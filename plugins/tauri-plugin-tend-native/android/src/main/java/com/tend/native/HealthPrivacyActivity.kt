package com.tend.native

import android.app.Activity
import android.os.Bundle
import android.util.TypedValue
import android.widget.ScrollView
import android.widget.TextView

/**
 * Health Connect shows this when someone asks why Tend wants their steps and workouts.
 * It won't offer the permission screen to apps that don't have one.
 */
class HealthPrivacyActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    val pad = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, 24f, resources.displayMetrics).toInt()
    val text = TextView(this).apply {
      setPadding(pad, pad, pad, pad)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 17f)
      setLineSpacing(0f, 1.25f)
      text = """
        How Tend uses your steps and workouts

        Tend reads your daily step count and the workouts you've logged, so moving your body grows your tree with seeds, the same way finishing a reminder does.

        • It only reads. It never writes, changes or deletes anything in Health Connect.
        • It reads while Tend is open, and only the last 7 days.
        • What it keeps is the seeds you earned and a short label, like "6,000 steps today". These stay on your devices and sync only to your own paired computer over your Wi-Fi.
        • Nothing is sent to any server, advertiser or third party.

        You can turn this off any time in Tend's Settings, or remove Tend's access in Health Connect.
      """.trimIndent()
    }
    setContentView(ScrollView(this).apply { addView(text) })
  }
}
