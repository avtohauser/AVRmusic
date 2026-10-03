// What the shared app needs from the phone it runs on. Each platform answers in its own way:
// androidMain with Android's APIs, iosMain with Apple's.
package space.avthsr.music

import androidx.compose.runtime.Composable
import io.ktor.client.HttpClient
import io.ktor.client.HttpClientConfig
import kotlinx.io.Source

expect object Platform {
  /** "Android" or "iOS", for the about line and crash reports */
  val name: String
  /** the app's version */
  val version: String
  /** the phone and its system, for crash reports */
  val device: String
  /** colours taken from the system wallpaper (Android 12+) */
  val hasDynamicColors: Boolean
  /** the app's private folder (offline tracks) */
  val dataDir: String

  /** epoch milliseconds */
  fun nowMs(): Long
  /** the system's animations are switched off */
  fun animationsOff(): Boolean
  /** the system's share sheet with [text] */
  fun share(text: String, title: String)
  fun copy(text: String)
  /** Saves the file at [url] to the phone's downloads (Files on iOS); errors come back as text. */
  fun download(url: String, fileName: String, onError: (String) -> Unit)
}

/** A moment in the phone's own time zone. */
data class LocalTime(val year: Int, val month: Int, val day: Int, val hour: Int, val minute: Int)

expect fun localTime(epochMs: Long): LocalTime

/** Key-value storage for settings and the session (SharedPreferences "avr" on Android, so nothing is lost). */
interface KeyValues {
  fun string(key: String): String?
  fun bool(key: String): Boolean?
  fun int(key: String): Int?
  fun float(key: String): Float?
  /** writes the changes at once; a null value removes the key */
  fun write(changes: Map<String, Any?>)
}

expect fun keyValues(name: String): KeyValues

/** A file the listener picked on the phone, to send to the server. */
class PickedFile(val name: String, val mime: String?, val size: Long, val open: () -> Source)

/** What a picker asks for. */
enum class Pick { IMAGE, VIDEO, AUDIO_FILES, TEXT_FILE, LYRICS_FILE }

/** A system file picker; call the returned function to open it. */
@Composable
expect fun rememberPicker(kind: Pick, onPicked: (List<PickedFile>) -> Unit): () -> Unit

/** The picked photo, cropped to its centre square and scaled to [size] px, as JPEG. */
expect suspend fun squareJpeg(file: PickedFile, size: Int): ByteArray

/** An HTTP client on the platform's own stack (OkHttp on Android, NSURLSession on iOS). */
expect fun httpClient(config: HttpClientConfig<*>.() -> Unit): HttpClient
