package com.tend.native

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.app.NotificationManager
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.provider.Settings
import android.webkit.WebView
import androidx.activity.result.ActivityResult
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.FileProvider
import app.tauri.PermissionState
import app.tauri.annotation.ActivityCallback
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.Permission
import app.tauri.annotation.PermissionCallback
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import org.json.JSONObject
import java.io.File
import java.lang.ref.WeakReference
import java.net.HttpURLConnection
import java.net.URL

/** Updates are only ever taken from this project's own GitHub releases. */
private const val RELEASE_DOWNLOADS = "https://github.com/CheersLoveDani/tend/releases/download/"

@InvokeArg
class RequestPermissionArgs {
  lateinit var kind: String
}

@InvokeArg
class DownloadUpdateArgs {
  lateinit var url: String
}

@TauriPlugin(
  permissions = [
    Permission(strings = [Manifest.permission.POST_NOTIFICATIONS], alias = TendNativePlugin.ALIAS_NOTIFICATIONS)
  ]
)
class TendNativePlugin(private val activity: Activity) : Plugin(activity) {

  companion object {
    const val ALIAS_NOTIFICATIONS = "notifications"

    private val mainHandler = Handler(Looper.getMainLooper())

    @Volatile
    private var instance: WeakReference<TendNativePlugin>? = null

    /** Tell a live webview that notification buttons were pressed (it should call take_pending_actions). */
    fun notifyPendingActions(context: Context) {
      val plugin = instance?.get() ?: return
      val actions = TendStore.peekPendingActions(context)
      mainHandler.post {
        plugin.trigger("pending-actions", JSObject().put("actions", actions))
      }
    }
  }

  /** The Tend action that opened / last brought the activity forward, until JS takes it. */
  private var launchAction: JSObject? = null

  override fun load(webView: WebView) {
    super.load(webView)
    instance = WeakReference(this)
    TendNotifications.ensureChannels(activity)
    activity.intent?.let { intent ->
      readAction(intent)?.let { synchronized(this) { launchAction = it } }
    }
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    val action = readAction(intent) ?: return
    if (hasListener("action")) {
      trigger("action", action)
    } else {
      synchronized(this) { launchAction = action }
    }
  }

  /** Reads (and strips, so it is handled once) Tend's extras from an intent. */
  private fun readAction(intent: Intent): JSObject? {
    val action = intent.getStringExtra(TendIds.EXTRA_ACTION) ?: return null
    val reminderId = intent.getStringExtra(TendIds.EXTRA_REMINDER_ID)
    intent.removeExtra(TendIds.EXTRA_ACTION)
    intent.removeExtra(TendIds.EXTRA_REMINDER_ID)
    if (action == TendIds.LAUNCH_NAG) TendNotifications.cancelNudge(activity)
    if (action == TendIds.LAUNCH_REMINDER && reminderId != null) TendNotifications.cancelReminder(activity, reminderId)
    val obj = JSObject()
    obj.put("action", action)
    if (reminderId != null) obj.put("reminderId", reminderId)
    return obj
  }

  // ---- commands --------------------------------------------------------------------------------

  @Command
  fun setState(invoke: Invoke) {
    try {
      val raw = invoke.getArgs().optJSONObject("state")
      if (raw == null) {
        invoke.reject("missing `state`")
        return
      }
      val state = NativeState.fromJson(raw)
      TendStore.saveState(activity, state)
      TendEngine.apply(activity, state)
      invoke.resolve()
    } catch (e: Exception) {
      invoke.reject(e.message ?: e.toString())
    }
  }

  @Command
  fun getPermissions(invoke: Invoke) {
    invoke.resolve(permissionsJson())
  }

  @Command
  fun takeLaunchAction(invoke: Invoke) {
    val action = synchronized(this) {
      val a = launchAction
      launchAction = null
      a
    }
    invoke.resolve(action ?: JSObject().put("action", JSONObject.NULL))
  }

  @Command
  fun takePendingActions(invoke: Invoke) {
    invoke.resolve(JSObject().put("actions", TendStore.takePendingActions(activity)))
  }

  /** Fetches the release APK into the cache; resolves once it is complete on disk. */
  @Command
  fun downloadUpdate(invoke: Invoke) {
    val url = try {
      invoke.parseArgs(DownloadUpdateArgs::class.java).url
    } catch (e: Exception) {
      invoke.reject("missing `url`")
      return
    }
    if (!url.startsWith(RELEASE_DOWNLOADS)) {
      invoke.reject("not a Tend release download")
      return
    }
    Thread {
      try {
        val dir = File(activity.cacheDir, "updates").apply { mkdirs() }
        val part = File(dir, "update.apk.part")
        // GitHub answers with a redirect to its file host; HttpURLConnection follows it.
        val connection = URL(url).openConnection() as HttpURLConnection
        connection.connectTimeout = 20_000
        connection.readTimeout = 30_000
        try {
          check(connection.responseCode == 200) { "HTTP ${connection.responseCode}" }
          connection.inputStream.use { input -> part.outputStream().use { input.copyTo(it) } }
        } finally {
          connection.disconnect()
        }
        check(part.renameTo(updateFile())) { "could not save the update" }
        invoke.resolve()
      } catch (e: Exception) {
        invoke.reject(e.message ?: e.toString())
      }
    }.start()
  }

  /** Opens the system installer on the downloaded update. Android asks before replacing the app. */
  @Command
  fun installUpdate(invoke: Invoke) {
    val apk = updateFile()
    if (!apk.exists()) {
      invoke.reject("no update downloaded")
      return
    }
    val uri = FileProvider.getUriForFile(activity, activity.packageName + ".tendupdates", apk)
    val install = Intent(Intent.ACTION_VIEW).apply {
      setDataAndType(uri, "application/vnd.android.package-archive")
      addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    activity.runOnUiThread {
      try {
        activity.startActivity(install)
        invoke.resolve()
      } catch (e: Exception) {
        invoke.reject(e.message ?: e.toString())
      }
    }
  }

  private fun updateFile() = File(File(activity.cacheDir, "updates"), "update.apk")

  @SuppressLint("BatteryLife")
  @Command
  fun requestPermission(invoke: Invoke) {
    val kind = try {
      invoke.parseArgs(RequestPermissionArgs::class.java).kind
    } catch (e: Exception) {
      invoke.reject("missing `kind`")
      return
    }
    val pkg = Uri.parse("package:" + activity.packageName)
    when (kind) {
      "notifications" -> {
        if (areNotificationsEnabled()) {
          resolvePermissions(invoke)
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
          getPermissionState(ALIAS_NOTIFICATIONS) != PermissionState.DENIED
        ) {
          requestPermissionForAlias(ALIAS_NOTIFICATIONS, invoke, "onPermissionResult")
        } else {
          // Permanently denied, or pre-33 (no runtime prompt): the only way is the settings page.
          openSettings(invoke, notificationSettingsIntent())
        }
      }
      "exactAlarm" -> {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !TendAlarms.canScheduleExact(activity)) {
          openSettings(invoke, Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, pkg))
        } else {
          resolvePermissions(invoke)
        }
      }
      "overlay" -> {
        if (!Settings.canDrawOverlays(activity)) {
          openSettings(invoke, Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, pkg))
        } else {
          resolvePermissions(invoke)
        }
      }
      "fullScreenIntent" -> {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE && !canUseFullScreenIntent()) {
          openSettings(invoke, Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, pkg))
        } else {
          resolvePermissions(invoke)
        }
      }
      "batteryUnrestricted" -> {
        if (!isIgnoringBatteryOptimizations()) {
          openSettings(invoke, Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, pkg))
        } else {
          resolvePermissions(invoke)
        }
      }
      else -> invoke.reject("unknown permission kind: $kind")
    }
  }

  @PermissionCallback
  private fun onPermissionResult(invoke: Invoke) {
    resolvePermissions(invoke)
  }

  @ActivityCallback
  private fun onSettingsResult(invoke: Invoke, @Suppress("UNUSED_PARAMETER") result: ActivityResult) {
    // Settings screens never return a meaningful result code: just re-check everything.
    resolvePermissions(invoke)
  }

  // ---- helpers ---------------------------------------------------------------------------------

  private fun resolvePermissions(invoke: Invoke) {
    // A newly granted permission can change what we can do (exact alarms, posting notifications).
    try {
      TendEngine.apply(activity, TendStore.loadState(activity))
    } catch (_: Exception) {
    }
    invoke.resolve(permissionsJson())
  }

  private fun openSettings(invoke: Invoke, intent: Intent) {
    activity.runOnUiThread {
      try {
        startActivityForResult(invoke, intent, "onSettingsResult")
      } catch (e: ActivityNotFoundException) {
        // Some OEM builds lack the specific screen: fall back to the app's details page.
        try {
          startActivityForResult(
            invoke,
            Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + activity.packageName)),
            "onSettingsResult"
          )
        } catch (e2: Exception) {
          resolvePermissions(invoke)
        }
      } catch (e: Exception) {
        resolvePermissions(invoke)
      }
    }
  }

  private fun notificationSettingsIntent(): Intent =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
        .putExtra(Settings.EXTRA_APP_PACKAGE, activity.packageName)
    } else {
      Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + activity.packageName))
    }

  private fun areNotificationsEnabled(): Boolean =
    NotificationManagerCompat.from(activity).areNotificationsEnabled()

  private fun canUseFullScreenIntent(): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) return true
    val nm = activity.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    return nm.canUseFullScreenIntent()
  }

  private fun isIgnoringBatteryOptimizations(): Boolean {
    val pm = activity.getSystemService(Context.POWER_SERVICE) as PowerManager
    return pm.isIgnoringBatteryOptimizations(activity.packageName)
  }

  private fun permissionsJson(): JSObject {
    val obj = JSObject()
    obj.put("notifications", areNotificationsEnabled())
    obj.put("exactAlarm", TendAlarms.canScheduleExact(activity))
    obj.put("overlay", Settings.canDrawOverlays(activity))
    obj.put("fullScreenIntent", canUseFullScreenIntent())
    obj.put("batteryUnrestricted", isIgnoringBatteryOptimizations())
    return obj
  }
}
