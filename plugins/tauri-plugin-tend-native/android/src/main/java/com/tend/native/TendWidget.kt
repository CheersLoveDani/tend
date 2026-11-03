package com.tend.native

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.view.View
import android.widget.RemoteViews
import android.widget.Toast
import com.tend.nativeplugin.R

/**
 * Home-screen widget: today's list from the native mirror (doses first), tap a row to finish it
 * (or tick its next step), "+" for quick add. Plain RemoteViews with fixed rows: no service,
 * no Compose, and it works on every Android version Tend supports.
 */
class TendWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    TendWidget.update(context, manager, ids, TendStore.loadState(context))
  }
}

/** A row was tapped. Separate from the (exported) provider so no other app can send it. */
class WidgetTapReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != TendIds.ACTION_WIDGET_TAP) return
    val id = intent.getStringExtra(TendIds.EXTRA_REMINDER_ID) ?: return
    val item = TendStore.loadState(context).pending.find { it.id == id } ?: return
    if (item.hasStepsLeft) {
      TendEngine.step(context, id)
      Toast.makeText(context.applicationContext, "Step done: ${item.title}", Toast.LENGTH_SHORT).show()
    } else {
      TendEngine.complete(context, id)
      Toast.makeText(context.applicationContext, if (item.dose) "Taken: ${item.title}" else "Done: ${item.title}", Toast.LENGTH_SHORT).show()
    }
  }
}

object TendWidget {
  private val ROWS = intArrayOf(
    R.id.tend_widget_row0,
    R.id.tend_widget_row1,
    R.id.tend_widget_row2,
    R.id.tend_widget_row3,
    R.id.tend_widget_row4,
    R.id.tend_widget_row5
  )

  fun updateAll(context: Context, state: NativeState) {
    try {
      val ctx = context.applicationContext
      val manager = AppWidgetManager.getInstance(ctx) ?: return
      val ids = manager.getAppWidgetIds(ComponentName(ctx, TendWidgetProvider::class.java))
      if (ids.isNotEmpty()) update(ctx, manager, ids, state)
    } catch (e: Exception) {
      // Some launchers / work profiles have no widget host: nothing to update.
    }
  }

  fun update(context: Context, manager: AppWidgetManager, ids: IntArray, state: NativeState) {
    val ctx = context.applicationContext
    val views = RemoteViews(ctx.packageName, R.layout.tend_widget)
    val pending = state.pending
    val n = pending.size
    views.setTextViewText(R.id.tend_widget_title, if (n == 0) "Tend" else "Tend · $n waiting")

    TendNotifications.activityPendingIntent(ctx, TendIds.RC_WIDGET_OPEN, TendIds.LAUNCH_OPEN, null)
      ?.let { views.setOnClickPendingIntent(R.id.tend_widget_title, it) }
    views.setOnClickPendingIntent(R.id.tend_widget_add, TendNotifications.quickAddPendingIntent(ctx))

    ROWS.forEachIndexed { i, rowId ->
      val item = pending.getOrNull(i)
      if (item == null) {
        views.setViewVisibility(rowId, View.GONE)
      } else {
        views.setViewVisibility(rowId, View.VISIBLE)
        views.setTextViewText(rowId, "○  " + TendNotifications.lineFor(item))
        views.setOnClickPendingIntent(rowId, tapIntent(ctx, item.id))
      }
    }
    if (n > ROWS.size) {
      views.setViewVisibility(R.id.tend_widget_more, View.VISIBLE)
      views.setTextViewText(R.id.tend_widget_more, "and ${n - ROWS.size} more")
    } else {
      views.setViewVisibility(R.id.tend_widget_more, View.GONE)
    }
    views.setViewVisibility(R.id.tend_widget_empty, if (n == 0) View.VISIBLE else View.GONE)
    manager.updateAppWidget(ids, views)
  }

  private fun tapIntent(ctx: Context, id: String): PendingIntent {
    val intent = Intent(ctx, WidgetTapReceiver::class.java)
      .setAction(TendIds.ACTION_WIDGET_TAP)
      .setData(TendIds.reminderUri("widget", id))
      .putExtra(TendIds.EXTRA_REMINDER_ID, id)
    return PendingIntent.getBroadcast(
      ctx,
      TendIds.stableHash("widget", id),
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
  }
}
