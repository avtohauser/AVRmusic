package space.avthsr.music.player

import android.content.Context
import space.avthsr.music.Platform
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

actual object Net {
  private val _online = MutableStateFlow(true)
  actual val online: StateFlow<Boolean> = _online.asStateFlow()
  private val up = mutableSetOf<Network>()

  actual fun init() {
    val cm = Platform.context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
    _online.value = cm.activeNetwork?.let { cm.getNetworkCapabilities(it)?.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) } == true
    val request = NetworkRequest.Builder().addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET).build()
    cm.registerNetworkCallback(request, object : ConnectivityManager.NetworkCallback() {
      override fun onAvailable(network: Network) { synchronized(up) { up.add(network); _online.value = true } }
      override fun onLost(network: Network) { synchronized(up) { up.remove(network); _online.value = up.isNotEmpty() } }
    })
  }
}
