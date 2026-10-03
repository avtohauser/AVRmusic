@file:OptIn(ExperimentalForeignApi::class)

// Previews on iOS: an AVPlayer of its own; the music pauses while it plays.
package space.avthsr.music.player

import kotlinx.cinterop.ExperimentalForeignApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import platform.AVFoundation.*
import platform.Foundation.NSNotificationCenter
import platform.Foundation.NSOperationQueue
import platform.Foundation.NSURL
import platform.darwin.NSObjectProtocol

actual object Preview {
  private var player: AVPlayer? = null
  private var endObserver: NSObjectProtocol? = null
  private val _playing = MutableStateFlow<Long?>(null)
  actual val playing: StateFlow<Long?> = _playing.asStateFlow()

  actual fun toggle(id: Long, url: String) {
    if (_playing.value == id) return stop()
    stop()
    if (PlayerConn.state.value.playing) PlayerConn.toggle()
    val item = AVPlayerItem(uRL = NSURL(string = url))
    val p = AVPlayer(playerItem = item)
    player = p
    endObserver = NSNotificationCenter.defaultCenter.addObserverForName(AVPlayerItemDidPlayToEndTimeNotification, item, NSOperationQueue.mainQueue) { _ -> stop() }
    p.play()
    _playing.value = id
  }

  actual fun stop() {
    player?.pause()
    player = null
    endObserver?.let { NSNotificationCenter.defaultCenter.removeObserver(it) }
    endObserver = null
    _playing.value = null
  }
}
