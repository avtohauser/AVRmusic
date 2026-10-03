package space.avthsr.music.ui

import android.Manifest
import android.os.Build
import androidx.activity.compose.PredictiveBackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.rememberUpdatedState
import space.avthsr.music.api.Api
import kotlin.coroutines.cancellation.CancellationException

@Composable
actual fun PlayerBackHandler(enabled: Boolean, onProgress: (Float) -> Unit, onBack: () -> Unit, onCancel: () -> Unit) {
  val progress = rememberUpdatedState(onProgress)
  val back = rememberUpdatedState(onBack)
  val cancel = rememberUpdatedState(onCancel)
  PredictiveBackHandler(enabled = enabled) { events ->
    try {
      events.collect { progress.value(it.progress) }
      back.value()
    } catch (e: CancellationException) {
      cancel.value()
      throw e
    }
  }
}

/** Android 13+: notifications need the listener's yes. */
@Composable
actual fun AskNotificationsOnce() {
  val ask = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { }
  LaunchedEffect(Unit) {
    if (Build.VERSION.SDK_INT >= 33 && !Api.prefs.getBoolean("notify.asked", false)) {
      Api.prefs.edit().putBoolean("notify.asked", true).apply()
      ask.launch(Manifest.permission.POST_NOTIFICATIONS)
    }
  }
}
