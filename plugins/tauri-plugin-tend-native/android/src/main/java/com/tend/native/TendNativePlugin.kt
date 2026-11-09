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
import androidx.health.connect.client.PermissionController
import kotlinx.coroutines.runBlocking
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
class WriteBackupArgs {
  lateinit var data: String
}

@InvokeArg
class HealthReadArgs {
  var days: Int = 7
}

@InvokeArg
class DownloadUpdateArgs {
  lateinit var url: String
}

@InvokeArg
class CalendarEventsArgs {
  var from: Long = 0
  var to: Long = 0
  var ids: Array<String> = emptyArray()
}

@TauriPlugin(
  permissions = [
    Permission(strings = [Manifest.permission.POST_NOTIFICATIONS], alias = TendNativePlugin.ALIAS_NOTIFICATIONS),
    Permission(strings = [Manifest.permission.READ_CALENDAR], alias = TendNativePlugin.ALIAS_CALENDAR),
    Permission(strings = [Manifest.permission.ACTIVITY_RECOGNITION], alias = TendNativePlugin.ALIAS_ACTIVITY)
  ]
)
class TendNativePlugin(private val activity: Activity) : Plugin(activity) {

  companion object {
    const val ALIAS_NOTIFICATIONS = "notifications"
    const val ALIAS_ACTIVITY = "activity"
    const val ALIAS_CALENDAR = "calendar"

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
    TendShortcuts.publish(activity)
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
      var state = NativeState.fromJson(raw)
      // A check-in tapped in the notification may not have reached the app yet: keep the newer day.
      val loggedNatively = TendStore.loadState(activity).moodLoggedDay
      if (loggedNatively != null && loggedNatively > (state.moodLoggedDay ?: "")) state = state.copy(moodLoggedDay = loggedNatively)
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

  // ---- backups ---------------------------------------------------------------------------------
  // One file the user picks once (Google Drive, Files, anywhere with a document provider).
  // Tend overwrites it each time; Drive keeps its own version history.

  private fun displayName(uri: Uri): String? = try {
    activity.contentResolver.query(uri, arrayOf(android.provider.OpenableColumns.DISPLAY_NAME), null, null, null)?.use {
      if (it.moveToFirst()) it.getString(0) else null
    }
  } catch (e: Exception) {
    null
  }

  private fun backupUri(): Uri? {
    val saved = TendStore.backupUri(activity) ?: return null
    val uri = Uri.parse(saved)
    // Permission can be revoked (file deleted, account removed): treat that as "not set".
    val held = activity.contentResolver.persistedUriPermissions.any { it.uri == uri && it.isWritePermission }
    return if (held) uri else null
  }

  @Command
  fun chooseBackupFile(invoke: Invoke) {
    val intent = Intent(Intent.ACTION_CREATE_DOCUMENT)
      .addCategory(Intent.CATEGORY_OPENABLE)
      .setType("application/octet-stream")
      .putExtra(Intent.EXTRA_TITLE, "tend-backup.tendbak")
    try {
      startActivityForResult(invoke, intent, "onBackupFileChosen")
    } catch (e: ActivityNotFoundException) {
      invoke.reject("No file picker on this phone")
    }
  }

  @ActivityCallback
  private fun onBackupFileChosen(invoke: Invoke, result: ActivityResult) {
    val uri = result.data?.data
    if (result.resultCode != Activity.RESULT_OK || uri == null) {
      invoke.resolve(JSObject().put("name", backupUri()?.let { displayName(it) } ?: JSONObject.NULL))
      return
    }
    try {
      activity.contentResolver.takePersistableUriPermission(
        uri,
        Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION
      )
    } catch (e: SecurityException) {
      invoke.reject("That location can't be written to later. Pick another one.")
      return
    }
    TendStore.setBackupUri(activity, uri.toString())
    invoke.resolve(JSObject().put("name", displayName(uri) ?: "your backup file"))
  }

  @Command
  fun backupTarget(invoke: Invoke) {
    invoke.resolve(JSObject().put("name", backupUri()?.let { displayName(it) ?: "your backup file" } ?: JSONObject.NULL))
  }

  @Command
  fun writeBackup(invoke: Invoke) {
    val data = try {
      invoke.parseArgs(WriteBackupArgs::class.java).data
    } catch (e: Exception) {
      invoke.reject("missing `data`")
      return
    }
    val uri = backupUri()
    if (uri == null) {
      invoke.reject("Choose where to keep backups first")
      return
    }
    // Cloud providers can be slow: never write on the main thread.
    Thread {
      try {
        val bytes = android.util.Base64.decode(data, android.util.Base64.DEFAULT)
        val out = activity.contentResolver.openOutputStream(uri, "wt") ?: throw IllegalStateException("can't open")
        out.use { it.write(bytes) }
        invoke.resolve()
      } catch (e: Exception) {
        invoke.reject("Couldn't save the backup: ${e.message ?: e.javaClass.simpleName}")
      }
    }.start()
  }

  @Command
  fun openBackupFile(invoke: Invoke) {
    val intent = Intent(Intent.ACTION_OPEN_DOCUMENT)
      .addCategory(Intent.CATEGORY_OPENABLE)
      .setType("*/*")
    try {
      startActivityForResult(invoke, intent, "onBackupFileOpened")
    } catch (e: ActivityNotFoundException) {
      invoke.reject("No file picker on this phone")
    }
  }

  @ActivityCallback
  private fun onBackupFileOpened(invoke: Invoke, result: ActivityResult) {
    val uri = result.data?.data
    if (result.resultCode != Activity.RESULT_OK || uri == null) {
      invoke.resolve(JSObject().put("data", JSONObject.NULL))
      return
    }
    Thread {
      try {
        val bytes = activity.contentResolver.openInputStream(uri)?.use { it.readBytes() }
          ?: throw IllegalStateException("can't open")
        invoke.resolve(
          JSObject()
            .put("name", displayName(uri) ?: JSONObject.NULL)
            .put("data", android.util.Base64.encodeToString(bytes, android.util.Base64.NO_WRAP))
        )
      } catch (e: Exception) {
        invoke.reject("Couldn't read that file: ${e.message ?: e.javaClass.simpleName}")
      }
    }.start()
  }

  // ---- Health Connect (steps and workouts) -------------------------------------------------------

  /** Runs a Health Connect call off the main thread and resolves with what it returns. */
  private fun health(invoke: Invoke, work: suspend () -> JSObject) {
    Thread {
      try {
        invoke.resolve(runBlocking { work() })
      } catch (e: Exception) {
        invoke.reject("Health Connect: ${e.message ?: e.javaClass.simpleName}")
      }
    }.start()
  }

  @Command
  fun healthStatus(invoke: Invoke) = health(invoke) { TendHealth.statusJson(activity) }

  /** Asks for steps and workouts; installs or updates Health Connect first if that's what's missing. */
  @Command
  fun healthRequest(invoke: Invoke) {
    when (TendHealth.status(activity)) {
      "available" -> {
        val intent = PermissionController.createRequestPermissionResultContract()
          .createIntent(activity, TendHealth.PERMISSIONS)
        try {
          startActivityForResult(invoke, intent, "onHealthResult")
        } catch (e: ActivityNotFoundException) {
          invoke.reject("Health Connect couldn't be opened")
        }
      }
      "update" -> {
        val store = Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=${TendHealth.PROVIDER}&url=healthconnect%3A%2F%2Fonboarding"))
          .setPackage("com.android.vending")
        val web = Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/apps/details?id=${TendHealth.PROVIDER}"))
        activity.runOnUiThread {
          try {
            startActivityForResult(invoke, store, "onHealthResult")
          } catch (e: ActivityNotFoundException) {
            try {
              startActivityForResult(invoke, web, "onHealthResult")
            } catch (e2: Exception) {
              health(invoke) { TendHealth.statusJson(activity) }
            }
          }
        }
      }
      // No Health Connect: the phone's own step counter can still count.
      else -> askForPhoneSteps(invoke)
    }
  }

  @ActivityCallback
  private fun onHealthResult(invoke: Invoke, @Suppress("UNUSED_PARAMETER") result: ActivityResult) {
    // Then the phone's own counter, so steps don't wait for a fitness app to sync.
    askForPhoneSteps(invoke)
  }

  /** "Physical activity" (Android 10+) lets Tend read the phone's step counter in the background. */
  private fun askForPhoneSteps(invoke: Invoke) {
    if (TendSteps.hasSensor(activity) && !TendSteps.permitted(activity) &&
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q &&
      getPermissionState(ALIAS_ACTIVITY) != PermissionState.DENIED
    ) {
      requestPermissionForAlias(ALIAS_ACTIVITY, invoke, "onActivityPermission")
    } else {
      onActivityPermission(invoke)
    }
  }

  @PermissionCallback
  private fun onActivityPermission(invoke: Invoke) {
    TendSteps.schedule(activity.applicationContext)
    // Re-check rather than trust the results: people can grant one and not the other.
    health(invoke) { TendHealth.statusJson(activity) }
  }

  @Command
  fun healthRead(invoke: Invoke) {
    val days = try {
      invoke.parseArgs(HealthReadArgs::class.java).days.coerceIn(1, 30)
    } catch (e: Exception) {
      7
    }
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P || TendHealth.status(activity) != "available") {
      if (TendSteps.ready(activity)) health(invoke) { TendHealth.readPhoneOnly(activity, days) }
      else invoke.reject("Health Connect isn't available")
      return
    }
    health(invoke) { TendHealth.read(activity, days) }
  }

  // ---- calendar (read-only) ---------------------------------------------------------------------

  private fun calendarStatusJson(): JSObject =
    JSObject().put("status", if (TendCalendar.granted(activity)) "granted" else "denied")

  @Command
  fun calendarStatus(invoke: Invoke) {
    invoke.resolve(calendarStatusJson())
  }

  @Command
  fun calendarRequest(invoke: Invoke) {
    if (TendCalendar.granted(activity)) {
      invoke.resolve(calendarStatusJson())
    } else if (getPermissionState(ALIAS_CALENDAR) != PermissionState.DENIED) {
      requestPermissionForAlias(ALIAS_CALENDAR, invoke, "onCalendarPermission")
    } else {
      // "Don't ask again": only the app's settings page can change it now.
      activity.runOnUiThread {
        try {
          startActivityForResult(
            invoke,
            Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + activity.packageName)),
            "onCalendarSettings"
          )
        } catch (e: Exception) {
          invoke.resolve(calendarStatusJson())
        }
      }
    }
  }

  @PermissionCallback
  private fun onCalendarPermission(invoke: Invoke) {
    invoke.resolve(calendarStatusJson())
  }

  @ActivityCallback
  private fun onCalendarSettings(invoke: Invoke, @Suppress("UNUSED_PARAMETER") result: ActivityResult) {
    invoke.resolve(calendarStatusJson())
  }

  /** Runs a calendar query off the main thread. */
  private fun calendarQuery(invoke: Invoke, work: () -> JSONObject) {
    if (!TendCalendar.granted(activity)) {
      invoke.reject("Calendar access is off")
      return
    }
    Thread {
      try {
        invoke.resolve(JSObject(work().toString()))
      } catch (e: Exception) {
        invoke.reject("Couldn't read the calendar: ${e.message ?: e.javaClass.simpleName}")
      }
    }.start()
  }

  @Command
  fun calendarList(invoke: Invoke) = calendarQuery(invoke) { TendCalendar.list(activity) }

  @Command
  fun calendarEvents(invoke: Invoke) {
    val args = try {
      invoke.parseArgs(CalendarEventsArgs::class.java)
    } catch (e: Exception) {
      invoke.reject("missing `from` / `to`")
      return
    }
    if (args.to <= args.from) {
      invoke.resolve(JSObject().put("events", org.json.JSONArray()))
      return
    }
    calendarQuery(invoke) { TendCalendar.events(activity, args.from, args.to, args.ids.toList()) }
  }

  /** Back on the app's home screen: leave like Android does, keeping the app alive. */
  @Command
  fun moveToBack(invoke: Invoke) {
    activity.runOnUiThread { activity.moveTaskToBack(true) }
    invoke.resolve()
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
      // The phone's own step counter. Resolves with the steps status rather than the permission list.
      "activity" -> askForPhoneSteps(invoke)
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
