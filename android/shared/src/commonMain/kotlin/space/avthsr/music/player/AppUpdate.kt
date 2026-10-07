// The app keeps itself up to date: the server says which build is the newest (GitHub releases); a newer
// one becomes a notification and a banner in the app, and — on Wi-Fi, with "update by itself" on — is
// downloaded and installed in the background (Android asks to confirm the first time; after that the
// app updates itself quietly). iPhones get updates the usual way.
package space.avthsr.music.player

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.serialization.Serializable
import space.avthsr.music.Platform
import space.avthsr.music.api.Api
import space.avthsr.music.api.NewsAlerts
import space.avthsr.music.tr

@Serializable
data class AppRelease(val version: String, val url: String, val size: Long = 0, val notes: String = "", val publishedAt: String = "")

expect object Updater {
  /** can this platform install an update by itself */
  val supported: Boolean
  /** download progress 0…1 while an update downloads, else null */
  val progress: StateFlow<Float?>
  /** Downloads [rel] and installs it; [background] — from the periodic check (Wi-Fi only, no screens). */
  suspend fun install(rel: AppRelease, background: Boolean)
}

object AppUpdate {
  /** a newer build than this one, if there is one */
  val available = MutableStateFlow<AppRelease?>(null)
  /** show the update dialog (a tap on the notification) */
  val prompt = MutableStateFlow(false)

  var auto: Boolean
    get() = Api.prefs.getBoolean("update.auto", true)
    set(v) { Api.prefs.edit().putBoolean("update.auto", v).apply() }

  /** "0.1.0.55" newer than "0.1.0.54"? (numbers part by part) */
  fun newer(a: String, b: String): Boolean {
    val x = a.split('.', '-').map { it.toIntOrNull() ?: 0 }
    val y = b.split('.', '-').map { it.toIntOrNull() ?: 0 }
    for (i in 0 until maxOf(x.size, y.size)) {
      val d = x.getOrElse(i) { 0 } - y.getOrElse(i) { 0 }
      if (d != 0) return d > 0
    }
    return false
  }

  /** Asks the server for the newest build; [background] — the periodic check (may install by itself). */
  suspend fun check(background: Boolean) {
    if (!Updater.supported) return
    val rel = runCatching { Api.get<AppRelease?>("/api/app/latest") }.getOrNull() ?: return
    if (!newer(rel.version, Platform.version)) { available.value = null; return }
    available.value = rel
    val p = Api.prefs
    if (p.getString("update.notified", null) != rel.version) {
      p.edit().putString("update.notified", rel.version).apply()
      NewsAlerts.notify("update-${rel.version}", tr("Доступно обновление avr music {}", rel.version), tr("Нажмите, чтобы обновить приложение"), "update")
    }
    if (background && auto) runCatching { Updater.install(rel, background = true) }
  }
}
