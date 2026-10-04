package space.avthsr.music.player

import kotlinx.coroutines.flow.StateFlow

/** Is the phone online? (saved tracks keep playing when it is not) */
expect object Net {
  val online: StateFlow<Boolean>
  /** on Wi-Fi (or any network that is not paid by the megabyte) */
  val unmetered: StateFlow<Boolean>
  fun init()
}
