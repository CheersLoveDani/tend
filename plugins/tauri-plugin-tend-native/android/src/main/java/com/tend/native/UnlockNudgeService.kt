package com.tend.native

import android.app.NotificationManager
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.provider.Settings
import android.util.Log
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat

/**
 * Foreground service whose only job is to hold a runtime receiver for ACTION_USER_PRESENT
 * (which manifest receivers never get). No threads, no timers, no wakelocks: it sleeps until
 * the user unlocks the phone. Its foreground notification *is* the "still to do" notification.
 */
class UnlockNudgeService : Service() {

  companion object {
    @Volatile
    var isRunning: Boolean = false
      private set

    /** @return false when the system refuses to start a foreground service right now. */
    fun start(context: Context): Boolean {
      return try {
        ContextCompat.startForegroundService(context, Intent(context, UnlockNudgeService::class.java))
        true
      } catch (e: IllegalStateException) {
        // ForegroundServiceStartNotAllowedException (API 31+) extends IllegalStateException.
        false
      } catch (e: SecurityException) {
        false
      }
    }

    fun stop(context: Context) {
      context.stopService(Intent(context, UnlockNudgeService::class.java))
    }
  }

  private var unlockReceiver: BroadcastReceiver? = null
  private var startFailed = false

  override fun onCreate() {
    super.onCreate()
    isRunning = true
    val receiver = object : BroadcastReceiver() {
      override fun onReceive(context: Context, intent: Intent) {
        Log.i("TendNative", "unlock broadcast ${intent.action}")
        if (intent.action == Intent.ACTION_USER_PRESENT) onUnlocked()
      }
    }
    // USER_PRESENT is sent by SystemUI (an app uid), so a NOT_EXPORTED receiver never sees it.
    // It's a protected broadcast, so no other app can spoof it.
    ContextCompat.registerReceiver(
      this,
      receiver,
      IntentFilter(Intent.ACTION_USER_PRESENT),
      ContextCompat.RECEIVER_EXPORTED
    )
    unlockReceiver = receiver
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val state = TendStore.loadState(this)
    TendNotifications.ensureChannels(this)
    val notification = TendNotifications.buildPersistent(this, state)
    try {
      val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
        ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
      } else {
        0
      }
      if (type != 0) {
        ServiceCompat.startForeground(this, TendIds.PERSISTENT_NOTIFICATION_ID, notification, type)
      } else {
        startForeground(TendIds.PERSISTENT_NOTIFICATION_ID, notification)
      }
    } catch (e: Exception) {
      // e.g. sticky restart from the background on Android 12+: fall back to the plain notification.
      startFailed = true
      stopSelf()
      return START_NOT_STICKY
    }
    if (!state.wantsUnlockService) {
      stopSelf()
      return START_NOT_STICKY
    }
    return START_STICKY
  }

  override fun onDestroy() {
    unlockReceiver?.let {
      try {
        unregisterReceiver(it)
      } catch (_: IllegalArgumentException) {
      }
    }
    unlockReceiver = null
    isRunning = false
    // Keep the notification on screen, then decide whether it stays.
    ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_DETACH)
    val state = TendStore.loadState(this)
    if (state.wantsUnlockService) {
      // Either the state flipped back while we were stopping, or we couldn't go foreground.
      // Retry once (unless that is exactly what failed); otherwise keep the plain notification.
      if (startFailed || !start(applicationContext)) {
        TendNotifications.postPersistent(applicationContext, state)
      }
    } else {
      TendEngine.refreshPersistentOnly(this)
    }
    super.onDestroy()
  }

  override fun onBind(intent: Intent?): IBinder? = null

  private fun onUnlocked() {
    val state = TendStore.loadState(this)
    if (!state.wantsUnlockService) {
      stopSelf()
      return
    }
    if (state.isQuietNow()) {
      Log.i("TendNative", "unlock: quiet hours")
      return
    }

    val now = System.currentTimeMillis()
    val last = TendStore.lastNagAt(this)
    val cooldownMs = state.nagCooldownMinutes.toLong() * 60_000L
    // `last > now` means the clock went backwards: don't let that block nudges forever.
    if (last in 1..now && now - last < cooldownMs) {
      Log.i("TendNative", "unlock: cooldown")
      return
    }
    TendStore.setLastNagAt(this, now)

    // Background activity starts are allowed when the app holds SYSTEM_ALERT_WINDOW.
    if (Settings.canDrawOverlays(this)) {
      val intent = TendNotifications.launchIntent(this, TendIds.LAUNCH_NAG, null)
      if (intent != null) {
        try {
          startActivity(intent)
          Log.i("TendNative", "unlock: started nag activity")
          return
        } catch (e: Exception) {
          Log.w("TendNative", "unlock: activity start failed", e)
          // fall through to the notification
        }
      }
    }
    val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    val fullScreenAllowed =
      Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE || nm.canUseFullScreenIntent()
    TendNotifications.postNudge(this, state, fullScreen = fullScreenAllowed)
  }
}
