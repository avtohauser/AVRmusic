@file:OptIn(ExperimentalForeignApi::class)

package space.avthsr.music.player

import kotlinx.cinterop.ExperimentalForeignApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import platform.Network.nw_path_get_status
import platform.Network.nw_path_monitor_create
import platform.Network.nw_path_monitor_set_queue
import platform.Network.nw_path_monitor_set_update_handler
import platform.Network.nw_path_monitor_start
import platform.Network.nw_path_status_satisfied
import platform.darwin.dispatch_get_main_queue

actual object Net {
  private val _online = MutableStateFlow(true)
  actual val online: StateFlow<Boolean> = _online.asStateFlow()
  private var monitor: Any? = null

  actual fun init() {
    if (monitor != null) return
    val m = nw_path_monitor_create()
    nw_path_monitor_set_update_handler(m) { path -> _online.value = nw_path_get_status(path) == nw_path_status_satisfied }
    nw_path_monitor_set_queue(m, dispatch_get_main_queue())
    nw_path_monitor_start(m)
    monitor = m
  }
}
