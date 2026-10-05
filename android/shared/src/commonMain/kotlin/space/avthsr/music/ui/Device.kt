// Phone features some screens need, each platform its own way: sharing a picture (a recap card) and
// recording a few seconds from the microphone (to recognise a song).
package space.avthsr.music.ui

import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap

/** The system's share sheet with a picture. */
expect fun shareImage(bitmap: ImageBitmap, title: String)

class Recording(val bytes: ByteArray, val fileName: String, val mime: String)

interface Recorder {
  /** Records [ms] of sound from the microphone; [level] gets 0…1 several times a second. Null: no permission, or it failed. */
  suspend fun record(ms: Long, level: (Float) -> Unit): Recording?
}

/** The microphone (asks for the permission the first time). */
@Composable
expect fun rememberRecorder(): Recorder

/** Playing on another device: Google Cast devices on Android, AirPlay on iOS. */
@Composable
expect fun CastButton(tint: Color)

/** Speech to text for the search (the system's recogniser); null where the keyboard's dictation does it (iOS). */
@Composable
expect fun rememberVoiceInput(onResult: (String) -> Unit): (() -> Unit)?
