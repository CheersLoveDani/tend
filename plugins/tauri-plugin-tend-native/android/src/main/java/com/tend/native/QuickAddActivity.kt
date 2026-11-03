package com.tend.native

import android.app.Activity
import android.app.AlertDialog
import android.content.Context
import android.content.DialogInterface
import android.content.Intent
import android.content.res.Configuration
import android.os.Bundle
import android.text.InputType
import android.view.ContextThemeWrapper
import android.view.WindowManager
import android.view.inputmethod.EditorInfo
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.Toast

/**
 * A tiny native "add to Tend" dialog over whatever is on screen. Opened by the share sheet
 * (text/plain), the Quick Settings tile, the "Quick add" app shortcut and the widget's "+".
 * It never opens the app: the text is queued as an `add` action and parsed ("call mum at 6")
 * the next time the app runs (straight away if it's already running).
 */
class QuickAddActivity : Activity() {

  companion object {
    fun intent(ctx: Context): Intent =
      Intent(ctx, QuickAddActivity::class.java)
        .setAction(TendIds.ACTION_QUICK_ADD)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
  }

  private var dialog: AlertDialog? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    val shared = sharedText(intent)
    val night = (resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES
    val theme = if (night) android.R.style.Theme_DeviceDefault_Dialog_Alert else android.R.style.Theme_DeviceDefault_Light_Dialog_Alert
    val themed = ContextThemeWrapper(this, theme)
    val density = resources.displayMetrics.density

    val input = EditText(themed).apply {
      setText(shared)
      setSelection(text.length)
      hint = "e.g. call mum at 6"
      inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_CAP_SENTENCES or InputType.TYPE_TEXT_FLAG_MULTI_LINE
      imeOptions = EditorInfo.IME_ACTION_DONE
      setRawInputType(InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_CAP_SENTENCES)
      maxLines = 5
    }
    val box = FrameLayout(themed).apply {
      val pad = (20 * density).toInt()
      setPadding(pad, (8 * density).toInt(), pad, 0)
      addView(input)
    }

    val d = AlertDialog.Builder(this, theme)
      .setTitle(if (shared.isNotEmpty()) "Add to Tend" else "Quick add")
      .setMessage("Say when if you like. Tend works it out.")
      .setView(box)
      .setPositiveButton("Add", null)
      .setNegativeButton("Cancel", null)
      .setOnDismissListener { finish() }
      .create()

    fun submit() {
      val text = input.text?.toString()?.trim().orEmpty()
      if (text.isEmpty()) {
        input.error = "Type a few words first"
        return
      }
      TendEngine.add(this, text)
      Toast.makeText(applicationContext, "Added to Tend", Toast.LENGTH_SHORT).show()
      d.dismiss()
    }

    d.setOnShowListener { d.getButton(DialogInterface.BUTTON_POSITIVE).setOnClickListener { submit() } }
    input.setOnEditorActionListener { _, actionId, _ ->
      if (actionId == EditorInfo.IME_ACTION_DONE) {
        submit()
        true
      } else {
        false
      }
    }
    d.window?.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_VISIBLE)
    dialog = d
    d.show()
    input.requestFocus()
  }

  override fun onDestroy() {
    dialog?.setOnDismissListener(null)
    dialog?.dismiss()
    dialog = null
    super.onDestroy()
  }

  /** Shared text, with the subject in front when apps send one (e.g. a page title before its link). */
  private fun sharedText(intent: Intent?): String {
    if (intent?.action != Intent.ACTION_SEND) return ""
    val text = intent.getCharSequenceExtra(Intent.EXTRA_TEXT)?.toString()?.trim().orEmpty()
    val subject = intent.getStringExtra(Intent.EXTRA_SUBJECT)?.trim().orEmpty()
    return when {
      subject.isEmpty() -> text
      text.isEmpty() -> subject
      text.contains(subject) -> text
      else -> "$subject $text"
    }.take(2000)
  }
}
