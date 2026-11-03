package com.tend.native

import android.annotation.SuppressLint
import android.app.PendingIntent
import android.content.ComponentName
import android.content.Context
import android.os.Build
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService

/**
 * Quick Settings tile: shows what's next ("Next: meds 09:00") and opens the native quick-add
 * dialog on tap. Active mode: it only updates when [requestUpdate] asks (on every state change).
 */
class TendTileService : TileService() {

  companion object {
    fun requestUpdate(context: Context) {
      try {
        requestListeningState(context, ComponentName(context, TendTileService::class.java))
      } catch (e: Exception) {
        // Not added, or the system UI refuses right now: it reads fresh state when shown.
      }
    }
  }

  override fun onStartListening() {
    super.onStartListening()
    val tile = qsTile ?: return
    val next = TendStore.loadState(this).pending.firstOrNull()
    val nextText = next?.let { (if (it.dose) "Take " else "") + it.title + (it.time?.let { t -> " $t" } ?: "") }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      tile.label = "Tend"
      tile.subtitle = nextText?.let { "Next: $it" } ?: "Nothing waiting"
    } else {
      tile.label = nextText ?: "Tend"
    }
    tile.contentDescription = "Tend quick add. " + (nextText?.let { "Next: $it" } ?: "Nothing waiting")
    tile.state = if (next != null) Tile.STATE_ACTIVE else Tile.STATE_INACTIVE
    tile.updateTile()
  }

  override fun onClick() {
    super.onClick()
    if (isLocked) unlockAndRun { openQuickAdd() } else openQuickAdd()
  }

  @SuppressLint("StartActivityAndCollapseDeprecated")
  private fun openQuickAdd() {
    val intent = QuickAddActivity.intent(this)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      startActivityAndCollapse(
        PendingIntent.getActivity(this, TendIds.RC_QUICK_ADD, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
      )
    } else {
      @Suppress("DEPRECATION")
      startActivityAndCollapse(intent)
    }
  }
}
