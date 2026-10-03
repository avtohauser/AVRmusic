// 30-second previews of catalogue tracks (before fetching them to the server). A small player of its
// own: the music pauses while a preview plays.
package space.avthsr.music.player

import kotlinx.coroutines.flow.StateFlow

expect object Preview {
  /** the catalogue track whose preview is playing */
  val playing: StateFlow<Long?>
  fun toggle(id: Long, url: String)
  fun stop()
}
