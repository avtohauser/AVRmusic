// The player's cast button on Android: Google Cast devices around (Chromecast, TVs, speakers) in a
// dialog; choosing one moves the music to it (PlaybackService switches to its CastPlayer).
package space.avthsr.music.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.IconButton
import androidx.compose.material3.LoadingIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.mediarouter.media.MediaRouteSelector
import androidx.mediarouter.media.MediaRouter
import com.google.android.gms.cast.CastMediaControlIntent
import com.google.android.gms.cast.framework.CastContext
import space.avthsr.music.res.*
import space.avthsr.music.tr

@Composable
actual fun CastButton(tint: Color) {
  val ctx = LocalContext.current
  // without Google Play services there is no Cast: no button
  val ready = remember { runCatching { CastContext.getSharedInstance(ctx) }.isSuccess }
  if (!ready) return
  val selector = remember {
    MediaRouteSelector.Builder().addControlCategory(CastMediaControlIntent.categoryForCast(CastMediaControlIntent.DEFAULT_MEDIA_RECEIVER_APPLICATION_ID)).build()
  }
  val router = remember { MediaRouter.getInstance(ctx) }
  var open by remember { mutableStateOf(false) }
  var routes by remember { mutableStateOf(emptyList<MediaRouter.RouteInfo>()) }
  var selected by remember { mutableStateOf<MediaRouter.RouteInfo?>(null) }
  DisposableEffect(open) {
    fun refresh() {
      routes = router.routes.filter { !it.isDefault && it.isEnabled && it.matchesSelector(selector) }
      selected = router.selectedRoute.takeIf { !it.isDefault && it.matchesSelector(selector) }
    }
    val cb = object : MediaRouter.Callback() {
      override fun onRouteAdded(router: MediaRouter, route: MediaRouter.RouteInfo) = refresh()
      override fun onRouteRemoved(router: MediaRouter, route: MediaRouter.RouteInfo) = refresh()
      override fun onRouteChanged(router: MediaRouter, route: MediaRouter.RouteInfo) = refresh()
      override fun onRouteSelected(router: MediaRouter, route: MediaRouter.RouteInfo, reason: Int) = refresh()
      override fun onRouteUnselected(router: MediaRouter, route: MediaRouter.RouteInfo, reason: Int) = refresh()
    }
    // looking for devices actively only while the dialog is open
    router.addCallback(selector, cb, if (open) MediaRouter.CALLBACK_FLAG_REQUEST_DISCOVERY or MediaRouter.CALLBACK_FLAG_PERFORM_ACTIVE_SCAN else 0)
    refresh()
    onDispose { router.removeCallback(cb) }
  }
  val cs = MaterialTheme.colorScheme
  IconButton(onClick = { open = true }) { Ico(Res.drawable.ic_cast, tr("Слушать на устройстве"), tint = if (selected != null) cs.primary else tint) }
  if (open) AlertDialog(
    onDismissRequest = { open = false },
    title = { Text(tr("Слушать на устройстве")) },
    text = {
      Column {
        val on = selected
        if (on != null) {
          Text(tr("Сейчас: {}", on.name), style = MaterialTheme.typography.titleMedium, color = cs.primary)
          Spacer(Modifier.size(8.dp))
        }
        routes.filter { it.id != on?.id }.forEach { r ->
          Row(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).clickable { router.selectRoute(r); open = false }.padding(vertical = 10.dp, horizontal = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
          ) {
            Ico(Res.drawable.ic_cast, null, Modifier.size(22.dp), cs.onSurfaceVariant)
            Spacer(Modifier.width(12.dp))
            Column {
              Text(r.name, style = MaterialTheme.typography.bodyLarge)
              r.description?.takeIf { it.isNotBlank() }?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = cs.onSurfaceVariant) }
            }
          }
        }
        if (routes.isEmpty()) Row(verticalAlignment = Alignment.CenterVertically) {
          LoadingIndicator(Modifier.size(36.dp))
          Spacer(Modifier.width(10.dp))
          Text(tr("Ищу Chromecast, телевизоры и колонки с Google Cast в этой сети…"), style = MaterialTheme.typography.bodyMedium, color = cs.onSurfaceVariant)
        }
      }
    },
    confirmButton = {
      if (selected != null) TextButton(onClick = { router.unselect(MediaRouter.UNSELECT_REASON_STOPPED); open = false }) { Text(tr("Вернуть на телефон")) }
      else TextButton(onClick = { open = false }) { Text(tr("Закрыть")) }
    },
  )
}
