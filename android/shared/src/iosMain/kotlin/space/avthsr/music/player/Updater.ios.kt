// iPhones get new versions the usual way (a fresh IPA): nothing to install from inside the app.
package space.avthsr.music.player

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

actual object Updater {
  actual val supported: Boolean = false
  actual val progress: StateFlow<Float?> = MutableStateFlow(null)
  actual suspend fun install(rel: AppRelease, background: Boolean) {}
}
